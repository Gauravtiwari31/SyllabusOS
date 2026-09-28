// AI layer (Gemini via Vercel AI SDK) with an OFFLINE fallback for every function.
// Server-only. Gemini is used when GOOGLE_GENERATIVE_AI_API_KEY is set; any Gemini failure
// (overload, rate limit, invalid output, daily budget) falls back to the offline path so a
// student always gets a result. Model output is never trusted for ids, stages or citations.
import { z } from "zod";
import type { ModelMessage } from "ai";
import {
  GeneratedQuestionsSchema,
  MistakeExplanationSchema,
  PyqMappingSchema,
  SyllabusExtractionSchema,
  TutorTurnSchema,
  type DraftGraph,
  type MistakeExplanation,
  type TutorTurnOutput,
} from "./schemas";
import { buildDraftGraph, type LooseConcept } from "./graph";
import { AiUnavailableError, describeAiError, generateStructured } from "./gemini";
import { cleanQuestion, isAnswerRequest, makeNonce, resolveConcept, untrusted, untrustedRule, validSources } from "./guard";
import { parseSyllabusText } from "./offline/syllabus";
import { offlineTutorTurn } from "./offline/tutor";
import { bankDraftsFor, offlineQuestions } from "./offline/questions";
import { MAX_PYQ_QUESTIONS, mapParsedPyqs, parsePyqText, weightageFrom } from "./offline/pyq";
import { offlineExplainMistake } from "./offline/mistake";
import { nextLadder, type LadderState } from "@/lib/tutor/ladder";
import { extractPdfPages, type RetrievedChunk } from "@/lib/rag";
import type { AiMode } from "@/lib/types";

export { isAnswerRequest } from "./guard";

/** "gemini" when GOOGLE_GENERATIVE_AI_API_KEY is set, else "offline". */
export function aiMode(): AiMode {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY ? "gemini" : "offline";
}

export interface ConceptRef {
  id: string;
  name: string;
  unit: string;
  description?: string | null;
}

/** Caps on untrusted input sent to the model. */
const MAX_SYLLABUS_CHARS = 60_000;
const MAX_CHUNK_CHARS = 4_000;
const MAX_STUDENT_CHARS = 2_000;

function logFallback(label: string, err: unknown) {
  console.warn(`[ai] ${label}: using offline path (${err instanceof AiUnavailableError ? err.message : describeAiError(err)})`);
}

/** PDF bytes → plain text (for offline parsing). Empty string when the PDF has no text layer. */
async function pdfText(pdf: Uint8Array | undefined, maxChars: number): Promise<string> {
  if (!pdf) return "";
  try {
    const pages = await extractPdfPages(pdf);
    return pages.map((p) => p.text).join("\n\n").slice(0, maxChars);
  } catch (err) {
    console.error("[ai] PDF text extraction failed", describeAiError(err));
    return "";
  }
}

function pdfPart(pdf: Uint8Array) {
  return { type: "file" as const, data: pdf, mediaType: "application/pdf" };
}

// ── syllabus → concept graph ────────────────────────────────────────────────

/**
 * Syllabus (PDF bytes sent directly to Gemini, or pasted text) → editable draft graph
 * with 20–40 concepts, units, prerequisite keys and estimated weightage (percent).
 * Schema-validated; retries once on invalid output; falls back to the heuristic
 * text parser (source: "heuristic") offline or on failure.
 */
