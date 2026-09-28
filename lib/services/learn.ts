// Socratic Learn session service (idea.md P0 #6, USP 2). Server-only.
// The LLM grades each reply and writes the message; lib/tutor/ladder.ts decides where the
// session goes; every graded reply and check answer becomes mastery evidence.
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { aiMode, generateQuestions, isAnswerRequest, tutorTurn, type ConceptRef, type QuestionDraft, type TutorResult } from "@/lib/ai";
import { validSources } from "@/lib/ai/guard";
import { rateLimit } from "@/lib/rate-limit";
import { retrieveChunks, type RetrievedChunk } from "@/lib/rag";
import { initialLadder, nextLadder, type LadderState } from "@/lib/tutor/ladder";
import {
  STAGE_DIFFICULTY,
  confidenceOf,
  decayedMastery,
  displayMastery,
  gradeObjective,
  type Confidence,
} from "@/lib/engine";
import { getRecommendation, recordEvidence, recordMistake } from "@/lib/services/core";
import {
  CHECK_COUNT,
  HINT_REQUEST_TEXT,
  checkScore,
  countGradedReplies,
  dedupeDrafts,
  elapsedMinutes,
  evaluationOutcome,
  historyForTutor,
  isStale,
  lastTutorMessage,
  normalizeDraft,
  parseOptions,
  parseStage,
  pickSessionChecks,
  planForConcept,
  responseText,
  toCheckItemView,
  toTutorMessageView,
  validateObjectiveResponse,
} from "@/lib/services/learn-helpers";
import type {
  CheckAnswerView,
  CheckItemView,
  CheckPhaseView,
  LearnPageData,
  LearnSessionView,
  SessionResultView,
  TutorReplyView,
} from "@/components/session/types";
import type { Concept, Goal, Session } from "@/lib/generated/prisma/client";

/** Error whose message is safe to show the student. Actions map everything else to a generic message. */
export class LearnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearnError";
  }
}

type OwnedSession = Session & { concept: Concept; goal: Goal };

// ── small shared pieces ─────────────────────────────────────────────────────

function conceptRef(c: Concept): ConceptRef {
  return { id: c.id, name: c.name, unit: c.unit, description: c.description };
}

/** Retrieval failures must never break a session: the tutor then answers "not in your notes". */
async function safeRetrieve(input: { goalId: string; conceptId: string; query: string; k?: number }): Promise<RetrievedChunk[]> {
  try {
    return await retrieveChunks({ ...input, query: input.query.slice(0, 1000) });
  } catch (err) {
    console.error("[learn] retrieveChunks failed", err);
    return [];
  }
}

async function masteryOf(conceptId: string, now: Date): Promise<{ mastery: number; confidence: Confidence }> {
  const m = await db.mastery.findUnique({ where: { conceptId } });
  if (!m) return { mastery: displayMastery(0), confidence: confidenceOf(0) };
  const state = { theta: m.theta, evidenceCount: m.evidenceCount, lastPracticedAt: m.lastPracticedAt };
  const mastery = state.evidenceCount > 0 ? decayedMastery(state, now) : displayMastery(state.theta);
  return { mastery, confidence: confidenceOf(state.evidenceCount) };
}

async function hinglishFor(userId: string): Promise<boolean> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { hinglish: true } });
  return u?.hinglish ?? false;
}

async function loadOwnedSession(userId: string, sessionId: string): Promise<OwnedSession> {
  const s = await db.session.findFirst({
    where: { id: sessionId, goal: { userId } },
    include: { concept: true, goal: true },
  });
  if (!s) throw new LearnError("Session not found.");
  return s;
}

function ladderOf(s: Session): LadderState {
  return { stage: parseStage(s.stage), failCount: s.failCount, correctStreak: s.correctStreak };
}

function sourcesJson(sources: Array<{ file: string; page: number }>) {
  return sources.map((x) => ({ file: x.file, page: x.page }));
}

/** Student turns allowed per session before it must move on to the check questions. */
export const MAX_STUDENT_TURNS = 40;

