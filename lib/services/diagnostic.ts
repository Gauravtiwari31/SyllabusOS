// Adaptive diagnostic — server glue between Postgres, the question generator and the
// pure selector (lib/services/diagnostic-select.ts). Server-only.
//
// State is never stored separately: it is rebuilt from the student's Attempts on the
// goal's diagnostic Questions, so the diagnostic is resumable after a reload, and the
// deterministic selector always serves the same next question for the same answers.
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { Goal } from "@/lib/generated/prisma/client";
import { generateQuestions, type ConceptRef, type QuestionDraft } from "@/lib/ai";
import { gradeObjective, type Outcome } from "@/lib/engine";
import { getGraphData, recordEvidence, recordMistake, recordUnitPrior } from "@/lib/services/core";
import type { ConceptGraphData } from "@/lib/types";
import type { DiagnosticAnswer, DiagnosticQuestion, DiagnosticStart } from "@/components/diagnostic/types";
import {
  buildSelectorConcepts,
  DIAGNOSTIC_MAX_QUESTIONS,
  DIAGNOSTIC_POOL_TARGET,
  pickNext,
  pickReasonText,
  plannedTotal,
  rankCandidates,
  transitiveDependentCounts,
  type AskedEntry,
  type SelectorConcept,
  type SelectorState,
} from "./diagnostic-select";

/** Max stored diagnostic questions per concept (a spare one keeps the pool robust). */
const MAX_PER_CONCEPT = 2;

/** User-facing error: its message is safe to show in a toast. */
export class DiagnosticError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiagnosticError";
  }
}

interface PoolQuestion {
  id: string;
  conceptId: string;
  type: "mcq" | "numeric";
  body: string;
  options: string[] | null;
  answer: string;
  explanation: string | null;
  difficulty: number;
  verified: boolean;
  createdAt: Date;
}

interface DiagnosticContext {
  concepts: Array<{ id: string; name: string; unit: string }>;
  names: Map<string, { name: string; unit: string }>;
  selector: SelectorConcept[];
  pool: PoolQuestion[];
  attemptedQuestionIds: Set<string>;
  asked: AskedEntry[];
  state: SelectorState;
}

export function parseOptions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.filter((o): o is string => typeof o === "string");
  return out.length === raw.length ? out : null;
}

function toOutcome(x: number): Outcome {
  return x >= 1 ? 1 : x > 0 ? 0.5 : 0;
}