export async function extractSyllabus(input: {
  subject: string;
  pdf?: Uint8Array;
  text?: string;
}): Promise<DraftGraph> {
  const text = input.text?.slice(0, MAX_SYLLABUS_CHARS);
  if (aiMode() === "gemini") {
    try {
      const nonce = makeNonce();
      const out = await generateStructured({
        label: "extractSyllabus",
        schema: SyllabusExtractionSchema,
        system: [
          "You turn a university course syllabus into a study concept graph for one student.",
          "Return 20–40 concepts grouped by the syllabus units, in syllabus order. Each concept is one teachable idea",
          "(not a whole unit, not a single fact). Use the syllabus's own wording for names. Estimate minutes to learn",
          "from scratch (10–120) and each concept's share of exam marks (all concepts together ≈ 100).",
          "Prerequisites must be names of other concepts in your list that must be learnt first; no cycles.",
          "Ignore course outcomes, textbooks, references, lab lists and marking schemes.",
          untrustedRule(nonce),
        ].join(" "),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Subject: ${input.subject.slice(0, 120)}. Extract the concept graph from this syllabus.` },
              ...(input.pdf ? [pdfPart(input.pdf)] : []),
              ...(text ? [{ type: "text" as const, text: untrusted("syllabus", text, nonce, MAX_SYLLABUS_CHARS) }] : []),
            ],
          },
        ],
      });
      const loose: LooseConcept[] = out.units.flatMap((u) =>
        u.concepts.map((c) => ({
          name: c.name,
          unit: u.name,
          description: c.description,
          estMinutes: c.estMinutes,
          weightage: c.estimatedWeightage,
          prerequisites: c.prerequisites,
        })),
      );
      const draft = buildDraftGraph(out.subject || input.subject, "ai", loose);
      if (draft.concepts.length >= 3) return draft;
      console.warn("[ai] extractSyllabus: too few concepts from Gemini; using offline parser");
    } catch (err) {
      logFallback("extractSyllabus", err);
    }
  }
  const raw = text || (await pdfText(input.pdf, MAX_SYLLABUS_CHARS));
  if (!raw.trim()) {
    throw new Error("No readable text in that syllabus (it may be a scanned PDF). Paste the topic list as text.");
  }
  return parseSyllabusText(input.subject, raw);
}

// ── PYQs → weightage ────────────────────────────────────────────────────────

export interface PyqResult {
  questions: Array<{ text: string; marks: number; year: number | null; conceptId: string }>;
  /** conceptId → share of total PYQ marks (0..1). Concepts with no questions → 0. */
  weightage: Record<string, number>;
  /** conceptId → raw marks */
  marks: Record<string, number>;
  totalMarks: number;
  source: "ai" | "heuristic";
}

/** PYQ paper(s) → every question mapped to one concept → marks-weightage per concept. */
export async function mapPyqs(input: {
  pdf?: Uint8Array;
  text?: string;
  concepts: ConceptRef[];
}): Promise<PyqResult> {
  const ids = input.concepts.map((c) => c.id);
  const text = input.text?.slice(0, MAX_SYLLABUS_CHARS);
  if (aiMode() === "gemini" && input.concepts.length > 0) {
    try {
      const nonce = makeNonce();
      const out = await generateStructured({
        label: "mapPyqs",
        schema: PyqMappingSchema,
        system: [
          "You read previous-year university exam papers. List every question (sub-questions separately when they carry",
          "their own marks), with its marks (0 when not printed) and year (null when unknown), and map each question to",
          "exactly one concept name from the provided list — copy the name exactly. Skip instructions and headers.",
          untrustedRule(nonce),
        ].join(" "),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Concept list (JSON): ${JSON.stringify(input.concepts.map((c) => c.name.slice(0, 80)))}` },
              ...(input.pdf ? [pdfPart(input.pdf)] : []),
              ...(text ? [{ type: "text" as const, text: untrusted("pyq_paper", text, nonce, MAX_SYLLABUS_CHARS) }] : []),
            ],
          },
        ],
      });
      const questions = out.questions
        .slice(0, MAX_PYQ_QUESTIONS)
        .map((q) => {
          const concept = resolveConcept(q.conceptName, input.concepts);
          return concept
            ? { text: q.text.trim().slice(0, 600), marks: q.marks > 0 ? q.marks : 5, year: q.year ?? null, conceptId: concept.id }
            : null;
        })
        .filter((q): q is NonNullable<typeof q> => q !== null && q.text.length > 0);
      if (questions.length > 0) return { questions, ...weightageFrom(questions, ids), source: "ai" };
      console.warn("[ai] mapPyqs: no mappable questions from Gemini; using offline parser");
    } catch (err) {
      logFallback("mapPyqs", err);
    }
  }
  const raw = text || (await pdfText(input.pdf, MAX_SYLLABUS_CHARS));
  const questions = mapParsedPyqs(parsePyqText(raw), input.concepts);
  return { questions, ...weightageFrom(questions, ids), source: "heuristic" };
}

// ── question generation + verify pass ───────────────────────────────────────

export interface QuestionDraft {
  /** null for a unit-level question */
  conceptId: string | null;
  unit: string | null;
  type: "mcq" | "numeric";
  body: string;
  options: string[] | null;
  answer: string;
  explanation: string;
  difficulty: number;
  verified: boolean;
}

const VerdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      index: z.number().int().describe("index of the question in the list"),
      agrees: z.boolean().describe("true if the answer key is correct and the question is unambiguous"),
      issue: z.string().nullable(),
    }),
  ),
});

/**
 * Generate objective questions for the given concepts. Hand-verified bank questions are
 * used first; Gemini writes questions only for concepts the bank doesn't cover, and every
 * generated question gets a batched "verify" pass (disagreements dropped).
 */
