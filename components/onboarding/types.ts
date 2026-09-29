// View models for the onboarding flow (server → client). Client-safe: types only.
import type { DraftGraph } from "@/lib/ai/schemas";
import type { AiMode, GoalStatus } from "@/lib/types";

export type SetupStep = 1 | 2 | 3 | 4;

/** Where the draft in the editor came from. "saved" = rebuilt from confirmed DB concepts. */
export type DraftOrigin = DraftGraph["source"] | "saved";

export interface SetupGoal {
  id: string;
  subject: string;
  /** ISO string */
  examDate: string;
  minutesPerDay: number;
  status: GoalStatus;
  isDemo: boolean;
  daysLeft: number;
}

/** A confirmed concept, as steps 2–4 need it. */
export interface SetupConcept {
  id: string;
  name: string;
  unit: string;
  /** share of exam marks 0..1 */
  weightage: number;
  weightageSource: "pyq" | "estimated";
  pyqMarks: number | null;
  estMinutes: number;
}

export interface PyqQuestionView {
  id: string;
  text: string;
  marks: number | null;
  year: number | null;
  conceptId: string | null;
}

export interface PyqView {
  fileName: string | null;
  /** "saved" when loaded from the database on a later visit */
  source: "ai" | "heuristic" | "saved";
  totalMarks: number;
  /** "count" when papers carried no marks and questions were counted instead */
  basis: "marks" | "count";
  questions: PyqQuestionView[];
  concepts: SetupConcept[];
}

export type ResourceStatusView = "uploaded" | "processing" | "ready" | "failed";

export interface NotesResourceView {
  id: string;
  fileName: string;
  status: ResourceStatusView;
  pages: number | null;
  chunks: number;
  /** chunks that have a vector embedding (semantic retrieval); the rest use keyword retrieval */
  embedded: number;
  error: string | null;
  createdAt: string;
}

export interface SetupState {
  goal: SetupGoal;
  initialStep: SetupStep;
  /** Confirmed graph rebuilt as an editable draft (null until the graph is confirmed). */
  draft: DraftGraph | null;
  concepts: SetupConcept[];
  pyq: PyqView | null;
  notes: NotesResourceView[];
  aiMode: AiMode;
  /** PDFs go browser → Vercel Blob (large cap) instead of in the server-action body (4 MB). */
  directUploads: boolean;
}

export type UploadKind = "syllabus" | "pyq" | "notes";

/** Lets the browser put one PDF at `pathname` in Vercel Blob (see createUploadToken). */
export interface UploadToken {
  pathname: string;
  token: string;
  /** Must match the Blob store's access setting. */
  access: "public" | "private";
}

export interface ExtractResult {
  draft: DraftGraph;
  /** Automatic clean-ups applied to the extracted graph (shown to the student). */
  fixes: string[];
}

export interface ConfirmResult {
  /** The saved graph with DB ids as keys, so further edits re-confirm cleanly. */
  draft: DraftGraph;
  concepts: SetupConcept[];
}
