"use server";
// Learn session server actions: zod-validated, ownership-checked (services scope every query
// by userId), always return ActionResult so raw errors never reach the client.
import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/session";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import {
  LearnError,
  answerCheck,
  completeSession,
  requestHint,
  sendTutorMessage,
  setHinglish,
  startChecks,
} from "@/lib/services/learn";
import { MAX_MESSAGE_CHARS } from "@/lib/services/learn-helpers";
import type { ActionResult } from "@/lib/types";
import type {
  CheckAnswerView,
  CheckPhaseView,
  SessionResultView,
  TutorReplyView,
} from "@/components/session/types";

const Id = z.string().trim().min(1).max(64);

async function run<T>(label: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof LearnError || err instanceof RateLimitError) return { ok: false, error: err.message };
    console.error(`[actions/learn] ${label} failed`, err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function invalid(message: string): ActionResult<never> {
  return { ok: false, error: message };
}

const SendInput = z.object({
  sessionId: Id,
  text: z
    .string()
    .trim()
    .min(1, "Type a reply first.")
    .max(MAX_MESSAGE_CHARS, `Keep replies under ${MAX_MESSAGE_CHARS} characters.`),
});

export async function sendTutorMessageAction(sessionId: string, text: string): Promise<ActionResult<TutorReplyView>> {
  const parsed = SendInput.safeParse({ sessionId, text });
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Invalid message.");
  return run("sendTutorMessage", async () => {
    const user = await requireUser();
    await enforceRateLimit("tutor", user.id);
    return sendTutorMessage(user.id, parsed.data.sessionId, parsed.data.text);
  });
}

export async function requestHintAction(sessionId: string): Promise<ActionResult<TutorReplyView>> {
  const parsed = Id.safeParse(sessionId);
  if (!parsed.success) return invalid("Invalid session.");
  return run("requestHint", async () => {
    const user = await requireUser();
    await enforceRateLimit("tutor", user.id);
    return requestHint(user.id, parsed.data);
  });
}

export async function startChecksAction(sessionId: string): Promise<ActionResult<CheckPhaseView>> {
  const parsed = Id.safeParse(sessionId);
  if (!parsed.success) return invalid("Invalid session.");
  return run("startChecks", async () => {
    const user = await requireUser();
    await enforceRateLimit("aiQuestions", user.id);
    return startChecks(user.id, parsed.data);
  });
}

const CheckInput = z.object({
  sessionId: Id,
  questionId: Id,
  response: z.string().trim().min(1, "Enter an answer first.").max(200),
});

export async function answerCheckAction(
  sessionId: string,
  questionId: string,
  response: string,
): Promise<ActionResult<CheckAnswerView>> {
  const parsed = CheckInput.safeParse({ sessionId, questionId, response });
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Invalid answer.");
  return run("answerCheck", async () => {
    const user = await requireUser();
    return answerCheck(user.id, parsed.data.sessionId, parsed.data.questionId, parsed.data.response);
  });
}

export async function completeSessionAction(sessionId: string): Promise<ActionResult<SessionResultView>> {
  const parsed = Id.safeParse(sessionId);
  if (!parsed.success) return invalid("Invalid session.");
  return run("completeSession", async () => {
    const user = await requireUser();
    return completeSession(user.id, parsed.data);
  });
}

/** P1 Hinglish toggle (in-session and in settings). Applies from the next tutor turn. */
export async function setHinglishAction(on: boolean): Promise<ActionResult<{ hinglish: boolean }>> {
  const parsed = z.boolean().safeParse(on);
  if (!parsed.success) return invalid("Invalid setting.");
  return run("setHinglish", async () => {
    const user = await requireUser();
    return { hinglish: await setHinglish(user.id, parsed.data) };
  });
}
