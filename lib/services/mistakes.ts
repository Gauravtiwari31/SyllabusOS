// Mistake log (idea.md P0 #7) + Explain My Mistake (P1). Server-only.
import { db } from "@/lib/db";
import { explainMistake } from "@/lib/ai";
import { retrieveChunks, type RetrievedChunk } from "@/lib/rag";
import { gradeObjective } from "@/lib/engine";
import { recordEvidence, recordMistake } from "@/lib/services/core";
import {
  correctAnswerText,
  correctIndexOf,
  normalizeDraft,
  parseOptions,
  responseText,
  toOutcome,
  validateObjectiveResponse,
} from "@/lib/services/learn-helpers";
import {
  buildMistakeLog,
  chunkSources,
  parseStoredExplanation,
  serializeExplanation,
  type StoredExplanation,
} from "@/lib/services/mistakes-helpers";
import type {
  ExplanationView,
  MistakeLogData,
  RetryOutcomeView,
  RetryQuestionView,
} from "@/components/mistakes/types";
import type { Question } from "@/lib/generated/prisma/client";

/** Error whose message is safe to show the student. */
export class MistakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MistakeError";
  }
}

const LOG_LIMIT = 500;

function toRetryView(q: Question): RetryQuestionView | null {
  if (q.type !== "mcq" && q.type !== "numeric") return null;
  return { id: q.id, type: q.type, body: q.body, options: q.type === "mcq" ? parseOptions(q.options) : null };
}

function toRetryOutcome(
  q: Question,
  attempt: { outcome: number; response: string } | null,
  resolved: boolean,
): RetryOutcomeView | null {
  if (!attempt) return null;
  const outcome = toOutcome(attempt.outcome);
  return {
    outcome,
    correctAnswer: correctAnswerText(q),
    correctIndex: correctIndexOf(q),
    explanation: q.explanation,
    response: attempt.response,
    resolved: resolved && outcome === 1,
  };
}

/** Stored explanation → view, joining the retry question and the student's latest answer to it. */
async function explanationViews(
  userId: string,
  rows: Array<{ id: string; explanation: string | null; resolved: boolean }>,
): Promise<Map<string, ExplanationView>> {
  const parsed = new Map<string, StoredExplanation>();
  for (const r of rows) {
    const e = parseStoredExplanation(r.explanation);
    if (e) parsed.set(r.id, e);
  }
  const qids = [...new Set([...parsed.values()].map((e) => e.retryQuestionId).filter((x): x is string => !!x))];
  const [questions, attempts] = qids.length
    ? await Promise.all([
        db.question.findMany({ where: { id: { in: qids } } }),
        db.attempt.findMany({
          where: { userId, questionId: { in: qids } },
          orderBy: { createdAt: "desc" },
          select: { questionId: true, outcome: true, response: true },
        }),
      ])
    : [[], []];
  const qById = new Map(questions.map((q) => [q.id, q]));
  const latest = new Map<string, { outcome: number; response: string }>();
  for (const a of attempts) if (!latest.has(a.questionId)) latest.set(a.questionId, a);

  const out = new Map<string, ExplanationView>();
  for (const r of rows) {
    const e = parsed.get(r.id);
    if (!e) continue;
    const q = e.retryQuestionId ? qById.get(e.retryQuestionId) : undefined;
    out.set(r.id, {
      whyWrong: e.whyWrong,
      correctReasoning: e.correctReasoning,
      sources: e.sources,
      notInNotes: e.notInNotes,
      retry: q ? toRetryView(q) : null,
      retryResult: q ? toRetryOutcome(q, latest.get(q.id) ?? null, r.resolved) : null,
    });
  }
  return out;
}

/** The whole mistake log for one goal, grouped by concept. */
export async function getMistakeLog(userId: string, goalId: string, now: Date = new Date()): Promise<MistakeLogData> {
  const rows = await db.mistake.findMany({
    where: { goalId, goal: { userId } },
    include: { concept: { select: { name: true, unit: true } } },
    orderBy: { createdAt: "desc" },
    take: LOG_LIMIT,
  });
  const explanations = await explanationViews(userId, rows);
  return buildMistakeLog(
    rows.map((r) => ({
      id: r.id,
      conceptId: r.conceptId,
      conceptName: r.concept.name,
      unit: r.concept.unit,
      source: r.source,
      prompt: r.prompt,
      response: r.response,
      misconception: r.misconception,
      explanation: r.explanation,
      resolved: r.resolved,
      createdAt: r.createdAt,
    })),
    explanations,
    now,
  );
}

async function loadOwnedMistake(userId: string, mistakeId: string) {
  const m = await db.mistake.findFirst({
    where: { id: mistakeId, goal: { userId } },
    include: { concept: true, goal: true },
  });
  if (!m) throw new MistakeError("Mistake not found.");
  return m;
}

/**
 * Explain My Mistake: grounded in the student's notes when possible. The retry question is stored
 * as a practice Question so it is graded server-side (the answer key never reaches the client).
 * Cached on Mistake.explanation; `fresh` asks for a new explanation + retry question.
 */
