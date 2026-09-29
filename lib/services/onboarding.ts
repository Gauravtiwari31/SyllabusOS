// Onboarding: goal creation, syllabus → concept graph, PYQ weightage, notes grounding.
// Server-only (not marked "server-only" so tsx scripts can import it). Pure logic lives in
// components/onboarding/model.ts so the graph editor can reuse it on the client.
import { del, get, head, put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { db } from "@/lib/db";
import { blobEnabled } from "@/lib/env";
import { aiMode, extractSyllabus, mapPyqs, type ConceptRef } from "@/lib/ai";
import { extractPdfPages, indexNotes } from "@/lib/rag";
import { daysUntil } from "@/lib/services/core";
import type { Goal } from "@/lib/generated/prisma/client";
import type { DraftGraph } from "@/lib/ai/schemas";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  bestConceptForText,
  blobFileName,
  isPdfBytes,
  safeFileName,
  draftFromConcepts,
  planConfirm,
  pyqWeightage,
  resumeStep,
  sanitizeDraft,
  splitTextIntoPages,
  validateDraft,
} from "@/components/onboarding/model";
import type {
  ConfirmResult,
  ExtractResult,
  NotesResourceView,
  PyqView,
  SetupConcept,
  SetupState,
  UploadKind,
  UploadToken,
} from "@/components/onboarding/types";

/** An error whose message is safe and useful to show to the student. */
export class OnboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnboardingError";
  }
}

/** A validated upload: PDF bytes or pasted text (exactly one is set). */
export interface UploadInput {
  /** `blobUrl` is set when the browser already stored the PDF in Vercel Blob (direct upload). */
  file?: { name: string; bytes: Uint8Array; blobUrl?: string };
  text?: string;
}

/** A "processing" row older than this is treated as failed (the request died mid-way). */
const STALE_PROCESSING_MS = 5 * 60_000;

// ── goal ────────────────────────────────────────────────────────────────────
export async function createGoalRecord(
  userId: string,
  input: { subject: string; examDate: Date; minutesPerDay: number },
): Promise<string> {
  const goal = await db.goal.create({
    data: {
      userId,
      subject: input.subject,
      examDate: input.examDate,
      minutesPerDay: input.minutesPerDay,
      status: "draft",
    },
    select: { id: true },
  });
  return goal.id;
}

export async function countGoals(userId: string): Promise<number> {
  return db.goal.count({ where: { userId } });
}

// ── read models ─────────────────────────────────────────────────────────────
async function loadSetupConcepts(goalId: string): Promise<SetupConcept[]> {
  const rows = await db.concept.findMany({
    where: { goalId },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      unit: true,
      weightage: true,
      weightageSource: true,
      pyqMarks: true,
      estMinutes: true,
    },
  });
  return rows;
}

async function loadDraft(goal: Pick<Goal, "id" | "subject">): Promise<DraftGraph | null> {
  const [concepts, edges] = await Promise.all([
    db.concept.findMany({
      where: { goalId: goal.id },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, unit: true, estMinutes: true, weightage: true },
    }),
    db.conceptEdge.findMany({ where: { goalId: goal.id }, select: { fromConceptId: true, toConceptId: true } }),
  ]);
  if (concepts.length === 0) return null;
  return draftFromConcepts({
    subject: goal.subject,
    concepts,
    edges: edges.map((e) => ({ from: e.fromConceptId, to: e.toConceptId })),
  });
}

