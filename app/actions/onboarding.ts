"use server";
// Onboarding actions: create a goal, syllabus → draft graph → confirm, PYQ weightage, notes.
// Thin wrappers: zod-validated primitives in, requireGoal ownership check, rate limits on the
// AI-heavy steps, upload checks (size, PDF magic bytes, text caps) BEFORE any parsing, and
// ActionResult out — raw errors are logged, never sent to the client. PDFs arrive either in the
// body (up to 4 MB) or, with Vercel Blob, as the URL of a direct browser upload (up to 20 MB).
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { DraftGraphSchema } from "@/lib/ai/schemas";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { requireGoal, requireUser } from "@/lib/session";
import {
  countGoals,
  createGoalRecord,
  confirmGraph,
  createUploadToken,
  deleteNotes,
  discardUpload,
  loadDirectUpload,
  MAX_TEXT_CHARS,
  OnboardingError,
  remapPyq,
  runNotesUpload,
  runPyqMapping,
  runSyllabusExtraction,
  type UploadInput,
} from "@/lib/services/onboarding";
import { addDaysIso, examDateFromIso, makeGoalSchema } from "@/components/onboarding/goal-schema";
import { isPdfBytes, MAX_INLINE_UPLOAD_BYTES, MAX_INLINE_UPLOAD_MB } from "@/components/onboarding/model";
import type { ActionResult } from "@/lib/types";
import type {
  ConfirmResult,
  ExtractResult,
  NotesResourceView,
  PyqView,
  UploadKind,
  UploadToken,
} from "@/components/onboarding/types";

const MAX_GOALS_PER_USER = 10;
const Id = z.string().trim().min(1).max(64);
const Kind = z.enum(["syllabus", "pyq", "notes"]);

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  unstable_rethrow(err); // let redirect()/notFound() through
  if (err instanceof OnboardingError || err instanceof RateLimitError) return { ok: false, error: err.message };
  console.error("[onboarding]", err);
  return { ok: false, error: fallback };
}

/**
 * FormData → validated UploadInput. Throws OnboardingError. One of: "blobUrl" (+ "fileName") of a
 * direct upload to Vercel Blob, "file" (a PDF in the body), or "text".
 */
async function readUpload(form: FormData, goalId: string, kind: UploadKind): Promise<UploadInput> {
  const blobUrl = form.get("blobUrl");
  const file = form.get("file");
  const text = form.get("text");
  if (typeof blobUrl === "string" && blobUrl) {
    const fileName = form.get("fileName");
    return { file: await loadDirectUpload(goalId, kind, blobUrl, typeof fileName === "string" ? fileName : "") };
  }
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_INLINE_UPLOAD_BYTES) {
      throw new OnboardingError(`That PDF is over ${MAX_INLINE_UPLOAD_MB} MB. Split it, or paste the text instead.`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPdfBytes(bytes)) throw new OnboardingError("That file isn't a PDF.");
    return { file: { name: file.name, bytes } };
  }
  if (typeof text === "string" && text.trim()) {
    if (text.length > MAX_TEXT_CHARS[kind]) {
      throw new OnboardingError(`That text is too long (max ${MAX_TEXT_CHARS[kind].toLocaleString("en-IN")} characters).`);
    }
    return { text };
  }
  throw new OnboardingError("Upload a PDF or paste the text.");
}

/** Token for one direct browser → Vercel Blob PDF upload (UploadField, when Blob is set up). */
export async function createUploadTokenAction(
  goalId: string,
  kind: UploadKind,
  fileName: string,
): Promise<ActionResult<UploadToken>> {
  const parsed = z.object({ goalId: Id, kind: Kind, fileName: z.string().max(500) }).safeParse({ goalId, kind, fileName });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const { user, goal } = await requireGoal(parsed.data.goalId);
    await enforceRateLimit("upload", user.id);
    return { ok: true, data: await createUploadToken(goal.id, parsed.data.kind, parsed.data.fileName) };
  } catch (err) {
    return fail(err, "Couldn't start the upload. Try again.");
  }
}

// ── goal ────────────────────────────────────────────────────────────────────

export async function createGoalAction(input: {
  subject: string;
  examDate: string;
  minutesPerDay: number;
}): Promise<ActionResult<{ goalId: string }>> {
  // Lenient lower bound (yesterday, server time) so a student in another timezone isn't blocked.
  const parsed = makeGoalSchema(addDaysIso(new Date(), -1)).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  try {
    const user = await requireUser();
    if ((await countGoals(user.id)) >= MAX_GOALS_PER_USER) {
      return { ok: false, error: `You can have up to ${MAX_GOALS_PER_USER} subjects. Delete one in Settings first.` };
    }
    await enforceRateLimit("goalCreate", user.id);
    const examDate = examDateFromIso(parsed.data.examDate);
    if (!examDate) return { ok: false, error: "Pick a valid date." };
    const goalId = await createGoalRecord(user.id, { ...parsed.data, examDate });
    revalidatePath("/", "layout");
    return { ok: true, data: { goalId } };
  } catch (err) {
    return fail(err, "Couldn't create the subject. Try again.");
  }
}