/**
 * The service never trusts the AI layer's citations or ladder: citations must match a chunk
 * the tutor was given, and the next stage is recomputed from the (untrusted) grade.
 */
function checkedTurn(result: TutorResult, chunks: RetrievedChunk[]) {
  const sources = validSources(result.turn.sources, chunks);
  return {
    message: result.turn.message.slice(0, 4000),
    misconception: result.turn.misconception?.trim().slice(0, 200) || null,
    sources,
    notInNotes: chunks.length === 0 || sources.length === 0,
  };
}

// ── check questions ─────────────────────────────────────────────────────────

async function selectSessionChecks(s: Session, userId: string): Promise<CheckItemView[]> {
  const candidates = await db.question.findMany({
    where: {
      goalId: s.goalId,
      conceptId: s.conceptId,
      source: { in: ["check", "practice"] },
      type: { in: ["mcq", "numeric"] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 60,
  });
  if (candidates.length === 0) return [];
  const attempts = await db.attempt.findMany({
    where: { userId, questionId: { in: candidates.map((q) => q.id) } },
    select: { questionId: true, sessionId: true, response: true, outcome: true, createdAt: true },
  });
  const fill = s.status === "active" || s.status === "checking";
  return pickSessionChecks({ candidates, attempts, sessionId: s.id, fill }).map(({ question, attempt }) =>
    toCheckItemView(question, attempt),
  );
}

async function safeGenerate(input: Parameters<typeof generateQuestions>[0]): Promise<QuestionDraft[]> {
  try {
    return await generateQuestions(input);
  } catch (err) {
    console.error(`[learn] generateQuestions(${input.purpose}) failed`, err);
    return [];
  }
}

/**
 * Make sure the concept has CHECK_COUNT usable check questions for this student. Generated
 * questions are cached as Question rows (source check, or practice when only the practice bank
 * has any) so later sessions reuse them. Zero available is allowed: the session can finish without.
 */
async function ensureCheckQuestions(s: OwnedSession, userId: string): Promise<CheckItemView[]> {
  const current = await selectSessionChecks(s, userId);
  if (current.length >= CHECK_COUNT) return current;
  // Don't regenerate on every call when generation keeps coming back short.
  if (!(await rateLimit("checkGen", s.id)).ok) return current;

  const ref = conceptRef(s.concept);
  const chunks = await safeRetrieve({
    goalId: s.goalId,
    conceptId: s.conceptId,
    query: `${s.concept.name} ${s.concept.description ?? ""}`,
    k: 4,
  });
  const context = chunks.map((c) => c.text).join("\n\n").slice(0, 4000) || undefined;

  let source: "check" | "practice" = "check";
  let drafts = await safeGenerate({ subject: s.goal.subject, concepts: [ref], count: CHECK_COUNT, purpose: "check", context });
  if (drafts.length === 0) {
    source = "practice";
    drafts = await safeGenerate({ subject: s.goal.subject, concepts: [ref], count: CHECK_COUNT, purpose: "practice", context });
  }

  const usable = drafts
    .map((d) => {
      const n = normalizeDraft(d);
      return n ? { ...n, verified: d.verified } : null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  if (usable.length > 0) {
    const existing = await db.question.findMany({
      where: { goalId: s.goalId, conceptId: s.conceptId },
      select: { body: true },
    });
    const fresh = dedupeDrafts(usable, existing.map((q) => q.body));
    if (fresh.length > 0) {
      await db.question.createMany({
        data: fresh.map((d) => ({
          goalId: s.goalId,
          conceptId: s.conceptId,
          unit: s.concept.unit,
          type: d.type,
          body: d.body,
          options: d.options ?? undefined,
          answer: d.answer,
          explanation: d.explanation,
          difficulty: d.difficulty,
          source,
          verified: d.verified,
        })),
      });
    }
  }
  return selectSessionChecks(s, userId);
}

// ── views ───────────────────────────────────────────────────────────────────

async function buildSessionView(userId: string, sessionId: string, now: Date = new Date()): Promise<LearnSessionView> {
  const s = await db.session.findFirst({
    where: { id: sessionId, goal: { userId } },
    include: { concept: true, turns: { orderBy: { createdAt: "asc" } } },
  });
  if (!s) notFound();
  const [hinglish, m, checks] = await Promise.all([
    hinglishFor(userId),
    masteryOf(s.conceptId, now),
    s.status === "active" ? Promise.resolve<CheckItemView[]>([]) : selectSessionChecks(s, userId),
  ]);
  const status = s.status;
  return {
    id: s.id,
    goalId: s.goalId,
    concept: { id: s.concept.id, name: s.concept.name, unit: s.concept.unit, description: s.concept.description },
    status,
    stage: status === "checking" || status === "completed" ? "check" : parseStage(s.stage),
    plannedMin: s.plannedMin,
    reason: s.reason,
    masteryBefore: s.masteryBefore,
    masteryNow: m.mastery,
    masteryAfter: s.masteryAfter,
    turns: s.turns.map(toTutorMessageView),
    checks,
    startedAt: s.createdAt.toISOString(),
    hinglish,
    aiMode: aiMode(),
    confidence: m.confidence,
    gradedReplies: countGradedReplies(s.turns).graded,
    actualMin: s.actualMin,
  };
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Resume the latest active/checking session for this concept, or start a new one with an
 * opening tutor turn. The concept must belong to one of the user's goals (else 404).
 */
export async function getOrStartSession(userId: string, conceptId: string): Promise<LearnSessionView> {
  const concept = await db.concept.findFirst({ where: { id: conceptId, goal: { userId } }, include: { goal: true } });
  if (!concept) notFound();
  const now = new Date();

  const open = await db.session.findFirst({
    where: { conceptId, goalId: concept.goalId, status: { in: ["active", "checking"] } },
    orderBy: { createdAt: "desc" },
  });
  if (open && !isStale(open.createdAt, now)) return buildSessionView(userId, open.id, now);
  if (open) {
    // A session left open for hours would show a nonsense timer; close it and start fresh.
    await db.session.updateMany({
      where: { conceptId, goalId: concept.goalId, status: { in: ["active", "checking"] } },
      data: { status: "abandoned" },
    });
  }

  let rec = null;
  try {
    rec = await getRecommendation(concept.goal, now);
  } catch (err) {
    console.error("[learn] getRecommendation failed", err);
  }
  const plan = planForConcept(rec, concept);
  const before = await masteryOf(conceptId, now);
  const ladder = initialLadder();

  const session = await db.session.create({
    data: {
      goalId: concept.goalId,
      conceptId,
      plannedMin: plan.plannedMin,
      reason: plan.reason,
      masteryBefore: before.mastery,
      stage: ladder.stage,
      failCount: ladder.failCount,
      correctStreak: ladder.correctStreak,
    },
  });

  const chunks = await safeRetrieve({
    goalId: concept.goalId,
    conceptId,
    query: `${concept.name} ${concept.description ?? ""}`,
    k: 4,
  });
  const hinglish = await hinglishFor(userId);
  let opening: TutorResult | null = null;
  const allowed = (await rateLimit("tutor", userId)).ok;
  if (allowed) try {
    opening = await tutorTurn({
      subject: concept.goal.subject,
      concept: conceptRef(concept),
      ladder,
      history: [],
      studentMessage: null,
      chunks,
      hinglish,
    });
  } catch (err) {
    console.error("[learn] opening tutorTurn failed", err);
  }
  const openingTurn = opening ? checkedTurn(opening, chunks) : null;

  await db.tutorTurn.create({
    data: openingTurn
      ? {
          sessionId: session.id,
          role: "tutor",
          content: openingTurn.message,
          stage: ladder.stage,
          evaluation: "not_applicable",
          misconception: null,
          sources: sourcesJson(openingTurn.sources),
          notInNotes: openingTurn.notInNotes,
        }
      : {
          sessionId: session.id,
          role: "tutor",
          content: `Let's work on ${concept.name}. Before I explain anything: in your own words, what do you think it is about, and where have you seen it used?`,
          stage: "probe",
          evaluation: "not_applicable",
          sources: [],
          notInNotes: chunks.length === 0,
        },
  });

  return buildSessionView(userId, session.id, now);
}

/** Everything the /learn/[conceptId] page needs. `sessionId` pins a specific (e.g. completed) session. */
export async function getLearnPageData(
  userId: string,
  conceptId: string,
  sessionId: string | null,
): Promise<LearnPageData> {
  let session: LearnSessionView;
  if (sessionId) {
    const owned = await db.session.findFirst({
      where: { id: sessionId, conceptId, goal: { userId } },
      select: { id: true },
    });
    session = owned ? await buildSessionView(userId, owned.id) : await getOrStartSession(userId, conceptId);
  } else {
    session = await getOrStartSession(userId, conceptId);
  }
  const result = session.status === "completed" ? await getSessionResult(userId, session.id) : null;
  return { session, result };
}

/** One student reply → graded, persisted, evidence recorded, ladder advanced. */
export async function sendTutorMessage(userId: string, sessionId: string, text: string): Promise<TutorReplyView> {
  const s = await loadOwnedSession(userId, sessionId);
  if (s.status === "checking") throw new LearnError("The dialogue is done — answer the check questions.");
  if (s.status !== "active") throw new LearnError("This session has ended. Start a new one from the dashboard.");

  const turns = await db.tutorTurn.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
  if (turns.filter((t) => t.role === "student").length >= MAX_STUDENT_TURNS) {
    throw new LearnError("That's a long session — move on to the check questions to wrap it up.");
  }
  const before = ladderOf(s);
  const chunks = await safeRetrieve({ goalId: s.goalId, conceptId: s.conceptId, query: `${s.concept.name} ${text}`, k: 4 });

  let result: TutorResult;
  try {
    result = await tutorTurn({
      subject: s.goal.subject,
      concept: conceptRef(s.concept),
      ladder: before,
      history: historyForTutor(turns),
      studentMessage: text,
      chunks,
      hinglish: await hinglishFor(userId),
    });
  } catch (err) {
    console.error("[learn] tutorTurn failed", err);
    throw new LearnError("The tutor couldn't reply just now. Your message wasn't sent — try again.");
  }

  // Recompute the transition here; the grade is the only thing taken from the tutor.
  const signal =
    result.turn.evaluation === "not_applicable" && isAnswerRequest(text) ? "answer_request" : result.turn.evaluation;
  const after = nextLadder(before, signal);
  const turn = checkedTurn(result, chunks);
  const outcome = evaluationOutcome(result.turn.evaluation);
  const misconception = outcome !== null && outcome < 1 ? turn.misconception : null;
  const reachedCheck = after.stage === "check";
  const t = Date.now();

  const [studentRow, tutorRow] = await db.$transaction([
    db.tutorTurn.create({
      data: { sessionId, role: "student", content: text, stage: before.stage, createdAt: new Date(t) },
    }),
    db.tutorTurn.create({
      data: {
        sessionId,
        role: "tutor",
        content: turn.message,
        stage: after.stage,
        evaluation: result.turn.evaluation,
        misconception,
        sources: sourcesJson(turn.sources),
        notInNotes: turn.notInNotes,
        createdAt: new Date(t + 1),
      },
    }),
    db.session.update({
      where: { id: sessionId },
      data: {
        stage: after.stage,
        failCount: after.failCount,
        correctStreak: after.correctStreak,
        ...(reachedCheck ? { status: "checking" as const } : {}),
      },
    }),
  ]);

  if (outcome !== null) {
    await recordEvidence({
      goalId: s.goalId,
      conceptId: s.conceptId,
      evidence: { outcome, difficulty: STAGE_DIFFICULTY[before.stage], kind: "socratic", at: new Date() },
      source: "socratic",
    });
    if (outcome < 1) {
      await recordMistake({
        goalId: s.goalId,
        conceptId: s.conceptId,
        source: "socratic",
        prompt: lastTutorMessage(turns) ?? s.concept.name,
        response: text,
        misconception,
      });
    }
  }

  const status = reachedCheck ? "checking" : "active";
  const checks = reachedCheck ? await ensureCheckQuestions({ ...s, status }, userId) : [];
  const m = await masteryOf(s.conceptId, new Date());
  return {
    messages: [toTutorMessageView(studentRow), toTutorMessageView(tutorRow)],
    masteryNow: m.mastery,
    confidence: m.confidence,
    stage: reachedCheck ? "check" : after.stage,
    status,
    checks,
    gradedReplies: countGradedReplies([...turns, tutorRow]).graded,
  };
}

/** "Hint" button: one rung up the ladder, a hint turn, no evidence recorded. */
export async function requestHint(userId: string, sessionId: string): Promise<TutorReplyView> {
  const s = await loadOwnedSession(userId, sessionId);
  if (s.status !== "active") throw new LearnError("Hints are available during the dialogue only.");
  const before = ladderOf(s);
  if (before.stage === "check") throw new LearnError("You're at the check stage — no more hints.");
  if (before.stage === "worked_step") throw new LearnError("You've already seen the worked step — try answering in your own words.");

  const turns = await db.tutorTurn.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
  const ladder = nextLadder(before, "hint_request");
  const chunks = await safeRetrieve({
    goalId: s.goalId,
    conceptId: s.conceptId,
    query: `${s.concept.name} ${lastTutorMessage(turns) ?? ""}`,
    k: 4,
  });

  let result: TutorResult;
  try {
    result = await tutorTurn({
      subject: s.goal.subject,
      concept: conceptRef(s.concept),
      ladder,
      signal: "hint_request",
      history: historyForTutor(turns),
      studentMessage: HINT_REQUEST_TEXT,
      chunks,
      hinglish: await hinglishFor(userId),
    });
  } catch (err) {
    console.error("[learn] hint tutorTurn failed", err);
    throw new LearnError("Couldn't fetch a hint just now — try again.");
  }

  const hintTurn = checkedTurn(result, chunks);
  const t = Date.now();
  // The ladder (not the model) owns the stage; a hint is never graded.
  const [studentRow, tutorRow] = await db.$transaction([
    db.tutorTurn.create({
      data: { sessionId, role: "student", content: HINT_REQUEST_TEXT, stage: before.stage, createdAt: new Date(t) },
    }),
    db.tutorTurn.create({
      data: {
        sessionId,
        role: "tutor",
        content: hintTurn.message,
        stage: ladder.stage,
        evaluation: "not_applicable",
        misconception: null,
        sources: sourcesJson(hintTurn.sources),
        notInNotes: hintTurn.notInNotes,
        createdAt: new Date(t + 1),
      },
    }),
    db.session.update({
      where: { id: sessionId },
      data: { stage: ladder.stage, failCount: ladder.failCount, correctStreak: ladder.correctStreak },
    }),
  ]);

  const m = await masteryOf(s.conceptId, new Date());
  return {
    messages: [toTutorMessageView(studentRow), toTutorMessageView(tutorRow)],
    masteryNow: m.mastery,
    confidence: m.confidence,
    stage: ladder.stage,
    status: "active",
    checks: [],
    gradedReplies: countGradedReplies(turns).graded,
  };
}

/** "I'm ready — check me": allowed after ≥ 1 graded reply. */
export async function startChecks(userId: string, sessionId: string): Promise<CheckPhaseView> {
  const s = await loadOwnedSession(userId, sessionId);
  if (s.status === "completed" || s.status === "abandoned") throw new LearnError("This session has ended.");
  if (s.status === "active") {
    const turns = await db.tutorTurn.findMany({ where: { sessionId }, select: { role: true, evaluation: true } });
    if (countGradedReplies(turns).graded < 1) {
      throw new LearnError("Answer at least one of the tutor's questions first.");
    }
    await db.session.update({ where: { id: sessionId }, data: { status: "checking", stage: "check" } });
  }
  const checks = await ensureCheckQuestions({ ...s, status: "checking" }, userId);
  return { status: "checking", stage: "check", checks };
}

/** Grade one check question (deterministic), record evidence + mistake. Idempotent per question. */
export async function answerCheck(
  userId: string,
  sessionId: string,
  questionId: string,
  response: string,
): Promise<CheckAnswerView> {
  const s = await loadOwnedSession(userId, sessionId);
  if (s.status !== "checking") throw new LearnError("Check questions aren't open for this session.");

  const checks = await selectSessionChecks(s, userId);
  const item = checks.find((c) => c.id === questionId);
  if (!item) throw new LearnError("That question isn't part of this session.");
  if (item.answered) {
    const m = await masteryOf(s.conceptId, new Date());
    return { check: item, masteryNow: m.mastery, confidence: m.confidence };
  }

  const q = await db.question.findUniqueOrThrow({ where: { id: questionId } });
  const invalid = validateObjectiveResponse(q, response);
  if (invalid) throw new LearnError(invalid);
  const answer = response.trim();
  const { outcome } = gradeObjective({ type: q.type, answer: q.answer, options: parseOptions(q.options) }, answer);

  const attempt = await db.attempt.create({
    data: { questionId, userId, sessionId, response: answer, outcome, evidenceWeight: 1 },
  });
  await recordEvidence({
    goalId: s.goalId,
    conceptId: s.conceptId,
    evidence: { outcome, difficulty: q.difficulty, kind: "check", at: new Date() },
    source: "check",
  });
  if (outcome < 1) {
    await recordMistake({
      goalId: s.goalId,
      conceptId: s.conceptId,
      source: "check",
      prompt: q.body,
      response: responseText(q, answer),
      misconception: null,
    });
  }

  const m = await masteryOf(s.conceptId, new Date());
  return { check: toCheckItemView(q, attempt), masteryNow: m.mastery, confidence: m.confidence };
}

/** Close the session: mastery after, minutes spent, and the re-ranked next recommendation. */
export async function completeSession(userId: string, sessionId: string): Promise<SessionResultView> {
  const s = await loadOwnedSession(userId, sessionId);
  if (s.status === "completed") return getSessionResult(userId, sessionId);
  if (s.status === "abandoned") throw new LearnError("This session was closed. Start a new one from the dashboard.");

  const now = new Date();
  const m = await masteryOf(s.conceptId, now);
  await db.session.update({
    where: { id: sessionId },
    data: {
      status: "completed",
      stage: "check",
      masteryAfter: m.mastery,
      actualMin: elapsedMinutes(s.createdAt, now),
      completedAt: now,
    },
  });
  return getSessionResult(userId, sessionId);
}

/** Result view of a completed session (also used when a completed session is revisited). */
export async function getSessionResult(userId: string, sessionId: string): Promise<SessionResultView> {
  const s = await loadOwnedSession(userId, sessionId);
  const now = new Date();
  const [turns, checks, mistakesLogged, m] = await Promise.all([
    db.tutorTurn.findMany({ where: { sessionId }, select: { role: true, evaluation: true } }),
    selectSessionChecks(s, userId),
    db.mistake.count({
      where: {
        goalId: s.goalId,
        conceptId: s.conceptId,
        source: { in: ["socratic", "check"] },
        createdAt: { gte: s.createdAt, lte: s.completedAt ?? now },
      },
    }),
    masteryOf(s.conceptId, now),
  ]);

  let nextRecommendation = null;
  try {
    nextRecommendation = await getRecommendation(s.goal, now);
  } catch (err) {
    console.error("[learn] getRecommendation failed", err);
  }

  const replies = countGradedReplies(turns);
  const score = checkScore(checks);
  const masteryAfter = s.masteryAfter ?? m.mastery;
  return {
    conceptId: s.conceptId,
    masteryBefore: s.masteryBefore,
    masteryAfter,
    delta: masteryAfter - s.masteryBefore,
    nextRecommendation,
    summary: {
      gradedReplies: replies.graded,
      correctReplies: replies.correct,
      checksAnswered: score.answered,
      checkScore: score.score,
      checksTotal: score.total,
      mistakesLogged,
      actualMin: s.actualMin,
    },
  };
}

/** P1 Hinglish toggle: applies from the next tutor turn / explanation. */
export async function setHinglish(userId: string, on: boolean): Promise<boolean> {
  const u = await db.user.update({ where: { id: userId }, data: { hinglish: on }, select: { hinglish: true } });
  return u.hinglish;
}
