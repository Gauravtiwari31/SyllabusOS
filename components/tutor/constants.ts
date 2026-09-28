// Client-safe constants shared by the tutor UI and the learn service.
import { TUTOR_STAGES, type TutorStage } from "@/lib/ai/schemas";

/** Student turn persisted when the "Hint" button is used. */
export const HINT_REQUEST_TEXT = "I'd like a hint.";
/** Max characters of one student reply (validated again on the server). */
export const MAX_MESSAGE_CHARS = 2000;

export const LADDER_STAGES: readonly TutorStage[] = TUTOR_STAGES;

export const STAGE_LABEL: Record<TutorStage, string> = {
  probe: "Probe",
  hint1: "Hint 1",
  hint2: "Hint 2",
  worked_step: "Worked step",
  check: "Check",
};

/** One line under the ladder rail explaining the current rung. */
export const STAGE_HINT: Record<TutorStage, string> = {
  probe: "The tutor asks, you reason it out. Two correct replies in a row move you to the check.",
  hint1: "A nudge in the right direction. Two misses at a rung move one step up.",
  hint2: "A stronger hint — the key idea is on the table now.",
  worked_step: "One step worked through with you. Finish the reasoning to reach the check.",
  check: "Show what you know: quick check questions, graded instantly.",
};
