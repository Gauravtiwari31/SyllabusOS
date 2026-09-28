// View-model types passed from server (services / server actions) to UI components.
// All dates are ISO strings so they serialise across the server→client boundary.
import type {
  Confidence,
  MasteryBand,
  Outcome,
  Recommendation,
  Schedule,
  RevisionItem,
} from "@/lib/engine/types";
import type { Evaluation, SourceRef, TutorStage } from "@/lib/ai/schemas";

export type { Recommendation, Schedule, RevisionItem, Outcome, MasteryBand, Confidence };

export type AiMode = "gemini" | "offline";

export type GoalStatus = "draft" | "diagnosing" | "active";

export interface GoalSummary {
  id: string;
  subject: string;
  examDate: string;
  minutesPerDay: number;
  status: GoalStatus;
  isDemo: boolean;
  daysLeft: number;
  skippedToday: boolean;
}

export interface GraphNode {
  id: string;
  name: string;
  unit: string;
  description: string | null;
  /** display mastery 0..1 (after decay) */
  mastery: number;
  band: MasteryBand;
  confidence: Confidence;
  evidenceCount: number;
  /** share of exam marks 0..1 */
  weightage: number;
  weightageSource: "pyq" | "estimated";
  pyqMarks: number | null;
  estMinutes: number;
}

export interface GraphEdge {
  id: string;
  /** prerequisite */
  from: string;
  /** concept it unlocks */
  to: string;
}

export interface UnitSummary {
  name: string;
  mastery: number;
  weightage: number;
  conceptCount: number;
}

export interface ConceptGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  units: UnitSummary[];
}

export interface MasteryTrendPoint {
  /** yyyy-mm-dd */
  date: string;
  /** weightage-weighted average display mastery 0..1 at end of that day */
  mastery: number;
  /** true when the point comes from seeded demo history */
  isDemo: boolean;
}

export interface WeakTopic {
  conceptId: string;
  name: string;
  unit: string;
  mastery: number;
  confidence: Confidence;
  weightage: number;
  recentMistakes: number;
}

export interface DashboardStats {
  overallMastery: number;
  conceptsTotal: number;
  conceptsStrong: number;
  conceptsUnknown: number;
  sessionsCompleted: number;
  minutesStudied: number;
  openMistakes: number;
}

export interface DashboardData {
  goal: GoalSummary;
  recommendation: Recommendation | null;
  schedule: Schedule;
  graph: ConceptGraphData;
  weakest: WeakTopic[];
  trend: MasteryTrendPoint[];
  stats: DashboardStats;
  aiMode: AiMode;
}

// ── Diagnostic ──────────────────────────────────────────────────────────────
export interface DiagnosticQuestionView {
  id: string;
  /** 1-based position in the diagnostic */
  index: number;
  /** planned total (≤ 10) */
  total: number;
  conceptName: string | null;
  unit: string | null;
  type: "mcq" | "numeric";
  body: string;
  options: string[] | null;
}

export interface DiagnosticAnswerResult {
  outcome: Outcome;
  correctAnswer: string;
  explanation: string | null;
  next: DiagnosticQuestionView | null;
  done: boolean;
}

// ── Learn session ───────────────────────────────────────────────────────────
export interface TutorMessageView {
  id: string;
  role: "student" | "tutor";
  content: string;
  stage: TutorStage | null;
  evaluation: Evaluation | null;
  misconception: string | null;
  sources: SourceRef[];
  notInNotes: boolean;
  createdAt: string;
}

export interface CheckQuestionView {
  id: string;
  type: "mcq" | "numeric";
  body: string;
  options: string[] | null;
  answered: boolean;
  outcome: Outcome | null;
  correctAnswer: string | null;
  explanation: string | null;
}

export interface SessionView {
  id: string;
  goalId: string;
  concept: { id: string; name: string; unit: string; description: string | null };
  status: "active" | "checking" | "completed" | "abandoned";
  stage: TutorStage;
  plannedMin: number;
  reason: string | null;
  masteryBefore: number;
  masteryNow: number;
  masteryAfter: number | null;
  turns: TutorMessageView[];
  checks: CheckQuestionView[];
  startedAt: string;
  hinglish: boolean;
  aiMode: AiMode;
}

export interface SessionResult {
  masteryBefore: number;
  masteryAfter: number;
  delta: number;
  nextRecommendation: Recommendation | null;
}

// ── Mistakes ────────────────────────────────────────────────────────────────
export interface MistakeView {
  id: string;
  conceptId: string;
  conceptName: string;
  source: "diagnostic" | "quiz" | "socratic" | "check";
  prompt: string;
  response: string;
  misconception: string | null;
  explanation: string | null;
  resolved: boolean;
  createdAt: string;
  /** how many times this misconception label occurs on this concept */
  recurrence: number;
}

/** Standard result shape for server actions called from client components. */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