async function loadPyqView(
  goalId: string,
  meta: { fileName?: string | null; source?: PyqView["source"] } = {},
): Promise<PyqView | null> {
  const [questions, concepts, resource] = await Promise.all([
    db.question.findMany({
      where: { goalId, source: "pyq" },
      orderBy: [{ year: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      select: { id: true, body: true, marks: true, year: true, conceptId: true },
    }),
    loadSetupConcepts(goalId),
    meta.fileName === undefined
      ? db.resource.findFirst({
          where: { goalId, kind: "pyq", status: "ready" },
          orderBy: { createdAt: "desc" },
          select: { fileName: true },
        })
      : Promise.resolve(null),
  ]);
  if (questions.length === 0) return null;
  const w = pyqWeightage(
    questions.map((q) => ({ conceptId: q.conceptId, marks: q.marks })),
    concepts.map((c) => c.id),
  );
  return {
    fileName: meta.fileName !== undefined ? meta.fileName : (resource?.fileName ?? null),
    source: meta.source ?? "saved",
    totalMarks: w.total,
    basis: w.basis,
    questions: questions.map((q) => ({
      id: q.id,
      text: q.body,
      marks: q.marks,
      year: q.year,
      conceptId: q.conceptId,
    })),
    concepts,
  };
}

async function chunkCounts(goalId: string): Promise<Map<string, { total: number; embedded: number }>> {
  const rows = await db.$queryRaw<Array<{ resourceId: string; total: number; embedded: number }>>`
    SELECT "resourceId", COUNT(*)::int AS total, COUNT("embedding")::int AS embedded
    FROM "Chunk" WHERE "goalId" = ${goalId} GROUP BY "resourceId"`;
  return new Map(rows.map((r) => [r.resourceId, { total: Number(r.total), embedded: Number(r.embedded) }]));
}

function toNotesView(
  r: { id: string; fileName: string; status: NotesResourceView["status"]; pages: number | null; error: string | null; createdAt: Date },
  counts: { total: number; embedded: number } | undefined,
  now: Date,
): NotesResourceView {
  const stale = r.status === "processing" && now.getTime() - r.createdAt.getTime() > STALE_PROCESSING_MS;
  return {
    id: r.id,
    fileName: r.fileName,
    status: stale ? "failed" : r.status,
    pages: r.pages,
    chunks: counts?.total ?? 0,
    embedded: counts?.embedded ?? 0,
    error: stale ? "Processing didn't finish. Remove it and upload again." : r.error,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listNotes(goalId: string, now: Date = new Date()): Promise<NotesResourceView[]> {
  const [resources, counts] = await Promise.all([
    db.resource.findMany({
      where: { goalId, kind: "notes" },
      orderBy: { createdAt: "asc" },
      select: { id: true, fileName: true, status: true, pages: true, error: true, createdAt: true },
    }),
    chunkCounts(goalId),
  ]);
  return resources.map((r) => toNotesView(r, counts.get(r.id), now));
}

/** Everything the setup page needs to render (and resume) the flow. */
export async function getSetupState(goal: Goal, now: Date = new Date()): Promise<SetupState> {
  const [draft, concepts, pyq, notes] = await Promise.all([
    loadDraft(goal),
    loadSetupConcepts(goal.id),
    loadPyqView(goal.id),
    listNotes(goal.id, now),
  ]);
  return {
    goal: {
      id: goal.id,
      subject: goal.subject,
      examDate: goal.examDate.toISOString(),
      minutesPerDay: goal.minutesPerDay,
      status: goal.status,
      isDemo: goal.isDemo,
      daysLeft: daysUntil(goal.examDate, now),
    },
    initialStep: resumeStep({
      status: goal.status,
      conceptCount: concepts.length,
      hasPyq: pyq !== null,
      notesCount: notes.filter((n) => n.status === "ready").length,
    }),
    draft,
    concepts,
    pyq,
    notes,
    aiMode: aiMode(),
    directUploads: blobEnabled(),
  };
}

// ── uploads ─────────────────────────────────────────────────────────────────
/** Pasted-text caps (characters). Notes can be long; syllabus and papers are short. */
export const MAX_TEXT_CHARS = { syllabus: 60_000, pyq: 60_000, notes: 200_000 } as const;
/** Notes files per goal. */
export const MAX_NOTES_PER_GOAL = 10;

/**
 * Validate an upload before any parsing (defence in depth: the server actions check too).
 * Exactly one of file/text; PDFs by magic bytes (the browser's MIME type is not trusted).
 */
function checkUpload(input: UploadInput, kind: keyof typeof MAX_TEXT_CHARS): UploadInput {
  const hasFile = Boolean(input.file);
  const hasText = Boolean(input.text?.trim());
  if (hasFile === hasText) throw new OnboardingError("Upload a PDF or paste text (one of the two).");
  if (input.file) {
    const { bytes } = input.file;
    if (bytes.byteLength === 0) throw new OnboardingError("That file is empty.");
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new OnboardingError(`That PDF is over ${MAX_UPLOAD_MB} MB. Split it, or paste the text instead.`);
    }
    if (!isPdfBytes(bytes)) throw new OnboardingError("That file isn't a PDF.");
    return { file: { name: safeFileName(input.file.name, `${kind}.pdf`), bytes, blobUrl: input.file.blobUrl } };
  }
  const text = input.text ?? "";
  if (text.length > MAX_TEXT_CHARS[kind]) {
    throw new OnboardingError(`That text is too long (max ${MAX_TEXT_CHARS[kind].toLocaleString("en-IN")} characters).`);
  }
  return { text };
}

/** Blob folder for one goal's PDFs of one kind. Direct uploads are only accepted from here. */
function uploadPrefix(goalId: string, kind: UploadKind): string {
  return `goals/${goalId}/${kind}/`;
}

/** How long the browser has to start a direct upload after asking for a token. */
const UPLOAD_TOKEN_TTL_MS = 10 * 60_000;
/** Students' PDFs are private: read back with our token, never served by URL. The store must match. */
const BLOB_ACCESS = "private" as const;

/**
 * Client token for one browser → Vercel Blob upload, so the PDF never passes through a
 * function (Vercel caps request bodies at 4.5 MB). The token pins the pathname under this
 * goal's folder, PDF content type and MAX_UPLOAD_BYTES; Blob adds a random suffix.
 */
export async function createUploadToken(goalId: string, kind: UploadKind, fileName: string): Promise<UploadToken> {
  if (!blobEnabled()) throw new OnboardingError("Large uploads aren't set up here. Paste the text instead.");
  const pathname = uploadPrefix(goalId, kind) + blobFileName(fileName, `${kind}.pdf`);
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: ["application/pdf"],
    maximumSizeInBytes: MAX_UPLOAD_BYTES,
    addRandomSuffix: true,
    validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
  });
  return { pathname, token, access: BLOB_ACCESS };
}

/** Delete a stored PDF that no Resource keeps. Never throws. */
async function deleteBlob(url: string | null | undefined): Promise<void> {
  if (!url || !blobEnabled()) return;
  await del(url).catch((e) => console.warn("[onboarding] blob delete failed", e));
}

/**
 * Bytes of a PDF the browser uploaded straight to Blob. Only blobs in this store (head() asks
 * the Blob API with our token) under this goal's folder are accepted, and the download is by
 * pathname, so our token only ever goes to our own store's URL. A rejected upload is deleted.
 */
export async function loadDirectUpload(
  goalId: string,
  kind: UploadKind,
  url: string,
  fileName: string,
): Promise<NonNullable<UploadInput["file"]>> {
  const expired = new OnboardingError("That upload didn't go through. Upload the PDF again.");
  if (!blobEnabled()) throw expired;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw expired;
  }
  if (!host.endsWith(".blob.vercel-storage.com")) throw expired;
  const meta = await head(url).catch(() => null);
  if (!meta || !meta.pathname.startsWith(uploadPrefix(goalId, kind))) throw expired;

  try {
    if (meta.size > MAX_UPLOAD_BYTES) {
      throw new OnboardingError(`That PDF is over ${MAX_UPLOAD_MB} MB. Split it, or paste the text instead.`);
    }
    const res = await get(meta.pathname, { access: BLOB_ACCESS, useCache: false });
    if (!res || res.statusCode !== 200) throw new Error("blob download failed");
    const bytes = new Uint8Array(await new Response(res.stream).arrayBuffer());
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new OnboardingError(`That PDF is over ${MAX_UPLOAD_MB} MB. Split it, or paste the text instead.`);
    }
    if (!isPdfBytes(bytes)) throw new OnboardingError("That file isn't a PDF.");
    return { name: fileName, bytes, blobUrl: meta.url };
  } catch (err) {
    await deleteBlob(meta.url);
    throw err;
  }
}