async function loadContext(goalId: string, userId: string): Promise<DiagnosticContext> {
  const [concepts, edges, questions, attempts] = await Promise.all([
    db.concept.findMany({
      where: { goalId },
      select: { id: true, name: true, unit: true, weightage: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    db.conceptEdge.findMany({ where: { goalId }, select: { fromConceptId: true, toConceptId: true } }),
    db.question.findMany({
      where: { goalId, source: "diagnostic", conceptId: { not: null }, type: { in: ["mcq", "numeric"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.attempt.findMany({
      where: { userId, question: { goalId, source: "diagnostic" } },
      select: { questionId: true, outcome: true, question: { select: { conceptId: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const pool: PoolQuestion[] = [];
  for (const q of questions) {
    if (!q.conceptId || (q.type !== "mcq" && q.type !== "numeric")) continue;
    const options = parseOptions(q.options);
    if (q.type === "mcq" && (!options || options.length < 2)) continue;
    pool.push({
      id: q.id,
      conceptId: q.conceptId,
      type: q.type,
      body: q.body,
      options: q.type === "mcq" ? options : null,
      answer: q.answer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      verified: q.verified,
      createdAt: q.createdAt,
    });
  }

  // One entry per concept (its first attempt), oldest first.
  const asked: AskedEntry[] = [];
  const seen = new Set<string>();
  for (const a of attempts) {
    const cid = a.question.conceptId;
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    asked.push({ conceptId: cid, outcome: toOutcome(a.outcome) });
  }

  const selector = buildSelectorConcepts(
    concepts,
    edges.map((e) => ({ from: e.fromConceptId, to: e.toConceptId })),
  );
  const poolByConcept: Record<string, number> = {};
  for (const q of pool) poolByConcept[q.conceptId] = (poolByConcept[q.conceptId] ?? 0) + 1;

  return {
    concepts,
    names: new Map(concepts.map((c) => [c.id, { name: c.name, unit: c.unit }])),
    selector,
    pool,
    attemptedQuestionIds: new Set(attempts.map((a) => a.questionId)),
    asked,
    state: { concepts: selector, asked, poolByConcept, maxQuestions: DIAGNOSTIC_MAX_QUESTIONS },
  };
}

/** Within a concept: verified first, then the most informative (difficulty nearest 0), then oldest. */
function chooseQuestion(ctx: DiagnosticContext, conceptId: string): PoolQuestion | null {
  const candidates = ctx.pool.filter((q) => q.conceptId === conceptId && !ctx.attemptedQuestionIds.has(q.id));
  candidates.sort(
    (a, b) =>
      Number(b.verified) - Number(a.verified) ||
      Math.abs(a.difficulty) - Math.abs(b.difficulty) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  return candidates[0] ?? null;
}

function nextQuestion(ctx: DiagnosticContext): DiagnosticQuestion | null {
  const pick = pickNext(ctx.state);
  if (!pick) return null;
  const q = chooseQuestion(ctx, pick.conceptId);
  if (!q) return null;
  const deps = transitiveDependentCounts(ctx.selector).get(pick.conceptId) ?? 0;
  const concept = ctx.names.get(pick.conceptId);
  return {
    id: q.id,
    index: ctx.asked.length + 1,
    total: plannedTotal(ctx.state),
    conceptName: concept?.name ?? null,
    unit: concept?.unit ?? null,
    type: q.type,
    body: q.body,
    options: q.options,
    why: pick.reason,
    whyText: pickReasonText(pick, ctx.names, deps),
  };
}

// ── Pool (cached generated diagnostics) ─────────────────────────────────────

function toRef(c: { id: string; name: string; unit: string; description: string | null }): ConceptRef {
  return { id: c.id, name: c.name, unit: c.unit, description: c.description };
}

function parseNumber(s: string): number {
  return Number.parseFloat(s.replace(/[,\s]/g, "").replace(/[^0-9eE+\-.]/g, ""));
}

function isUsableDraft(d: QuestionDraft): boolean {
  if (typeof d.body !== "string" || d.body.trim().length < 8) return false;
  if (d.type === "mcq") {
    const opts = d.options;
    if (!Array.isArray(opts) || opts.length < 2 || opts.length > 6) return false;
    if (opts.some((o) => typeof o !== "string" || o.trim().length === 0)) return false;
    const idx = Number(d.answer);
    return Number.isInteger(idx) && idx >= 0 && idx < opts.length;
  }
  if (d.type === "numeric") return Number.isFinite(parseNumber(String(d.answer)));
  return false;
}

async function fillPool(goal: Pick<Goal, "id" | "subject">): Promise<number> {
  const [concepts, edges, existing] = await Promise.all([
    db.concept.findMany({
      where: { goalId: goal.id },
      select: { id: true, name: true, unit: true, description: true, weightage: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    db.conceptEdge.findMany({ where: { goalId: goal.id }, select: { fromConceptId: true, toConceptId: true } }),
    db.question.findMany({
      where: { goalId: goal.id, source: "diagnostic", conceptId: { not: null }, type: { in: ["mcq", "numeric"] } },
      select: { conceptId: true },
    }),
  ]);
  const perConcept = new Map<string, number>();
  for (const q of existing) if (q.conceptId) perConcept.set(q.conceptId, (perConcept.get(q.conceptId) ?? 0) + 1);
  if (perConcept.size >= DIAGNOSTIC_MAX_QUESTIONS || concepts.length === 0) return 0;

  // Generate for the best ~14 candidates (high weightage + prerequisite roots) that
  // don't have a question yet. Concepts the generator can't cover are simply skipped.
  const selector = buildSelectorConcepts(
    concepts,
    edges.map((e) => ({ from: e.fromConceptId, to: e.toConceptId })),
  );
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const targets = rankCandidates(selector)
    .filter((c) => !perConcept.has(c.id))
    .slice(0, Math.max(0, DIAGNOSTIC_POOL_TARGET - perConcept.size))
    .map((c) => byId.get(c.id)!);
  if (targets.length === 0) return 0;
  // A generation that came back empty must not be retried on every page load.
  if (!(await rateLimit("poolGen", goal.id)).ok) return 0;

  let drafts: QuestionDraft[];
  try {
    drafts = await generateQuestions({
      subject: goal.subject,
      concepts: targets.map(toRef),
      count: targets.length,
      purpose: "diagnostic",
    });
  } catch (err) {
    console.error("[diagnostic] question generation failed", err);
    return 0;
  }

  const rows = [];
  for (const d of drafts) {
    const concept = d.conceptId ? byId.get(d.conceptId) : undefined;
    // Unit-level drafts (conceptId null) are skipped: the diagnostic needs a concept to
    // record direct evidence on; unit coverage comes from recordUnitPrior instead.
    if (!concept || !isUsableDraft(d)) continue;
    const n = perConcept.get(concept.id) ?? 0;
    if (n >= MAX_PER_CONCEPT) continue;
    perConcept.set(concept.id, n + 1);
    const difficulty = Number.isFinite(d.difficulty) ? Math.max(-2, Math.min(2, d.difficulty)) : 0;
    rows.push({
      goalId: goal.id,
      conceptId: concept.id,
      unit: concept.unit,
      type: d.type,
      body: d.body.trim(),
      ...(d.type === "mcq" && d.options ? { options: d.options } : {}),
      answer: String(d.answer).trim(),
      explanation: d.explanation?.trim() || null,
      difficulty,
      source: "diagnostic" as const,
      verified: Boolean(d.verified),
    });
  }
  if (rows.length === 0) return 0;
  await db.question.createMany({ data: rows });
  return rows.length;
}

const inflight = new Map<string, Promise<number>>();

/**
 * Make sure the goal has diagnostic questions for ≥ 10 concepts, generating (and
 * verifying, inside lib/ai) the missing ones once. Stored questions are the cache:
 * later visits never regenerate. Concurrent calls for the same goal share one run.
 * Returns the number of newly stored questions.
 */
export function ensurePool(goal: Pick<Goal, "id" | "subject">): Promise<number> {
  const running = inflight.get(goal.id);
  if (running) return running;
  const run = fillPool(goal).finally(() => inflight.delete(goal.id));
  inflight.set(goal.id, run);
  return run;
}

/** Number of concepts that already have diagnostic questions (for the loading copy). */
export async function poolConceptCount(goalId: string): Promise<number> {
  const rows = await db.question.findMany({
    where: { goalId, source: "diagnostic", conceptId: { not: null }, type: { in: ["mcq", "numeric"] } },
    select: { conceptId: true },
    distinct: ["conceptId"],
  });
  return rows.length;
}

/** Diagnostic answers so far (distinct concepts). */
export async function answeredCount(goalId: string, userId: string): Promise<number> {
  const rows = await db.attempt.findMany({
    where: { userId, question: { goalId, source: "diagnostic" } },
    select: { question: { select: { conceptId: true } } },
  });
  return new Set(rows.map((r) => r.question.conceptId).filter(Boolean)).size;
}

// ── Flow ────────────────────────────────────────────────────────────────────

/** Current (or first) question. Generates the pool only before the first answer. */
export async function startFor(goal: Goal, userId: string): Promise<DiagnosticStart> {
  if (goal.status === "draft") throw new DiagnosticError("Confirm your concept graph first.");
  let ctx = await loadContext(goal.id, userId);
  if (goal.status === "diagnosing" && ctx.asked.length === 0) {
    const added = await ensurePool(goal);
    if (added > 0) ctx = await loadContext(goal.id, userId);
  }
  const question = goal.status === "active" ? null : nextQuestion(ctx);
  const total = plannedTotal(ctx.state);
  return {
    question,
    answered: ctx.asked.length,
    total,
    poolEmpty: ctx.asked.length === 0 && ctx.pool.length === 0,
  };
}

export async function answerFor(input: {
  goal: Goal;
  userId: string;
  questionId: string;
  response: string;
  now?: Date;
}): Promise<DiagnosticAnswer> {
  const { goal, userId } = input;
  const now = input.now ?? new Date();
  if (goal.status !== "diagnosing") {
    throw new DiagnosticError(
      goal.status === "active" ? "This diagnostic is already finished." : "Confirm your concept graph first.",
    );
  }

  const question = await db.question.findFirst({
    where: { id: input.questionId, goalId: goal.id, source: "diagnostic" },
    include: { concept: { select: { id: true, name: true, unit: true } } },
  });
  if (!question || !question.concept || (question.type !== "mcq" && question.type !== "numeric")) {
    throw new DiagnosticError("That question isn't part of this diagnostic.");
  }
  const concept = question.concept;
  const options = question.type === "mcq" ? parseOptions(question.options) : null;
  const gradable = { type: question.type, answer: question.answer, options };

  // Idempotent: a double submit returns the stored result instead of counting twice.
  const previous = await db.attempt.findFirst({
    where: { questionId: question.id, userId },
    orderBy: { createdAt: "asc" },
  });

  let outcome: Outcome;
  if (previous) {
    outcome = toOutcome(previous.outcome);
  } else {
    const response = input.response.trim();
    if (question.type === "mcq") {
      const idx = Number(response);
      if (!/^\d+$/.test(response) || !options || idx >= options.length) {
        throw new DiagnosticError("Pick one of the options.");
      }
    } else if (response.length === 0) {
      throw new DiagnosticError("Enter a number.");
    }

    const ctx = await loadContext(goal.id, userId);
    if (ctx.asked.some((a) => a.conceptId === concept.id)) {
      throw new DiagnosticError("This concept was already covered. Reload to continue.");
    }
    if (ctx.asked.length >= DIAGNOSTIC_MAX_QUESTIONS) {
      throw new DiagnosticError("The diagnostic is already complete.");
    }

    outcome = gradeObjective(gradable, response).outcome;
    await db.attempt.create({
      data: { questionId: question.id, userId, response, outcome, evidenceWeight: 1 },
    });

    // 1) Direct evidence on the concept the question tests (full quiz weight).
    await recordEvidence({
      goalId: goal.id,
      conceptId: concept.id,
      evidence: { outcome, difficulty: question.difficulty, kind: "diagnostic", at: now },
      source: "diagnostic",
    });
    // 2) The same answer as a low-confidence PRIOR for every concept in its unit
    //    (evidence weight 0.3, see EVIDENCE_WEIGHT.unit_prior). This is how ≤ 10
    //    questions honestly cover 30+ concepts: untested concepts get a dashed,
    //    "low confidence" estimate instead of a fabricated score, and concepts with
    //    direct evidence barely move (applyUnitPrior).
    await recordUnitPrior({
      goalId: goal.id,
      unit: concept.unit,
      evidence: { outcome, difficulty: question.difficulty, at: now },
    });
    // 3) Wrong / partial → mistake log (no misconception label for objective items).
    if (outcome < 1) {
      const chosen =
        question.type === "mcq" && options ? (options[Number(response)] ?? response) : response;
      await recordMistake({
        goalId: goal.id,
        conceptId: concept.id,
        source: "diagnostic",
        prompt: question.body,
        response: chosen,
        misconception: null,
      });
    }
  }

  const correctAnswer = gradeObjective(gradable, question.answer).correctAnswerText;
  const ctx = await loadContext(goal.id, userId);
  const next = nextQuestion(ctx);
  return {
    outcome,
    correctAnswer,
    explanation: question.explanation,
    next,
    done: next === null,
    answered: ctx.asked.length,
    total: plannedTotal(ctx.state),
    updated: { conceptName: concept.name, unit: concept.unit },
  };
}

/** Diagnostic → active. Safe to call repeatedly. */
export async function finishFor(goal: Goal): Promise<ConceptGraphData> {
  if (goal.status === "draft") throw new DiagnosticError("Confirm your concept graph first.");
  if (goal.status !== "active") {
    await db.goal.update({ where: { id: goal.id }, data: { status: "active" } });
  }
  return getGraphData(goal.id);
}
