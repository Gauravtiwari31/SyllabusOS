// Pure helpers for the Learn session service (lib/services/learn.ts). No DB, no LLM, no clock:
// everything here is deterministic so it can be unit-tested in isolation.
import { SourceRefSchema, TutorStageSchema, type Evaluation, type SourceRef, type TutorStage } from "@/lib/ai/schemas";
import type { Outcome } from "@/lib/engine/types";
import type { CheckItemView } from "@/components/session/types";
import type { TutorMessageView } from "@/lib/types";
import { HINT_REQUEST_TEXT, MAX_MESSAGE_CHARS } from "@/components/tutor/constants";

export { HINT_REQUEST_TEXT, MAX_MESSAGE_CHARS };

/** Check questions shown at the end of a session (idea.md P0 #6: "2–3 check questions"). */
export const CHECK_COUNT = 3;
/** Tutor history window passed to the model. */
export const HISTORY_TURNS = 12;
/** actualMin is capped so a tab left open overnight doesn't pollute "minutes studied". */
export const MAX_SESSION_MINUTES = 180;
/** Planned-minute clamp for a concept the student picked themselves. */
export const PLANNED_MIN = 15;
export const PLANNED_MAX = 45;
/** An active session older than this is abandoned and a fresh one starts. */
export const STALE_SESSION_HOURS = 6;
const GRADED: ReadonlySet<Evaluation> = new Set<Evaluation>(["correct", "partial", "wrong"]);

/** Tutor evaluation of a student reply → evidence outcome (null = not gradable, no evidence). */
export function evaluationOutcome(evaluation: Evaluation | string | null | undefined): Outcome | null {
  switch (evaluation) {
    case "correct":
      return 1;
    case "partial":
      return 0.5;
    case "wrong":
      return 0;
    default:
      return null;
  }
}

export function isGradedEvaluation(evaluation: string | null | undefined): evaluation is "correct" | "partial" | "wrong" {
  return evaluation != null && GRADED.has(evaluation as Evaluation);
}

/** Session.stage is a free string in the DB; anything unexpected falls back to probe. */
export function parseStage(stage: string | null | undefined): TutorStage {
  const r = TutorStageSchema.safeParse(stage);
  return r.success ? r.data : "probe";
}

export function parseEvaluation(evaluation: string | null | undefined): Evaluation | null {
  return evaluation === "correct" ||
    evaluation === "partial" ||
    evaluation === "wrong" ||
    evaluation === "not_applicable"
    ? evaluation
    : null;
}