/** Delete a direct upload whose request failed before any Resource kept it. Never throws. */
export async function discardUpload(input: UploadInput | undefined): Promise<void> {
  await deleteBlob(input?.file?.blobUrl);
}

/** Archive the original PDF to Vercel Blob when configured. Never throws: archiving is optional. */
async function archivePdf(goalId: string, kind: UploadKind, file: UploadInput["file"]): Promise<string | null> {
  if (!file || !blobEnabled()) return null;
  if (file.blobUrl) return file.blobUrl; // direct upload: already stored
  try {
    const blob = await put(uploadPrefix(goalId, kind) + blobFileName(file.name, `${kind}.pdf`), Buffer.from(file.bytes), {
      access: BLOB_ACCESS,
      addRandomSuffix: true,
      contentType: "application/pdf",
    });
    return blob.url;
  } catch (err) {
    console.warn(`[onboarding] blob archive failed for ${kind}:`, err);
    return null;
  }
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof OnboardingError) return err.message;
  return fallback;
}

async function markFailed(resourceId: string, message: string) {
  await db.resource
    .update({ where: { id: resourceId }, data: { status: "failed", error: message.slice(0, 500) } })
    .catch((e) => console.error("[onboarding] could not mark resource failed", e));
}

// ── step 1: syllabus → draft graph ──────────────────────────────────────────
export async function runSyllabusExtraction(goal: Goal, rawInput: UploadInput): Promise<ExtractResult> {
  const input = checkUpload(rawInput, "syllabus");
  if (goal.status === "active") {
    throw new OnboardingError("This goal's graph is already live. Create a new goal to start over.");
  }
  const resource = await db.resource.create({
    data: {
      goalId: goal.id,
      kind: "syllabus",
      fileName: input.file?.name ?? "pasted-syllabus.txt",
      status: "processing",
    },
    select: { id: true },
  });

  const blobUrl = archivePdf(goal.id, "syllabus", input.file);
  try {
    const raw = await extractSyllabus({ subject: goal.subject, pdf: input.file?.bytes, text: input.text });
    const { draft, fixes } = sanitizeDraft({ ...raw, subject: raw.subject || goal.subject });
    if (draft.concepts.length === 0) {
      throw new OnboardingError("No concepts found in that syllabus. Paste the topic list as text and try again.");
    }
    await db.resource.update({
      where: { id: resource.id },
      data: { status: "ready", blobUrl: await blobUrl, error: null },
    });
    return { draft, fixes };
  } catch (err) {
    console.error("[onboarding] syllabus extraction failed", err);
    const message = describeError(err, "Couldn't read that syllabus. Try again, or paste the text instead.");
    await markFailed(resource.id, message);
    await deleteBlob(await blobUrl); // nothing keeps a failed upload
    throw new OnboardingError(message);
  }
}

