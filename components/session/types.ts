// View models for the Learn session (server → client). Extends lib/types.ts; all dates are ISO strings.
import type { Confidence, Outcome } from "@/lib/engine/types";
import type { TutorStage } from "@/lib/ai/schemas";
import type { CheckQuestionView, SessionResult, SessionView, TutorMessageView } from "@/lib/types";

export type SessionStatus = SessionView["status"];

/** A check question plus the student's own response (so a reload can show what they picked). */
export interface CheckItemView extends CheckQuestionView {
  response: string | null;
  /** correct mcq option, revealed once answered */
  correctIndex: number | null;
}

/** SessionView with the extra fields the Learn screen needs. Assignable to SessionView. */
export interface LearnSessionView extends Omit<SessionView, "checks"> {
  checks: CheckItemView[];
  /** confidence of the current mastery estimate (thin evidence → "low confidence") */
  confidence: Confidence;
  /** tutor turns that graded a student reply */
  gradedReplies: number;
  actualMin: number | null;
}

export interface SessionSummaryView {
  gradedReplies: number;
  correctReplies: number;
  checksAnswered: number;
  /** sum of check outcomes (partial numeric = 0.5) */
  checkScore: number;
  checksTotal: number;
  mistakesLogged: number;
  actualMin: number | null;
}

export interface SessionResultView extends SessionResult {
  conceptId: string;
  summary: SessionSummaryView;
}

export interface LearnPageData {
  session: LearnSessionView;
  /** set for completed sessions */
  result: SessionResultView | null;
}

/** Returned by sendTutorMessage / requestHint. */
export interface TutorReplyView {
  /** the persisted student turn + tutor turn, in order */
  messages: TutorMessageView[];
  masteryNow: number;
  confidence: Confidence;
  stage: TutorStage;
  status: SessionStatus;
  checks: CheckItemView[];
  gradedReplies: number;
}

export interface CheckPhaseView {
  status: SessionStatus;
  stage: TutorStage;
  checks: CheckItemView[];
}

export interface CheckAnswerView {
  check: CheckItemView;
  masteryNow: number;
  confidence: Confidence;
}

export type { Outcome };
