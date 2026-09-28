// Socratic hint ladder (idea.md §5.4 / USP 2). PURE and deterministic: the LLM grades a
// reply, but THIS decides where the session goes next. Shared by lib/ai (to tell the
// model which stage to answer at) and the learn service (to persist session state).
import type { Evaluation, TutorStage } from "@/lib/ai/schemas";

export interface LadderState {
  stage: TutorStage;
  /** consecutive failed (wrong/partial) replies at the current stage */
  failCount: number;
  /** consecutive correct replies */
  correctStreak: number;
}

/** What happened on this student turn. */
export type LadderSignal = Evaluation | "hint_request" | "answer_request";

const ORDER: TutorStage[] = ["probe", "hint1", "hint2", "worked_step", "check"];

/** Failed replies at one stage before the ladder moves one rung up. */
export const FAILS_PER_STAGE = 2;
/** Correct replies at the probe stage before moving to check questions. */
export const CORRECT_TO_CHECK = 2;

export function initialLadder(): LadderState {
  return { stage: "probe", failCount: 0, correctStreak: 0 };
}

export function stageIndex(stage: TutorStage): number {
  return ORDER.indexOf(stage);
}

/** One rung up the ladder (check is terminal). */
export function nextStage(stage: TutorStage): TutorStage {
  return ORDER[Math.min(ORDER.length - 1, stageIndex(stage) + 1)];
}

/**
 * Transition table:
 * - correct: streak+1, fails reset. From probe → check after CORRECT_TO_CHECK in a row
 *   (otherwise stay at probe for a deeper question). From hint1/hint2/worked_step → check
 *   (they got it with help).
 * - wrong / partial: fails+1, streak reset. After FAILS_PER_STAGE fails → next rung, fails reset.
 * - hint_request: next rung immediately (never past worked_step), fails reset.
 * - answer_request / not_applicable: no change (tutor replies with a guiding question).
 * - at check: state is terminal; the UI switches to check questions.
 */
export function nextLadder(s: LadderState, signal: LadderSignal): LadderState {
  if (s.stage === "check") return s;
  switch (signal) {
    case "correct": {
      const streak = s.correctStreak + 1;
      if (s.stage === "probe" && streak < CORRECT_TO_CHECK) {
        return { stage: "probe", failCount: 0, correctStreak: streak };
      }
      return { stage: "check", failCount: 0, correctStreak: streak };
    }
    case "wrong":
    case "partial": {
      const fails = s.failCount + 1;
      if (fails >= FAILS_PER_STAGE && s.stage !== "worked_step") {
        return { stage: nextStage(s.stage), failCount: 0, correctStreak: 0 };
      }
      return { stage: s.stage, failCount: fails, correctStreak: 0 };
    }
    case "hint_request": {
      const stage = s.stage === "worked_step" ? "worked_step" : nextStage(s.stage);
      return { stage, failCount: 0, correctStreak: 0 };
    }
    case "answer_request":
    case "not_applicable":
    default:
      return s;
  }
}

/** True once the student may see the worked solution. */
export function mayRevealAnswer(stage: TutorStage): boolean {
  return stageIndex(stage) >= stageIndex("worked_step");
}