export async function generateQuestions(input: {
  subject: string;
  concepts: ConceptRef[];
  count: number;
  purpose: "diagnostic" | "practice" | "check";
  /** Optional grounding text from the student's notes. */
  context?: string;
}): Promise<QuestionDraft[]> {
  const count = Math.max(0, Math.min(40, Math.trunc(input.count)));
  if (count === 0 || input.concepts.length === 0) return [];
  const perConcept = Math.max(1, Math.ceil(count / input.concepts.length));

  // 1) Bank first (verified by hand, free, instant).
  const fromBank = offlineQuestions(input.concepts, count, input.purpose);
  const covered = new Set(fromBank.map((q) => q.conceptId));
  const missing = input.concepts.filter((c) => !covered.has(c.id));
  if (missing.length === 0 || aiMode() === "offline") return fromBank;

  // 2) Gemini for the rest.
  const need = Math.min(count - fromBank.length + missing.length, missing.length * perConcept);
  try {
    const nonce = makeNonce();
    const list = missing.map((c) => ({ name: c.name.slice(0, 80), unit: c.unit.slice(0, 80), description: (c.description ?? "").slice(0, 240) }));
    const gen = await generateStructured({
      label: "generateQuestions",
      schema: GeneratedQuestionsSchema,
      temperature: 0.4,
      system: [
        `You write ${input.purpose} questions for a university ${input.subject.slice(0, 120)} exam.`,
        "Only objective questions: MCQ with exactly 4 distinct options and the correct option index as a string \"0\"–\"3\",",
        "or numeric with a single numeric answer. One correct answer, no 'all/none of the above', no trick wording.",
        "Spread questions across the listed concepts and copy conceptName exactly from the list.",
        input.purpose === "diagnostic" ? "Diagnostic questions test understanding of the core idea at medium difficulty." : "",
        untrustedRule(nonce),
      ].join(" "),
      messages: [
        {
          role: "user",
          content: [
            `Write ${need} questions for these concepts (JSON): ${JSON.stringify(list)}`,
            input.context ? `Ground them in the student's notes where possible:\n${untrusted("student_notes", input.context, nonce, 6000)}` : "",
          ].join("\n\n"),
        },
      ],
    });

    const drafts: Array<QuestionDraft & { conceptName: string }> = [];
    for (const q of gen.questions) {
      const concept = resolveConcept(q.conceptName, missing);
      const clean = concept ? cleanQuestion(q) : null;
      if (concept && clean) drafts.push({ ...clean, conceptId: concept.id, unit: concept.unit, verified: false, conceptName: concept.name });
    }
    if (drafts.length === 0) return fromBank;

    // 3) One batched verify pass on the strong model.
    let verified = drafts;
    try {
      const check = await generateStructured({
        label: "verifyQuestions",
        schema: VerdictsSchema,
        strong: true,
        temperature: 0,
        system: "You are a strict exam moderator. For each question, solve it yourself, then say whether the given answer key is correct and the question is unambiguous.",
        messages: [
          {
            role: "user",
            content: JSON.stringify(
              drafts.map((d, i) => ({ index: i, type: d.type, question: d.body, options: d.options, answerKey: d.answer })),
            ),
          },
        ],
      });
      const agreed = new Set(check.verdicts.filter((v) => v.agrees).map((v) => v.index));
      verified = drafts.filter((_, i) => agreed.has(i)).map((d) => ({ ...d, verified: true }));
    } catch (err) {
      // Unverified questions are kept but flagged; the diagnostic stores `verified: false`.
      logFallback("verifyQuestions", err);
    }
    const drafts2: QuestionDraft[] = verified.map((d) => ({
      conceptId: d.conceptId,
      unit: d.unit,
      type: d.type,
      body: d.body,
      options: d.options,
      answer: d.answer,
      explanation: d.explanation,
      difficulty: d.difficulty,
      verified: d.verified,
    }));
    return [...fromBank, ...drafts2].slice(0, count + missing.length);
  } catch (err) {
    logFallback("generateQuestions", err);
    return fromBank;
  }
}

// ── Socratic tutor ──────────────────────────────────────────────────────────

export interface TutorInput {
  subject: string;
  concept: ConceptRef;
  /**
   * Ladder state BEFORE this student turn (persisted on Session). For a hint request the
   * caller has already applied nextLadder(state, "hint_request") and passes signal "hint_request".
   */
  ladder: LadderState;
  signal?: "hint_request";
  history: Array<{ role: "student" | "tutor"; content: string }>;
  /** null = opening turn of the session */
  studentMessage: string | null;
  chunks: RetrievedChunk[];
  hinglish: boolean;
}