// ── step 1b: confirm the graph ──────────────────────────────────────────────
async function retagChunks(goalId: string): Promise<void> {
  const [chunks, concepts] = await Promise.all([
    db.chunk.findMany({ where: { goalId }, select: { id: true, text: true } }),
    db.concept.findMany({ where: { goalId }, select: { id: true, name: true, description: true } }),
  ]);
  if (chunks.length === 0 || concepts.length === 0) return;
  const byConcept = new Map<string, string[]>();
  for (const c of chunks) {
    const best = bestConceptForText(c.text, concepts);
    if (best) byConcept.set(best, [...(byConcept.get(best) ?? []), c.id]);
  }
  await db.$transaction(
    [...byConcept.entries()].map(([conceptId, ids]) =>
      db.chunk.updateMany({ where: { id: { in: ids } }, data: { conceptId } }),
    ),
  );
}

/**
 * Replace the goal's concept graph with the student's confirmed draft. Only while the goal
 * is draft/diagnosing: existing concepts, edges and questions (with their mastery, sessions
 * and mistakes) are deleted and recreated; weightage becomes estimated shares.
 */
export async function confirmGraph(goal: Goal, draft: DraftGraph): Promise<ConfirmResult> {
  if (goal.status === "active") {
    throw new OnboardingError("This goal is already active, so its graph can't be replaced here.");
  }
  const issues = validateDraft(draft);
  if (issues.length > 0) throw new OnboardingError(issues[0].message);

  const plan = planConfirm(draft);
  await db.$transaction(
    async (tx) => {
      await tx.question.deleteMany({ where: { goalId: goal.id } });
      await tx.conceptEdge.deleteMany({ where: { goalId: goal.id } });
      await tx.concept.deleteMany({ where: { goalId: goal.id } });

      const created = await tx.concept.createManyAndReturn({
        data: plan.concepts.map((c) => ({
          goalId: goal.id,
          name: c.name,
          description: c.description,
          unit: c.unit,
          order: c.order,
          weightage: c.weightage,
          weightageSource: "estimated" as const,
          pyqMarks: null,
          estMinutes: c.estMinutes,
        })),
        select: { id: true, order: true },
      });
      const idByOrder = new Map(created.map((r) => [r.order, r.id]));
      const idByKey = new Map(plan.concepts.map((c) => [c.key, idByOrder.get(c.order) as string]));

      if (plan.edges.length > 0) {
        await tx.conceptEdge.createMany({
          data: plan.edges.map((e) => ({
            goalId: goal.id,
            fromConceptId: idByKey.get(e.fromKey) as string,
            toConceptId: idByKey.get(e.toKey) as string,
          })),
          skipDuplicates: true,
        });
      }
      await tx.mastery.createMany({
        data: created.map((r) => ({ conceptId: r.id, theta: 0, evidenceCount: 0 })),
      });
      await tx.goal.update({ where: { id: goal.id }, data: { status: "diagnosing" } });
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  // Notes uploaded before a re-confirm lost their concept tags (SetNull); restore them.
  await retagChunks(goal.id).catch((e) => console.error("[onboarding] chunk re-tagging failed", e));

  const [saved, concepts] = await Promise.all([loadDraft(goal), loadSetupConcepts(goal.id)]);
  return { draft: saved ?? draft, concepts };
}

// ── step 2: PYQs → weightage ────────────────────────────────────────────────
type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Recompute every concept's weightage from the stored PYQ questions. */
async function applyPyqWeightage(tx: Tx, goalId: string): Promise<void> {
  const [questions, concepts] = await Promise.all([
    tx.question.findMany({ where: { goalId, source: "pyq" }, select: { conceptId: true, marks: true } }),
    tx.concept.findMany({ where: { goalId }, select: { id: true } }),
  ]);
  const w = pyqWeightage(
    questions,
    concepts.map((c) => c.id),
  );
  for (const c of concepts) {
    await tx.concept.update({
      where: { id: c.id },
      data: { weightage: w.share[c.id] ?? 0, weightageSource: "pyq", pyqMarks: w.marks[c.id] ?? 0 },
    });
  }
}

export async function runPyqMapping(goal: Goal, rawInput: UploadInput): Promise<PyqView> {
  const input = checkUpload(rawInput, "pyq");
  const concepts = await db.concept.findMany({
    where: { goalId: goal.id },
    select: { id: true, name: true, unit: true, description: true },
    orderBy: { order: "asc" },
  });
  if (concepts.length === 0) throw new OnboardingError("Confirm your concept graph first.");

  const fileName = input.file?.name ?? "pasted-pyqs.txt";
  const resource = await db.resource.create({
    data: { goalId: goal.id, kind: "pyq", fileName, status: "processing" },
    select: { id: true },
  });
  const blobUrl = archivePdf(goal.id, "pyq", input.file);

  try {
    const refs: ConceptRef[] = concepts;
    const result = await mapPyqs({ pdf: input.file?.bytes, text: input.text, concepts: refs });
    const valid = new Set(concepts.map((c) => c.id));
    const questions = result.questions
      .filter((q) => q.text.trim().length > 0)
      .map((q) => ({
        text: q.text.trim().slice(0, 2000),
        marks: Number.isFinite(q.marks) ? Math.min(100, Math.max(0, q.marks)) : null,
        year: q.year !== null && Number.isInteger(q.year) && q.year > 1900 && q.year < 2200 ? q.year : null,
        conceptId: valid.has(q.conceptId) ? q.conceptId : null,
      }));
    if (questions.length === 0) {
      throw new OnboardingError("No questions found in that paper. Check the file, or paste the questions as text.");
    }

    await db.$transaction(
      async (tx) => {
        await tx.question.deleteMany({ where: { goalId: goal.id, source: "pyq" } });
        await tx.question.createMany({
          data: questions.map((q) => ({
            goalId: goal.id,
            conceptId: q.conceptId,
            type: "short" as const,
            body: q.text,
            answer: "",
            source: "pyq" as const,
            marks: q.marks,
            year: q.year,
          })),
        });
        await applyPyqWeightage(tx, goal.id);
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    await db.resource.update({
      where: { id: resource.id },
      data: { status: "ready", blobUrl: await blobUrl, error: null },
    });

    const view = await loadPyqView(goal.id, { fileName, source: result.source });
    if (!view) throw new OnboardingError("PYQ mapping didn't save. Try again.");
    return view;
  } catch (err) {
    console.error("[onboarding] PYQ mapping failed", err);
    const message = describeError(err, "Couldn't map those papers. Try again, or paste the questions as text.");
    await markFailed(resource.id, message);
    await deleteBlob(await blobUrl); // nothing keeps a failed upload
    throw new OnboardingError(message);
  }
}

export async function remapPyq(goal: Goal, questionId: string, conceptId: string): Promise<PyqView> {
  const [question, concept] = await Promise.all([
    db.question.findFirst({ where: { id: questionId, goalId: goal.id, source: "pyq" }, select: { id: true } }),
    db.concept.findFirst({ where: { id: conceptId, goalId: goal.id }, select: { id: true } }),
  ]);
  if (!question) throw new OnboardingError("That question no longer exists. Reload the page.");
  if (!concept) throw new OnboardingError("That concept no longer exists. Reload the page.");

  await db.$transaction(
    async (tx) => {
      await tx.question.update({ where: { id: question.id }, data: { conceptId: concept.id } });
      await applyPyqWeightage(tx, goal.id);
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  const view = await loadPyqView(goal.id);
  if (!view) throw new OnboardingError("PYQ mapping not found. Upload the papers again.");
  return view;
}

// ── step 3: notes → chunks ──────────────────────────────────────────────────
/**
 * Store + index one notes file. Processing failures are recorded on the Resource and
 * returned as a "failed" row (not thrown) so the UI can show the error next to the file.
 */
export async function runNotesUpload(goal: Goal, rawInput: UploadInput): Promise<NotesResourceView> {
  const input = checkUpload(rawInput, "notes");
  const existing = await db.resource.count({ where: { goalId: goal.id, kind: "notes" } });
  if (existing >= MAX_NOTES_PER_GOAL) {
    throw new OnboardingError(`You can attach up to ${MAX_NOTES_PER_GOAL} notes files. Remove one first.`);
  }
  const fileName = input.file?.name ?? "pasted-notes.txt";
  const resource = await db.resource.create({
    data: { goalId: goal.id, kind: "notes", fileName, status: "processing" },
    select: { id: true, fileName: true, status: true, pages: true, error: true, createdAt: true },
  });
  const blobUrl = archivePdf(goal.id, "notes", input.file);

  try {
    const pages = input.file
      ? await extractPdfPages(input.file.bytes)
      : splitTextIntoPages(input.text ?? "");
    const withText = pages.filter((p) => p.text.trim().length > 0);
    if (withText.length === 0) {
      throw new OnboardingError(
        input.file
          ? "No selectable text in this PDF (is it a scan?). Paste the text instead."
          : "That text is empty.",
      );
    }
    const concepts = await db.concept.findMany({
      where: { goalId: goal.id },
      select: { id: true, name: true, description: true },
    });
    const indexed = await indexNotes({ goalId: goal.id, resourceId: resource.id, pages: withText, concepts });
    if (indexed.chunks === 0) throw new OnboardingError("Nothing could be indexed from this file.");

    const pageCount = input.file ? pages.length : withText.reduce((m, p) => Math.max(m, p.page), 0);
    const updated = await db.resource.update({
      where: { id: resource.id },
      data: { status: "ready", pages: pageCount, blobUrl: await blobUrl, error: null },
      select: { id: true, fileName: true, status: true, pages: true, error: true, createdAt: true },
    });
    return toNotesView(updated, { total: indexed.chunks, embedded: indexed.embedded ? indexed.chunks : 0 }, new Date());
  } catch (err) {
    console.error("[onboarding] notes indexing failed", err);
    const message = describeError(err, "Couldn't index these notes. Retry, or paste the text instead.");
    await markFailed(resource.id, message);
    await db.chunk.deleteMany({ where: { resourceId: resource.id } }).catch(() => undefined);
    await deleteBlob(await blobUrl); // nothing keeps a failed upload
    return toNotesView({ ...resource, status: "failed", error: message }, undefined, new Date());
  }
}

export async function deleteNotes(goal: Goal, resourceId: string): Promise<void> {
  const resource = await db.resource.findFirst({
    where: { id: resourceId, goalId: goal.id, kind: "notes" },
    select: { id: true, blobUrl: true },
  });
  if (!resource) throw new OnboardingError("That file is already gone.");
  await db.resource.delete({ where: { id: resource.id } });
  if (resource.blobUrl && blobEnabled()) {
    await del(resource.blobUrl).catch((e) => console.warn("[onboarding] blob delete failed", e));
  }
}