/** TutorTurn.sources Json → SourceRef[] (invalid entries dropped, duplicates collapsed). */
export function parseSources(raw: unknown): SourceRef[] {
  if (!Array.isArray(raw)) return [];
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const r = SourceRefSchema.safeParse(item);
    if (!r.success) continue;
    const key = `${r.data.file}#${r.data.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r.data);
  }
  return out;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Planned minutes + reason: the engine's pick if it chose this concept, else the student's own choice. */
export function planForConcept(
  rec: { conceptId: string; minutes: number; reason: string } | null,
  concept: { id: string; estMinutes: number },
): { plannedMin: number; reason: string } {
  if (rec && rec.conceptId === concept.id) {
    return { plannedMin: Math.max(5, Math.round(rec.minutes)), reason: rec.reason };
  }
  return { plannedMin: clamp(Math.round(concept.estMinutes), PLANNED_MIN, PLANNED_MAX), reason: "Chosen by you" };
}

/** Whole minutes between start and end, at least 1, capped at MAX_SESSION_MINUTES. */
export function elapsedMinutes(start: Date, end: Date): number {
  const min = Math.round((end.getTime() - start.getTime()) / 60_000);
  return clamp(min, 1, MAX_SESSION_MINUTES);
}

export function isStale(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > STALE_SESSION_HOURS * 3_600_000;
}

interface TurnRow {
  id: string;
  role: string;
  content: string;
  stage: string | null;
  evaluation: string | null;
  misconception: string | null;
  sources: unknown;
  notInNotes: boolean;
  createdAt: Date;
}

export function toTutorMessageView(t: TurnRow): TutorMessageView {
  return {
    id: t.id,
    role: t.role === "student" ? "student" : "tutor",
    content: t.content,
    stage: t.stage ? parseStage(t.stage) : null,
    evaluation: parseEvaluation(t.evaluation),
    misconception: t.misconception,
    sources: parseSources(t.sources),
    notInNotes: t.notInNotes,
    createdAt: t.createdAt.toISOString(),
  };
}

/** Last `limit` turns in chronological order, as the tutor expects them. */
export function historyForTutor(
  turns: Array<{ role: string; content: string }>,
  limit = HISTORY_TURNS,
): Array<{ role: "student" | "tutor"; content: string }> {
  return turns.slice(-limit).map((t) => ({ role: t.role === "student" ? "student" : "tutor", content: t.content }));
}

/** The most recent tutor message — the "prompt" a wrong Socratic reply answered. */
export function lastTutorMessage(turns: Array<{ role: string; content: string }>): string | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "tutor") return turns[i].content;
  }
  return null;
}

/** Tutor turns that graded a student reply (the evidence produced by the dialogue). */
export function countGradedReplies(turns: Array<{ role: string; evaluation: string | null }>): {
  graded: number;
  correct: number;
} {
  let graded = 0;
  let correct = 0;
  for (const t of turns) {
    if (t.role !== "tutor" || !isGradedEvaluation(t.evaluation)) continue;
    graded++;
    if (t.evaluation === "correct") correct++;
  }
  return { graded, correct };
}

// ── Objective questions (check questions, mistake retries) ──────────────────

export interface ObjectiveQuestionRow {
  id: string;
  type: string;
  body: string;
  options: unknown;
  answer: string;
  explanation: string | null;
  source: string;
  createdAt: Date;
}

export function parseOptions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const opts = raw.filter((o): o is string => typeof o === "string");
  return opts.length >= 2 ? opts : null;
}

const LETTERS = "ABCDEFGH";

/** Index of the correct mcq option (null for numeric or a malformed key). */
export function correctIndexOf(q: { type: string; answer: string; options: unknown }): number | null {
  if (q.type !== "mcq") return null;
  const opts = parseOptions(q.options);
  const idx = Number.parseInt(q.answer, 10);
  return opts && Number.isInteger(idx) && idx >= 0 && idx < opts.length ? idx : null;
}

/** "B · Conflict serializable" for mcq, the number for numeric. */
export function correctAnswerText(q: { type: string; answer: string; options: unknown }): string {
  if (q.type === "mcq") {
    const opts = parseOptions(q.options);
    const idx = Number.parseInt(q.answer, 10);
    if (opts && Number.isInteger(idx) && idx >= 0 && idx < opts.length) return `${LETTERS[idx]} · ${opts[idx]}`;
  }
  return q.answer;
}

/** Human-readable version of a response, for the mistake log ("C · View serializable"). */
export function responseText(q: { type: string; options: unknown }, response: string): string {
  if (q.type === "mcq") {
    const opts = parseOptions(q.options);
    const idx = Number.parseInt(response, 10);
    if (opts && Number.isInteger(idx) && idx >= 0 && idx < opts.length) return `${LETTERS[idx]} · ${opts[idx]}`;
  }
  return response;
}

/** Validate a raw response before grading. Returns an error message or null. */
export function validateObjectiveResponse(q: { type: string; options: unknown }, response: string): string | null {
  const r = response.trim();
  if (!r) return "Enter an answer first.";
  if (q.type === "mcq") {
    const opts = parseOptions(q.options);
    const idx = Number(r);
    if (!opts || !Number.isInteger(idx) || idx < 0 || idx >= opts.length) return "Pick one of the options.";
    return null;
  }
  if (q.type === "numeric") {
    if (!/-?\d/.test(r)) return "Enter a number.";
    return null;
  }
  return "This question type can't be answered here.";
}

export interface DraftLike {
  type: string;
  body: string;
  options: string[] | null;
  answer: string;
  explanation?: string | null;
  difficulty?: number;
}

export interface NormalizedDraft {
  type: "mcq" | "numeric";
  body: string;
  options: string[] | null;
  answer: string;
  explanation: string | null;
  difficulty: number;
}

/** Drop malformed AI/bank questions (bad answer key, missing options) before they reach the DB. */
export function normalizeDraft(d: DraftLike): NormalizedDraft | null {
  const body = d.body?.trim();
  if (!body || body.length < 8) return null;
  const difficulty = clamp(Number.isFinite(d.difficulty) ? (d.difficulty as number) : 0, -2, 2);
  const explanation = d.explanation?.trim() || null;
  if (d.type === "mcq") {
    const opts = (d.options ?? []).map((o) => String(o).trim()).filter(Boolean);
    const idx = Number(d.answer?.trim());
    if (opts.length < 2 || opts.length > 6 || !Number.isInteger(idx) || idx < 0 || idx >= opts.length) return null;
    return { type: "mcq", body, options: opts, answer: String(idx), explanation, difficulty };
  }
  if (d.type === "numeric") {
    const n = Number.parseFloat(String(d.answer).replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    return { type: "numeric", body, options: null, answer: String(d.answer).trim(), explanation, difficulty };
  }
  return null;
}

const normBody = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Remove drafts whose body already exists (offline banks return the same questions every time). */
export function dedupeDrafts<T extends { body: string }>(drafts: T[], existingBodies: string[]): T[] {
  const seen = new Set(existingBodies.map(normBody));
  const out: T[] = [];
  for (const d of drafts) {
    const k = normBody(d.body);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

export interface AttemptRow {
  questionId: string;
  sessionId: string | null;
  response: string;
  outcome: number;
  createdAt: Date;
}

/**
 * The session's check set, derived without a schema link: questions already attempted in this
 * session stay (in answer order); open sessions are topped up to `n`, preferring questions the
 * student has never attempted, then `check` over `practice` source, then oldest first. Stable
 * across reloads because only this session's attempts can change the answered set.
 */
export function pickSessionChecks<Q extends ObjectiveQuestionRow>(input: {
  candidates: Q[];
  attempts: AttemptRow[];
  sessionId: string;
  n?: number;
  /** completed/abandoned sessions show only what was answered */
  fill: boolean;
}): Array<{ question: Q; attempt: AttemptRow | null }> {
  const n = input.n ?? CHECK_COUNT;
  const byId = new Map(input.candidates.map((q) => [q.id, q]));
  const mine = new Map<string, AttemptRow>();
  const elsewhere = new Set<string>();
  const sorted = [...input.attempts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const a of sorted) {
    if (a.sessionId === input.sessionId) {
      if (!mine.has(a.questionId)) mine.set(a.questionId, a);
    } else {
      elsewhere.add(a.questionId);
    }
  }

  const chosen: Array<{ question: Q; attempt: AttemptRow | null }> = [];
  for (const [qid, attempt] of mine) {
    const q = byId.get(qid);
    if (q) chosen.push({ question: q, attempt });
  }
  if (!input.fill) return chosen;

  const rest = input.candidates
    .filter((q) => !mine.has(q.id))
    .sort((a, b) => {
      const seen = Number(elsewhere.has(a.id)) - Number(elsewhere.has(b.id));
      if (seen !== 0) return seen;
      const src = Number(a.source !== "check") - Number(b.source !== "check");
      if (src !== 0) return src;
      const t = a.createdAt.getTime() - b.createdAt.getTime();
      return t !== 0 ? t : a.id.localeCompare(b.id);
    });
  for (const q of rest) {
    if (chosen.length >= n) break;
    chosen.push({ question: q, attempt: null });
  }
  return chosen;
}

export function toCheckItemView(q: ObjectiveQuestionRow, attempt: AttemptRow | null): CheckItemView {
  const answered = attempt != null;
  const outcome = answered ? toOutcome(attempt.outcome) : null;
  return {
    id: q.id,
    type: q.type === "numeric" ? "numeric" : "mcq",
    body: q.body,
    options: q.type === "mcq" ? parseOptions(q.options) : null,
    answered,
    outcome,
    correctAnswer: answered ? correctAnswerText(q) : null,
    correctIndex: answered ? correctIndexOf(q) : null,
    explanation: answered ? q.explanation : null,
    response: attempt?.response ?? null,
  };
}

export function toOutcome(x: number): Outcome {
  if (x >= 0.75) return 1;
  if (x >= 0.25) return 0.5;
  return 0;
}

/** Check score: sum of outcomes over answered checks. */
export function checkScore(checks: Array<{ answered: boolean; outcome: Outcome | null }>): {
  answered: number;
  score: number;
  total: number;
} {
  let answered = 0;
  let score = 0;
  for (const c of checks) {
    if (!c.answered) continue;
    answered++;
    score += c.outcome ?? 0;
  }
  return { answered, score, total: checks.length };
}
