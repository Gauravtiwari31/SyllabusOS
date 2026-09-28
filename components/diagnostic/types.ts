// Diagnostic view models shared by app/actions/diagnostic.ts and the client UI.
// They extend the foundation contracts in lib/types.ts with the adaptive "why".
import type { DiagnosticAnswerResult, DiagnosticQuestionView } from "@/lib/types";

export type DiagnosticWhy = "start" | "probe_down" | "probe_up" | "coverage" | "best";

export interface DiagnosticQuestion extends DiagnosticQuestionView {
  why: DiagnosticWhy;
  /** e.g. "Checking a prerequisite of Normal Forms" — templated, no LLM */
  whyText: string;
}

export interface DiagnosticStart {
  question: DiagnosticQuestion | null;
  answered: number;
  total: number;
  /** true when there is nothing to ask (offline without bank coverage, or generation failed) */
  poolEmpty: boolean;
}

export interface DiagnosticAnswer extends DiagnosticAnswerResult {
  next: DiagnosticQuestion | null;
  answered: number;
  total: number;
  /** what this answer updated: the concept directly + its unit as a low-confidence estimate */
  updated: { conceptName: string | null; unit: string | null };
}
