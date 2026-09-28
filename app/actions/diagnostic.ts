"use server";
// Adaptive diagnostic actions (idea.md P0 #4). Called from components/diagnostic/*.
// Every action validates input with zod, checks goal ownership via requireGoal and
// returns ActionResult<T> — raw errors are logged, never sent to the client.
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireGoal } from "@/lib/session";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { answerFor, DiagnosticError, finishFor, startFor } from "@/lib/services/diagnostic";
import type { ActionResult, ConceptGraphData } from "@/lib/types";
import type { DiagnosticAnswer, DiagnosticStart } from "@/components/diagnostic/types";

const GoalId = z.string().trim().min(1).max(64);
const AnswerInput = z.object({
  goalId: GoalId,
  questionId: z.string().trim().min(1).max(64),
  response: z.string().trim().min(1, "Answer the question first.").max(200),
});

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  unstable_rethrow(err); // let redirect()/notFound() from requireGoal through
  if (err instanceof DiagnosticError || err instanceof RateLimitError) return { ok: false, error: err.message };
  console.error("[diagnostic]", err);
  return { ok: false, error: fallback };
}

function revalidateLoop(goalId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath("/plan");
  revalidatePath(`/goal/${goalId}/diagnostic`);
}

/** First / current question. Generates and caches the question pool on first entry. */
export async function startDiagnostic(goalId: string): Promise<ActionResult<DiagnosticStart>> {
  const parsed = GoalId.safeParse(goalId);
  if (!parsed.success) return { ok: false, error: "Invalid goal." };
  try {
    const { user, goal } = await requireGoal(parsed.data);
    await enforceRateLimit("aiQuestions", user.id);
    return { ok: true, data: await startFor(goal, user.id) };
  } catch (err) {
    return fail(err, "Couldn't prepare the diagnostic. Try again.");
  }
}

/** Grade one answer, update mastery (concept + unit prior), log mistakes, pick the next question. */
export async function answerDiagnostic(
  goalId: string,
  questionId: string,
  response: string,
): Promise<ActionResult<DiagnosticAnswer>> {
  const parsed = AnswerInput.safeParse({ goalId, questionId, response });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid answer." };
  try {
    const { user, goal } = await requireGoal(parsed.data.goalId);
    const data = await answerFor({
      goal,
      userId: user.id,
      questionId: parsed.data.questionId,
      response: parsed.data.response,
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err, "Couldn't save that answer. Try again.");
  }
}

/** Diagnostic done → goal "active"; returns the recoloured concept graph. */
export async function finishDiagnostic(goalId: string): Promise<ActionResult<ConceptGraphData>> {
  const parsed = GoalId.safeParse(goalId);
  if (!parsed.success) return { ok: false, error: "Invalid goal." };
  try {
    const { goal } = await requireGoal(parsed.data);
    const graph = await finishFor(goal);
    revalidateLoop(goal.id);
    return { ok: true, data: graph };
  } catch (err) {
    return fail(err, "Couldn't finish the diagnostic. Try again.");
  }
}

/** Skip the diagnostic: goal becomes "active" and the graph stays "no data". */
export async function skipDiagnostic(goalId: string): Promise<ActionResult> {
  const parsed = GoalId.safeParse(goalId);
  if (!parsed.success) return { ok: false, error: "Invalid goal." };
  try {
    const { goal } = await requireGoal(parsed.data);
    if (goal.status === "draft") return { ok: false, error: "Confirm your concept graph first." };
    if (goal.status !== "active") {
      await db.goal.update({ where: { id: goal.id }, data: { status: "active" } });
    }
    revalidateLoop(goal.id);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err, "Couldn't skip the diagnostic. Try again.");
  }
}