export async function explainUserMistake(userId: string, mistakeId: string, fresh = false): Promise<ExplanationView> {
  const m = await loadOwnedMistake(userId, mistakeId);
  if (!fresh && m.explanation) {
    const cached = (await explanationViews(userId, [m])).get(m.id);
    if (cached) return cached;
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { hinglish: true } });
  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await retrieveChunks({
      goalId: m.goalId,
      conceptId: m.conceptId,
      query: `${m.concept.name} ${m.misconception ?? ""} ${m.prompt}`.slice(0, 1000),
      k: 4,
    });
  } catch (err) {
    console.error("[mistakes] retrieveChunks failed", err);
  }

  let result;
  try {
    result = await explainMistake({
      subject: m.goal.subject,
      concept: { id: m.concept.id, name: m.concept.name, unit: m.concept.unit, description: m.concept.description },
      prompt: m.prompt,
      response: m.response,
      misconception: m.misconception,
      chunks,
      hinglish: user?.hinglish ?? false,
    });
  } catch (err) {
    console.error("[mistakes] explainMistake failed", err);
    throw new MistakeError("Couldn't explain this one just now — try again.");
  }

  // A fresh explanation replaces the previous retry question; drop it if never attempted.
  const previous = parseStoredExplanation(m.explanation);
  if (fresh && previous?.retryQuestionId) {
    const attempted = await db.attempt.count({ where: { questionId: previous.retryQuestionId } });
    if (attempted === 0) {
      await db.question.deleteMany({ where: { id: previous.retryQuestionId, goalId: m.goalId } });
    }
  }

  let retryQuestionId: string | null = null;
  const draft = result.retry ? normalizeDraft(result.retry) : null;
  if (draft) {
    const q = await db.question.create({
      data: {
        goalId: m.goalId,
        conceptId: m.conceptId,
        unit: m.concept.unit,
        type: draft.type,
        body: draft.body,
        options: draft.options ?? undefined,
        answer: draft.answer,
        explanation: draft.explanation,
        difficulty: draft.difficulty,
        source: "practice",
        verified: false,
      },
    });
    retryQuestionId = q.id;
  }

  const stored: StoredExplanation = {
    v: 1,
    whyWrong: result.whyWrong.trim(),
    correctReasoning: result.correctReasoning.trim(),
    retryQuestionId,
    sources: chunkSources(chunks),
    notInNotes: chunks.length === 0,
  };
  await db.mistake.update({ where: { id: m.id }, data: { explanation: serializeExplanation(stored) } });
  const view = (await explanationViews(userId, [{ id: m.id, explanation: serializeExplanation(stored), resolved: m.resolved }])).get(m.id);
  if (!view) throw new MistakeError("Couldn't save the explanation — try again.");
  return view;
}

/**
 * Answer the retry question. Correct → mistake resolved + quiz evidence. Wrong/partial → stays
 * open, the new wrong answer is logged too (same misconception label, so recurrence counts).
 */
export async function answerMistakeRetry(
  userId: string,
  mistakeId: string,
  questionId: string,
  response: string,
): Promise<RetryOutcomeView> {
  const m = await loadOwnedMistake(userId, mistakeId);
  const stored = parseStoredExplanation(m.explanation);
  if (!stored || stored.retryQuestionId !== questionId) {
    throw new MistakeError("Ask for an explanation first.");
  }
  const q = await db.question.findFirst({ where: { id: questionId, goalId: m.goalId } });
  if (!q) throw new MistakeError("Retry question not found.");

  const invalid = validateObjectiveResponse(q, response);
  if (invalid) throw new MistakeError(invalid);
  const answer = response.trim();

  const already = await db.attempt.findFirst({
    where: { userId, questionId },
    orderBy: { createdAt: "desc" },
    select: { outcome: true, response: true },
  });
  if (already) {
    // One graded attempt per retry question: the answer key has been revealed after it.
    return toRetryOutcome(q, already, m.resolved)!;
  }

  const { outcome } = gradeObjective({ type: q.type, answer: q.answer, options: parseOptions(q.options) }, answer);
  await db.attempt.create({
    data: { questionId, userId, response: answer, outcome, evidenceWeight: 1 },
  });
  await recordEvidence({
    goalId: m.goalId,
    conceptId: m.conceptId,
    evidence: { outcome, difficulty: q.difficulty, kind: "quiz", at: new Date() },
    source: "quiz",
  });

  const resolved = outcome === 1;
  if (resolved) {
    await db.mistake.update({ where: { id: m.id }, data: { resolved: true } });
  } else {
    await recordMistake({
      goalId: m.goalId,
      conceptId: m.conceptId,
      source: "quiz",
      prompt: q.body,
      response: responseText(q, answer),
      misconception: m.misconception,
    });
  }

  return {
    outcome: toOutcome(outcome),
    correctAnswer: correctAnswerText(q),
    correctIndex: correctIndexOf(q),
    explanation: q.explanation,
    response: answer,
    resolved,
  };
}
