// View models for the mistake log (server → client). All dates are ISO strings.
import type { Outcome } from "@/lib/engine/types";
import type { SourceRef } from "@/lib/ai/schemas";
import type { MistakeView } from "@/lib/types";

export interface RetryQuestionView {
  id: string;
  type: "mcq" | "numeric";
  body: string;
  options: string[] | null;
}

export interface RetryOutcomeView {
  outcome: Outcome;
  correctAnswer: string;
  /** correct mcq option index */
  correctIndex: number | null;
  explanation: string | null;
  /** raw response ("0".."3" for mcq) */
  response: string;
  /** true when this answer resolved the mistake */
  resolved: boolean;
}

/** Explain My Mistake (P1): why wrong → correct reasoning → similar retry question. */
export interface ExplanationView {
  whyWrong: string;
  correctReasoning: string;
  sources: SourceRef[];
  notInNotes: boolean;
  retry: RetryQuestionView | null;
  /** latest answer to the retry question, if any */
  retryResult: RetryOutcomeView | null;
}

export interface MistakeItemView extends Omit<MistakeView, "explanation"> {
  unit: string;
  explanation: ExplanationView | null;
  /** this item's label recurs in the engine's window (open, last 14 days) → it raises priority */
  raisesPriority: boolean;
}

export interface RecurringLabelView {
  label: string;
  /** occurrences of this label on the concept (all time) */
  count: number;
  /** ≥ 2 open occurrences in the engine's 14-day window → counted into MistakeRate */
  raisesPriority: boolean;
}

export interface MistakeGroupView {
  conceptId: string;
  conceptName: string;
  unit: string;
  open: number;
  total: number;
  items: MistakeItemView[];
  recurring: RecurringLabelView[];
}

export interface MistakeLogStats {
  total: number;
  open: number;
  resolved: number;
  mostAffected: { conceptId: string; name: string; open: number } | null;
  /** distinct misconception labels currently raising a topic's priority */
  recurringLabels: number;
}

export interface MistakeLogData {
  groups: MistakeGroupView[];
  stats: MistakeLogStats;
}
