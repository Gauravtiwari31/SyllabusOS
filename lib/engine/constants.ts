// Every tunable number of the engine lives here. Unit tests pin the behaviour.

/** value(c) = 0.30·Weightage + 0.30·Gap + 0.20·Unlock + 0.10·MistakeRate + 0.10·Decay */
export const PRIORITY_WEIGHTS = {
  weightage: 0.3,
  gap: 0.3,
  unlock: 0.2,
  mistakeRate: 0.1,
  decay: 0.1,
} as const;

/** Evidence weights: LLM-graded Socratic replies are trusted less than quiz answers. */
export const EVIDENCE_WEIGHT = {
  quiz: 1,
  diagnostic: 1,
  check: 1,
  socratic: 0.5,
  unit_prior: 0.3,
} as const;

/** Elo K-factor: K = K_MAX / (1 + n / K_HALF_N), floored at K_MIN. */
export const K_MAX = 1.2;
export const K_MIN = 0.25;
export const K_HALF_N = 4;

/** Prerequisite gating: recommend the prereq if it is below this display mastery. */
export const PREREQ_GATE = 0.5;

/** Band thresholds on display mastery (0..1). */
export const BAND_WEAK_BELOW = 0.4;
export const BAND_STRONG_FROM = 0.7;

/** Confidence thresholds on evidence count. */
export const CONFIDENCE_LOW_FROM = 0.01;
export const CONFIDENCE_MEDIUM_FROM = 2;
export const CONFIDENCE_HIGH_FROM = 5;

/** Mode thresholds. */
export const REVISION_DAYS = 3; // ≤ 3 days left → revision mode

/** Planner reservations (minutes). Scaled down when the day is short. */
export const PRACTICE_BLOCK_MIN = 15;
export const REVISION_BLOCK_MIN = 10;
export const MIN_LEARN_BLOCK = 10;
export const MAX_LEARN_BLOCK = 45;

/** Spaced-repetition decay: retention half-life (days) grows with evidence. */
export const DECAY_BASE_HALF_LIFE_DAYS = 3;
export const DECAY_HALF_LIFE_PER_EVIDENCE = 1.5;
/** Decay never removes more than this fraction of the mastery above 50 %. */
export const DECAY_MAX_DROP = 0.6;

/** Mistake normalisation: this many recent mistakes = mistakeRate 1. */
export const MISTAKES_SATURATE_AT = 4;
/** Each recurring misconception counts as this many extra mistakes. */
export const RECURRING_MISCONCEPTION_BONUS = 1.5;

/** θ is clamped to this range so one lucky/unlucky streak can't run away. */
export const THETA_MIN = -4;
export const THETA_MAX = 4;

/** Display mastery at which a concept counts as learned (needs 0 more learn minutes). */
export const MASTERED_AT = 0.8;

/** Normalised weightage (vs. the heaviest concept) from which reasons say "High exam weightage". */
export const HIGH_WEIGHTAGE_FROM = 0.5;

/** decayAmount from which a concept is called "fading" and qualifies for a revision block. */
export const FADING_FROM = 0.1;

/** Practice + revision blocks are only reserved when the day has at least this many minutes. */
export const RESERVE_FROM_MINUTES_PER_DAY = 45;

/** The schedule shows today + at most this many days in total. */
export const PLAN_HORIZON_DAYS = 14;

/** Revision Mode block sizing: min(MAX, max(MIN, estMinutes / 3)), last block may shrink to TAIL. */
export const REVISION_ITEM_MIN = 10;
export const REVISION_ITEM_MAX = 20;
export const REVISION_ITEM_TAIL_MIN = 5;

/** Revision Mode treats a never-assessed concept as this mastery ("unknown counts as weak"). */
export const REVISION_UNKNOWN_MASTERY = 0.3;

/** Hint-ladder difficulties used for Socratic evidence (logits). */
export const STAGE_DIFFICULTY = {
  probe: 0.5,
  hint1: 0.2,
  hint2: -0.2,
  worked_step: -0.6,
  check: 0.3,
} as const;
