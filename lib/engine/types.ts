// Shared types for the deterministic engine (idea.md §5.1–5.3).
// The engine is PURE: no DB, no LLM, no Date.now() — callers pass `now`.

/** Result of one piece of evidence. 1 = correct, 0.5 = partial, 0 = wrong. */
export type Outcome = 0 | 0.5 | 1;

/** Where evidence came from; decides its weight (see EVIDENCE_WEIGHT). */
export type EvidenceKind = "quiz" | "diagnostic" | "check" | "socratic" | "unit_prior";

export interface MasteryState {
  /** Elo-lite skill in logits. Display value = sigmoid(theta). */
  theta: number;
  /** Weighted evidence count (quiz 1.0, socratic 0.5, unit prior 0.3). */
  evidenceCount: number;
  lastPracticedAt: Date | null;
}

export interface Evidence {
  outcome: Outcome;
  /** Question difficulty in logits (≈ -2 easy … +2 hard). Socratic replies use the stage difficulty. */
  difficulty: number;
  kind: EvidenceKind;
  at: Date;
}

/** Colour band for the concept graph. "unknown" = no evidence yet (greyed/dashed node). */
export type MasteryBand = "unknown" | "weak" | "developing" | "strong";

/** Confidence in a mastery estimate, from evidence count. */
export type Confidence = "none" | "low" | "medium" | "high";

/** Everything the priority engine needs to know about one concept. */
export interface EngineConcept {
  id: string;
  name: string;
  unit: string;
  /** Share of exam marks, 0..1 (sums ≈ 1 across the goal). */
  weightage: number;
  weightageSource: "pyq" | "estimated";
  /** Estimated minutes to learn from scratch. */
  estMinutes: number;
  mastery: MasteryState;
  /** Direct prerequisite concept ids. */
  prereqIds: string[];
  /** Wrong/partial answers in the recent window (e.g. last 14 days). */
  recentMistakes: number;
  /** Distinct misconceptions seen ≥ 2 times on this concept (recurring). */
  recurringMisconceptions: number;
}

/** Study mode is set by the deadline, not multiplied into every score. */
export type StudyMode = "learn" | "revision" | "triage";

/** Normalised 0..1 inputs to value(c). */
export interface ScoreComponents {
  weightage: number;
  gap: number;
  unlock: number;
  mistakeRate: number;
  decay: number;
}

export type ComponentKey = keyof ScoreComponents;

export interface RankedConcept {
  conceptId: string;
  name: string;
  unit: string;
  /** value(c) = Σ weight_i · component_i */
  value: number;
  /** priority(c) = value(c) / sqrt(estMinutes remaining) */
  priority: number;
  components: ScoreComponents;
  /** weight_i · component_i, for the "why" breakdown UI. */
  contributions: ScoreComponents;
  /** Current display mastery 0..1 (after decay). */
  mastery: number;
  confidence: Confidence;
  /** Minutes this concept still needs (scaled by gap, min 10). */
  minutesNeeded: number;
  /** Set when a prerequisite is below the gating threshold. */
  blockedBy: { conceptId: string; name: string; mastery: number } | null;
}

export interface Recommendation {
  /** The concept to study now (may be a prerequisite of the top-ranked concept). */
  conceptId: string;
  conceptName: string;
  unit: string;
  minutes: number;
  /** Human-readable reason templated from the top two score components. No LLM. */
  reason: string;
  mode: StudyMode;
  components: ScoreComponents;
  contributions: ScoreComponents;
  mastery: number;
  confidence: Confidence;
  /** When the top-ranked concept was gated, the concept it was gated for. */
  gatedFor: { conceptId: string; name: string } | null;
  /** Next few ranked options (for "not this one" / transparency UI). */
  alternatives: Array<{ conceptId: string; name: string; priority: number; reason: string }>;
}

export type PlanBlockKind = "learn" | "practice" | "revision";

export interface PlanBlock {
  kind: PlanBlockKind;
  conceptId: string | null;
  conceptName: string | null;
  minutes: number;
  reason: string;
}

export interface DayPlan {
  /** yyyy-mm-dd (local calendar date as passed in by the caller). */
  date: string;
  skipped: boolean;
  blocks: PlanBlock[];
  totalMinutes: number;
}

export interface DroppedConcept {
  conceptId: string;
  name: string;
  weightage: number;
  reason: string;
}

export interface Schedule {
  mode: StudyMode;
  /** Short sentence explaining the mode, e.g. "12 days left — learning new concepts." */
  modeReason: string;
  daysLeft: number;
  today: DayPlan;
  /** Today + following days up to the exam (capped at 14 for display). */
  days: DayPlan[];
  /** Triage mode only: concepts explicitly dropped, each with a reason. */
  dropped: DroppedConcept[];
  totalNeededMin: number;
  totalAvailableMin: number;
}

export interface PlanInput {
  concepts: EngineConcept[];
  minutesPerDay: number;
  examDate: Date;
  now: Date;
  /** yyyy-mm-dd dates the student will skip (today included if they skipped today). */
  skipDates: string[];
}

export interface RevisionItem {
  conceptId: string;
  name: string;
  minutes: number;
  /** weak × high-weightage × decayed score, 0..1 */
  score: number;
  reason: string;
}