export interface TutorResult {
  turn: TutorTurnOutput;
  /** Ladder state AFTER this turn = nextLadder(input.ladder, evaluation or answer_request). */
  ladder: LadderState;
}

const STAGE_GUIDE: Record<LadderState["stage"], string> = {
  probe: "PROBE: ask one open question that makes the student reason about the core idea. Do not explain it.",
  hint1: "HINT 1: give a small nudge (a question or a pointer to the relevant idea), then ask them to try again.",
  hint2: "HINT 2: give a stronger hint that narrows it to one step, then ask them to take that step.",
  worked_step: "WORKED STEP: now you may show the reasoning step by step and the answer, then ask them to restate it in their own words.",
  check: "CHECK: tell them they have it and that a few check questions come next.",
};

/** Mapping of the model's grade + message onto the deterministic ladder. */
function finishTurn(input: TutorInput, raw: TutorTurnOutput | null, after: LadderState): TutorResult {
  const offline = offlineTutorTurn({
    concept: input.concept,
    ladder: input.ladder,
    signal: input.signal,
    studentMessage: input.studentMessage,
    chunks: input.chunks,
    hinglish: input.hinglish,
  });
  if (!raw) return offline;
  const sources = validSources(raw.sources, input.chunks);
  return {
    turn: {
      message: raw.message.trim().slice(0, 4000) || offline.turn.message,
      stage: after.stage,
      evaluation: raw.evaluation,
      misconception: raw.misconception?.trim().slice(0, 200) || null,
      conceptId: input.concept.id,
      sources,
      notInNotes: input.chunks.length === 0 || sources.length === 0,
    },
    ladder: after,
  };
}

/**
 * One Socratic tutor turn, validated against TutorTurnSchema. The model grades the reply
 * (evaluation + misconception); lib/tutor/ladder.ts decides the next stage and the model is
 * told the transition table so its message matches; turn.stage is always the ladder's
 * post-transition stage. Rules: never give the final answer before worked_step; if the
 * student asks for the answer, reply with a guiding question (signal answer_request, no
 * ladder change); cite chunk pages in `sources`; if chunks don't cover it, set notInNotes
 * and label the general-knowledge answer. Offline: rule-based ladder driven by tutor
 * scripts (lib/demo/bank.ts) + keyword grading + retrieved note sentences.
 */
