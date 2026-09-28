// Single source of truth for every AI response shape (stack.md: "shared Zod schemas").
// Safe to import from client components (no server deps).
import { z } from "zod";

// ── Syllabus → concept graph ────────────────────────────────────────────────
export const ExtractedConceptSchema = z.object({
  name: z.string().min(2).max(80).describe("Short concept name, e.g. 'Conflict Serializability'"),
  description: z.string().max(240).describe("One sentence: what the student must be able to do"),
  estMinutes: z.number().int().min(10).max(120).describe("Minutes to learn from scratch"),
  estimatedWeightage: z
    .number()
    .min(0)
    .max(100)
    .describe("Estimated % of exam marks for this concept; all concepts together ≈ 100"),
  prerequisites: z.array(z.string()).describe("Names of other concepts in this list that must be learnt first"),
});

export const SyllabusExtractionSchema = z.object({
  subject: z.string().min(2).max(80),
  units: z
    .array(
      z.object({
        name: z.string().min(1).max(80).describe("Unit name, e.g. 'Unit 2 · Transactions'"),
        concepts: z.array(ExtractedConceptSchema).min(1),
      }),
    )
    .min(1),
});
export type SyllabusExtraction = z.infer<typeof SyllabusExtractionSchema>;

/** Editable draft graph used by the onboarding editor before the student confirms it. */
export const DraftConceptSchema = z.object({
  key: z.string().min(1).max(64), // stable client key (not a DB id)
  name: z.string().min(1).max(80),
  description: z.string().max(240).optional().default(""),
  unit: z.string().min(1).max(80),
  estMinutes: z.number().int().min(5).max(240),
  weightage: z.number().min(0).max(100), // percent
  prereqKeys: z.array(z.string().max(64)).max(59),
});
export const DraftGraphSchema = z.object({
  subject: z.string().max(120),
  source: z.enum(["ai", "heuristic", "demo"]),
  concepts: z.array(DraftConceptSchema).min(1).max(60),
});
export type DraftConcept = z.infer<typeof DraftConceptSchema>;
export type DraftGraph = z.infer<typeof DraftGraphSchema>;

// ── PYQ mapping → weightage ─────────────────────────────────────────────────
export const PyqMappingSchema = z.object({
  questions: z.array(
    z.object({
      text: z.string().describe("Question text, shortened to ≤ 200 chars"),
      marks: z.number().min(0).max(100),
      year: z.number().int().nullable(),
      conceptName: z.string().describe("Exactly one name from the provided concept list"),
    }),
  ),
});
export type PyqMapping = z.infer<typeof PyqMappingSchema>;

// ── Question generation + verify pass ───────────────────────────────────────
export const GeneratedQuestionSchema = z.object({
  conceptName: z.string(),
  type: z.enum(["mcq", "numeric"]),
  body: z.string().min(8),
  options: z.array(z.string()).length(4).nullable().describe("Exactly 4 options for mcq, null for numeric"),
  answer: z.string().describe("mcq: index 0-3 as a string; numeric: the number as a string"),
  explanation: z.string().describe("Why the answer is right, 1-3 sentences"),
  difficulty: z.number().min(-2).max(2).describe("-2 very easy … 2 very hard"),
});
export const GeneratedQuestionsSchema = z.object({ questions: z.array(GeneratedQuestionSchema) });
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export const QuestionVerdictSchema = z.object({
  agrees: z.boolean().describe("true if the provided answer key is correct and unambiguous"),
  correctAnswer: z.string(),
  issue: z.string().nullable(),
});
export type QuestionVerdict = z.infer<typeof QuestionVerdictSchema>;

// ── Socratic tutor turn (idea.md §5.4) ──────────────────────────────────────
export const TutorStageSchema = z.enum(["probe", "hint1", "hint2", "worked_step", "check"]);
export type TutorStage = z.infer<typeof TutorStageSchema>;
export const TUTOR_STAGES: TutorStage[] = ["probe", "hint1", "hint2", "worked_step", "check"];

export const EvaluationSchema = z.enum(["correct", "partial", "wrong", "not_applicable"]);
export type Evaluation = z.infer<typeof EvaluationSchema>;

export const SourceRefSchema = z.object({ file: z.string(), page: z.number().int() });
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const TutorTurnSchema = z.object({
  message: z.string().describe("Shown to the student. Never the final answer before worked_step."),
  stage: TutorStageSchema,
  evaluation: EvaluationSchema.describe("Grade of the student's LAST reply"),
  misconception: z.string().nullable().describe("Short label of the misconception, if any"),
  conceptId: z.string(),
  sources: z.array(SourceRefSchema),
  notInNotes: z.boolean().describe("true when the uploaded notes do not cover this; answer is from general knowledge"),
});
export type TutorTurnOutput = z.infer<typeof TutorTurnSchema>;

// ── Explain My Mistake (P1) ─────────────────────────────────────────────────
export const MistakeExplanationSchema = z.object({
  whyWrong: z.string(),
  correctReasoning: z.string(),
  /** similar question to retry; null when none could be produced */
  retry: GeneratedQuestionSchema.nullable(),
});
export type MistakeExplanation = z.infer<typeof MistakeExplanationSchema>;
