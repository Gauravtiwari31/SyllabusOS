// Elo-lite mastery model (idea.md §5.1). PURE: no DB, no clock — `now` is always passed in.
import {
  BAND_STRONG_FROM,
  BAND_WEAK_BELOW,
  CONFIDENCE_HIGH_FROM,
  CONFIDENCE_LOW_FROM,
  CONFIDENCE_MEDIUM_FROM,
  DECAY_BASE_HALF_LIFE_DAYS,
  DECAY_HALF_LIFE_PER_EVIDENCE,
  DECAY_MAX_DROP,
  EVIDENCE_WEIGHT,
  K_HALF_N,
  K_MAX,
  K_MIN,
  THETA_MAX,
  THETA_MIN,
} from "./constants";
import type { Confidence, Evidence, MasteryBand, MasteryState } from "./types";
import { clamp } from "./util";

const DAY_MS = 86_400_000;

/** Logistic sigmoid. */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Inverse of sigmoid, clamped to avoid ±Infinity. */
export function logit(p: number): number {
  const q = Math.min(0.999, Math.max(0.001, p));
  return Math.log(q / (1 - q));
}

/** A concept nobody has evidence on yet. */
export function initialMastery(): MasteryState {
  return { theta: 0, evidenceCount: 0, lastPracticedAt: null };
}

/** Display mastery 0..1 = sigmoid(theta). */
export function displayMastery(theta: number): number {
  return sigmoid(theta);
}

/** p = σ(θ − d) */
export function expectedCorrect(theta: number, difficulty: number): number {
  return sigmoid(theta - difficulty);
}

/** K = max(K_MIN, K_MAX / (1 + n / K_HALF_N)): early evidence moves θ a lot, later evidence less. */
export function kFactor(evidenceCount: number): number {
  const n = Math.max(0, evidenceCount);
  return Math.max(K_MIN, K_MAX / (1 + n / K_HALF_N));
}

function nextTheta(state: MasteryState, outcome: number, difficulty: number, weight: number): number {
  const p = expectedCorrect(state.theta, difficulty);
  return clamp(state.theta + kFactor(state.evidenceCount) * weight * (outcome - p), THETA_MIN, THETA_MAX);
}

/** θ ← clamp(θ + K(n)·w·(outcome − p)); n += w; lastPracticedAt = ev.at (except unit_prior). */
export function updateMastery(state: MasteryState, ev: Evidence): MasteryState {
  const w = EVIDENCE_WEIGHT[ev.kind];
  return {
    theta: nextTheta(state, ev.outcome, ev.difficulty, w),
    evidenceCount: state.evidenceCount + w,
    lastPracticedAt: ev.kind === "unit_prior" ? state.lastPracticedAt : ev.at,
  };
}

/**
 * Unit-level diagnostic answer → low-confidence prior for every child concept.
 * Per child w = EVIDENCE_WEIGHT.unit_prior / (1 + n): a child with its own evidence barely moves.
 * A prior is not practice, so lastPracticedAt is left alone (it must not start decay).
 */
export function applyUnitPrior(
  children: MasteryState[],
  ev: Omit<Evidence, "kind">,
): MasteryState[] {
  return children.map((child) => {
    const w = EVIDENCE_WEIGHT.unit_prior / (1 + Math.max(0, child.evidenceCount));
    return {
      theta: nextTheta(child, ev.outcome, ev.difficulty, w),
      evidenceCount: child.evidenceCount + w,
      lastPracticedAt: child.lastPracticedAt,
    };
  });
}

/** Retention half-life in days: more evidence → slower forgetting. */
export function halfLifeDays(evidenceCount: number): number {
  return DECAY_BASE_HALF_LIFE_DAYS + DECAY_HALF_LIFE_PER_EVIDENCE * Math.max(0, evidenceCount);
}

/** Fractional days since the last practice (≥ 0), or null when never practised. */
export function daysSincePractice(state: MasteryState, now: Date): number | null {
  if (!state.lastPracticedAt) return null;
  return Math.max(0, (now.getTime() - state.lastPracticedAt.getTime()) / DAY_MS);
}

/** 0.5^(days / halfLife); 1 when never practised. */
export function retention(state: MasteryState, now: Date): number {
  const days = daysSincePractice(state, now);
  if (days === null) return 1;
  return Math.pow(0.5, days / halfLifeDays(state.evidenceCount));
}

/**
 * Mastery after spaced-repetition decay at `now` (P1). Returns display value 0..1.
 * Only the part above 50 % fades, and never by more than DECAY_MAX_DROP of it: forgetting
 * pulls you back towards "unsure", it doesn't invent evidence that you're weak.
 */
export function decayedMastery(state: MasteryState, now: Date): number {
  const m = displayMastery(state.theta);
  if (!state.lastPracticedAt || m <= 0.5) return m;
  return 0.5 + (m - 0.5) * (1 - DECAY_MAX_DROP * (1 - retention(state, now)));
}

/** 0..1: how much has been forgotten since last practice (drives the Decay component). */
export function decayAmount(state: MasteryState, now: Date): number {
  if (!state.lastPracticedAt || displayMastery(state.theta) <= 0.5) return 0;
  return 1 - retention(state, now);
}

/**
 * Inverse of decayAmount: the days since practice that produce `decay` at this evidence
 * count. Lets reason strings say "not practised for 6 days" from the score components alone.
 */
export function daysFromDecay(decay: number, evidenceCount: number): number {
  if (decay <= 0) return 0;
  if (decay >= 1) return Number.POSITIVE_INFINITY;
  return halfLifeDays(evidenceCount) * Math.log2(1 / (1 - decay));
}

export function confidenceOf(evidenceCount: number): Confidence {
  if (evidenceCount < CONFIDENCE_LOW_FROM) return "none";
  if (evidenceCount < CONFIDENCE_MEDIUM_FROM) return "low";
  if (evidenceCount < CONFIDENCE_HIGH_FROM) return "medium";
  return "high";
}

/** Graph colour band. No evidence → "unknown". */
export function bandOf(mastery: number, evidenceCount: number): MasteryBand {
  if (evidenceCount < CONFIDENCE_LOW_FROM) return "unknown";
  if (mastery < BAND_WEAK_BELOW) return "weak";
  if (mastery < BAND_STRONG_FROM) return "developing";
  return "strong";
}

/** Parent/unit mastery = weightage-weighted average of children display mastery (equal weights if all 0). */
export function unitMastery(children: Array<{ mastery: number; weightage: number }>): number {
  if (children.length === 0) return 0.5;
  const totalW = children.reduce((s, c) => s + Math.max(0, c.weightage), 0);
  if (totalW <= 0) return children.reduce((s, c) => s + c.mastery, 0) / children.length;
  return children.reduce((s, c) => s + Math.max(0, c.weightage) * c.mastery, 0) / totalW;
}