export async function tutorTurn(input: TutorInput): Promise<TutorResult> {
  const answerRequest = input.studentMessage !== null && input.signal !== "hint_request" && isAnswerRequest(input.studentMessage);
  if (aiMode() === "offline") return offlineTutorTurn(input);

  const nonce = makeNonce();
  const opening = input.studentMessage === null;
  const system = [
    `You are a Socratic tutor for a university student studying "${input.concept.name.slice(0, 80)}" (${input.subject.slice(0, 120)}).`,
    "You teach by questions. Keep replies short (at most ~120 words), warm and specific. One question per reply.",
    `Current ladder stage for your reply: see the task. Stage rules — ${Object.values(STAGE_GUIDE).join(" ")}`,
    "Never state the final answer or a full solution before the WORKED STEP stage, even if asked; if asked, reply with a guiding question.",
    "Grade ONLY the student's latest reply: correct, partial, wrong, or not_applicable (greetings, questions, requests for help).",
    "If wrong or partial, name the misconception in under 12 words (else null).",
    "Ground explanations in the provided note excerpts and cite them as {file, page} exactly as given. If the notes don't cover it,",
    "cite nothing, set notInNotes true and start the explanation with 'Not in your notes —'.",
    input.hinglish ? "Write in natural Roman-script Hinglish (Hindi-English mix); keep technical terms in English." : "Write in clear English.",
    untrustedRule(nonce),
  ].join(" ");

  const notes = input.chunks.length
    ? input.chunks
        .map((c) => untrusted("note_excerpt", `[file: ${c.fileName}, page: ${c.page}]\n${c.text}`, nonce, MAX_CHUNK_CHARS))
        .join("\n")
    : "(no note excerpts found for this concept)";

  // The ladder is advanced by code, not by the model. For a graded reply we don't know the
  // evaluation yet, so the model is told both possible next stages and picks by its grade.
  const before = input.ladder;
  const ifCorrect = nextLadder(before, "correct").stage;
  const ifWrong = nextLadder(before, "wrong").stage;
  const task = opening
    ? `Open the session at stage ${before.stage.toUpperCase()}. evaluation must be not_applicable.`
    : input.signal === "hint_request"
      ? `The student pressed "Hint". Reply at stage ${before.stage.toUpperCase()}. evaluation must be not_applicable.`
      : answerRequest
        ? `The student asked to be given the answer. Do not give it (stage ${before.stage.toUpperCase()}): reply with a guiding question. evaluation must be not_applicable.`
        : `Grade the student's reply. If correct, reply at stage ${ifCorrect.toUpperCase()}; if partial or wrong, reply at stage ${ifWrong.toUpperCase()}.`;

  const history: ModelMessage[] = input.history.slice(-12).map((t) =>
    t.role === "tutor"
      ? { role: "assistant", content: t.content.slice(0, MAX_STUDENT_CHARS) }
      : { role: "user", content: untrusted("student_message", t.content, nonce, MAX_STUDENT_CHARS) },
  );

  try {
    const raw = await generateStructured({
      label: "tutorTurn",
      schema: TutorTurnSchema,
      temperature: 0.3,
      // Per model attempt; the offline tutor answers instantly if every attempt fails.
      timeoutMs: 12_000,
      system,
      messages: [
        ...history,
        {
          role: "user",
          content: [
            `Note excerpts:\n${notes}`,
            opening ? "" : `Student's latest reply:\n${untrusted("student_message", input.studentMessage ?? "", nonce, MAX_STUDENT_CHARS)}`,
            `Task: ${task} Use conceptId "${input.concept.id}".`,
            // Restated per turn: with an English history the model otherwise drifts back to English.
            input.hinglish
              ? "Language for THIS reply: Roman-script Hinglish (natural Hindi-English mix, e.g. \"Accha, ab batao…\"), technical terms in English — even though earlier messages were in English."
              : "Language for THIS reply: clear English, even if earlier messages were in Hinglish.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    // Deterministic transition from the (untrusted) grade.
    const forced = opening || input.signal === "hint_request" || answerRequest;
    const evaluation = forced ? "not_applicable" : raw.evaluation;
    const after = opening || input.signal === "hint_request" ? before : nextLadder(before, answerRequest ? "answer_request" : evaluation);
    return finishTurn(input, { ...raw, evaluation, misconception: evaluation === "correct" ? null : raw.misconception }, after);
  } catch (err) {
    logFallback("tutorTurn", err);
    return finishTurn(input, null, input.ladder);
  }
}

// ── Explain My Mistake ──────────────────────────────────────────────────────

/** Explain My Mistake (P1): why wrong → correct reasoning → similar retry question. */
export async function explainMistake(input: {
  subject: string;
  concept: ConceptRef;
  prompt: string;
  response: string;
  misconception: string | null;
  chunks: RetrievedChunk[];
  hinglish: boolean;
}): Promise<MistakeExplanation> {
  const offline = () => offlineExplainMistake(input);
  if (aiMode() === "offline") return offline();
  try {
    const nonce = makeNonce();
    const out = await generateStructured({
      label: "explainMistake",
      schema: MistakeExplanationSchema,
      system: [
        `You help a university student understand a mistake about "${input.concept.name.slice(0, 80)}" (${input.subject.slice(0, 120)}).`,
        "whyWrong: 2–3 sentences on what in their answer is wrong and why (be kind, specific).",
        "correctReasoning: the correct reasoning step by step (at most ~120 words), grounded in the note excerpts when they cover it.",
        "retry: ONE new objective question on the same idea (MCQ with 4 distinct options and index \"0\"–\"3\", or numeric), different from the original.",
        input.hinglish ? "Write in Roman-script Hinglish; keep technical terms in English." : "",
        untrustedRule(nonce),
      ].join(" "),
      messages: [
        {
          role: "user",
          content: [
            `Question they answered:\n${untrusted("question", input.prompt, nonce, 2000)}`,
            `Their answer:\n${untrusted("student_answer", input.response, nonce, 2000)}`,
            input.misconception ? `Logged misconception: ${untrusted("label", input.misconception, nonce, 200)}` : "",
            input.chunks.length
              ? `Note excerpts:\n${input.chunks.map((c) => untrusted("note_excerpt", c.text, nonce, MAX_CHUNK_CHARS)).join("\n")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });
    const retry = out.retry ? cleanQuestion(out.retry) : null;
    const fallbackRetry = offline().retry;
    return {
      whyWrong: out.whyWrong.trim().slice(0, 1500),
      correctReasoning: out.correctReasoning.trim().slice(0, 3000),
      retry: retry ? { ...retry, conceptName: input.concept.name } : fallbackRetry,
    };
  } catch (err) {
    logFallback("explainMistake", err);
    return offline();
  }
}

/** Bank questions for one concept (used by callers that want verified content only). */
export { bankDraftsFor };
