"use server";
// Mistake log server actions (Explain My Mistake + retry). Zod-validated, ownership-checked.
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/session";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { MistakeError, answerMistakeRetry, explainUserMistake } from "@/lib/services/mistakes";
import type { ActionResult } from "@/lib/types";
import type { ExplanationView, RetryOutcomeView } from "@/components/mistakes/types";

const Id = z.string().trim().min(1).max(64);

async function run<T>(label: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof MistakeError || err instanceof RateLimitError) return { ok: false, error: err.message };
    console.error(`[actions/mistakes] ${label} failed`, err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const ExplainInput = z.object({ mistakeId: Id, fresh: z.boolean().default(false) });

export async function explainMistakeAction(
  mistakeId: string,
  fresh = false,
): Promise<ActionResult<ExplanationView>> {
  const parsed = ExplainInput.safeParse({ mistakeId, fresh });
  if (!parsed.success) return { ok: false, error: "Invalid mistake." };
  return run("explainMistake", async () => {
    const user = await requireUser();
    await enforceRateLimit("explain", user.id);
    if (parsed.data.fresh) await enforceRateLimit("explainFresh", user.id);
    return explainUserMistake(user.id, parsed.data.mistakeId, parsed.data.fresh);
  });
}

const RetryInput = z.object({
  mistakeId: Id,
  questionId: Id,
  response: z.string().trim().min(1, "Enter an answer first.").max(200),
});

export async function answerRetryAction(
  mistakeId: string,
  questionId: string,
  response: string,
): Promise<ActionResult<RetryOutcomeView>> {
  const parsed = RetryInput.safeParse({ mistakeId, questionId, response });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid answer." };
  const result = await run("answerRetry", async () => {
    const user = await requireUser();
    return answerMistakeRetry(user.id, parsed.data.mistakeId, parsed.data.questionId, parsed.data.response);
  });
  // Counts, resolved state and any newly logged mistake re-render in the same round trip.
  if (result.ok) revalidatePath("/mistakes");
  return result;
}