// ── syllabus → graph ────────────────────────────────────────────────────────

export async function extractSyllabusAction(goalId: string, form: FormData): Promise<ActionResult<ExtractResult>> {
  const id = Id.safeParse(goalId);
  if (!id.success) return { ok: false, error: "Invalid subject." };
  let upload: UploadInput | undefined;
  try {
    const { user, goal } = await requireGoal(id.data);
    if (goal.status === "active") return { ok: false, error: "This subject is already set up." };
    upload = await readUpload(form, goal.id, "syllabus");
    await enforceRateLimit("aiHeavy", user.id);
    return { ok: true, data: await runSyllabusExtraction(goal, upload) };
  } catch (err) {
    await discardUpload(upload);
    return fail(err, "Couldn't read that syllabus. Try again, or paste the text instead.");
  }
}

/** Draft from the client: schema-checked, bounded, keys unique. */
const ConfirmInput = DraftGraphSchema.superRefine((d, ctx) => {
  const keys = new Set<string>();
  for (const c of d.concepts) {
    if (keys.has(c.key)) ctx.addIssue({ code: "custom", message: "Duplicate concept key." });
    keys.add(c.key);
  }
});

export async function confirmGraphAction(goalId: string, draft: unknown): Promise<ActionResult<ConfirmResult>> {
  const id = Id.safeParse(goalId);
  const parsed = ConfirmInput.safeParse(draft);
  if (!id.success) return { ok: false, error: "Invalid subject." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "The concept list is invalid." };
  try {
    const { goal } = await requireGoal(id.data);
    const result = await confirmGraph(goal, parsed.data);
    revalidatePath(`/goal/${goal.id}/setup`);
    return { ok: true, data: result };
  } catch (err) {
    return fail(err, "Couldn't save the concept graph. Try again.");
  }
}

// ── PYQs ────────────────────────────────────────────────────────────────────

export async function uploadPyqAction(goalId: string, form: FormData): Promise<ActionResult<PyqView>> {
  const id = Id.safeParse(goalId);
  if (!id.success) return { ok: false, error: "Invalid subject." };
  let upload: UploadInput | undefined;
  try {
    const { user, goal } = await requireGoal(id.data);
    upload = await readUpload(form, goal.id, "pyq");
    await enforceRateLimit("aiHeavy", user.id);
    return { ok: true, data: await runPyqMapping(goal, upload) };
  } catch (err) {
    await discardUpload(upload);
    return fail(err, "Couldn't map those papers. Try again, or paste the questions as text.");
  }
}

export async function remapPyqAction(goalId: string, questionId: string, conceptId: string): Promise<ActionResult<PyqView>> {
  const parsed = z.object({ goalId: Id, questionId: Id, conceptId: Id }).safeParse({ goalId, questionId, conceptId });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const { goal } = await requireGoal(parsed.data.goalId);
    return { ok: true, data: await remapPyq(goal, parsed.data.questionId, parsed.data.conceptId) };
  } catch (err) {
    return fail(err, "Couldn't move that question. Try again.");
  }
}

// ── notes ───────────────────────────────────────────────────────────────────

export async function uploadNotesAction(goalId: string, form: FormData): Promise<ActionResult<NotesResourceView>> {
  const id = Id.safeParse(goalId);
  if (!id.success) return { ok: false, error: "Invalid subject." };
  let upload: UploadInput | undefined;
  try {
    const { user, goal } = await requireGoal(id.data);
    upload = await readUpload(form, goal.id, "notes");
    await enforceRateLimit("aiHeavy", user.id);
    return { ok: true, data: await runNotesUpload(goal, upload) };
  } catch (err) {
    await discardUpload(upload);
    return fail(err, "Couldn't index these notes. Try again, or paste the text instead.");
  }
}

export async function deleteNotesAction(goalId: string, resourceId: string): Promise<ActionResult> {
  const parsed = z.object({ goalId: Id, resourceId: Id }).safeParse({ goalId, resourceId });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const { goal } = await requireGoal(parsed.data.goalId);
    await deleteNotes(goal, parsed.data.resourceId);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err, "Couldn't remove that file. Try again.");
  }
}

