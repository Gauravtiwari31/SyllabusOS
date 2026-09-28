// Offline Socratic tutor: the hint ladder driven by a built-in tutor script (or a generic
// script built from the concept description and the student's notes), keyword grading on the
// script's key ideas, and misconception triggers. Deterministic — no network.
import type { TutorScript } from "@/lib/demo/bank";
import type { RetrievedChunk } from "@/lib/rag";
import { nextLadder, type LadderState } from "@/lib/tutor/ladder";
import type { Evaluation, SourceRef, TutorStage, TutorTurnOutput } from "../schemas";
import { isAnswerRequest } from "../guard";
import { resolveScript } from "./scripts";
import { containsPhrase, coverage, normalize, sentences, tokenSet, tokens, truncateWords } from "./text";

export interface OfflineTutorInput {
  concept: { id: string; name: string; description?: string | null };
  ladder: LadderState;
  signal?: "hint_request";
  studentMessage: string | null;
  chunks: RetrievedChunk[];
  /** framing phrases in Roman-script Hinglish (script content stays as written) */
  hinglish?: boolean;
}

/** The tutor's own framing words. Technical content comes from the script unchanged. */
const PHRASES = {
  en: {
    hint: "Hint:",
    stronger: "A stronger hint:",
    worked: "Let's work through it together.",
    ownWords: "Now in your own words:",
    gotIt: "You've got the idea. Let's confirm it with a few quick check questions.",
    open: (name: string) => `Let's work on ${name}.`,
    noHandover: "I'll get you there, but you'll remember it far better if you take the last step yourself.",
    good: (hits: string) => (hits ? `Good — you brought in ${hits}.` : "Good."),
    further: "One step further:",
    partial: "You're partly there.",
    wrong: "Not quite yet.",
    again: "Try again:",
    and: " and ",
  },
  hi: {
    hint: "Hint:",
    stronger: "Ek aur strong hint:",
    worked: "Chalo, isse step by step saath mein solve karte hain.",
    ownWords: "Ab apne words mein batao:",
    gotIt: "Tumhe concept samajh aa gaya hai. Ab kuch quick check questions se confirm karte hain.",
    open: (name: string) => `Chalo ${name} pe kaam karte hain.`,
    noHandover: "Main tumhe wahan tak le chalunga, par last step khud loge toh zyada yaad rahega.",
    good: (hits: string) => (hits ? `Bahut badhiya — tumne ${hits} sahi use kiya.` : "Bahut badhiya."),
    further: "Ek step aur aage:",
    partial: "Tum kaafi close ho, par abhi poora nahi hua.",
    wrong: "Abhi thoda sa galat hai.",
    again: "Phir se try karo:",
    and: " aur ",
  },
} as const;

/** Script-shaped content for any concept: the built-in script or one built from notes. */
export function scriptFor(concept: OfflineTutorInput["concept"], chunks: RetrievedChunk[]): TutorScript {
  const builtIn = resolveScript(concept.name);
  if (builtIn) return builtIn;

  const desc = concept.description?.trim() ?? "";
  const noteSentences = chunks
    .flatMap((c) => sentences(c.text))
    .filter((s) => s.length > 40 && s.length < 320)
    .slice(0, 6);
  const nameTokens = [...new Set(tokens(concept.name))];
  const descTokens = [...new Set(tokens(desc))].filter((t) => !nameTokens.includes(t)).slice(0, 4);
  const keyIdeas = [...nameTokens, ...descTokens].slice(0, 6);
  const fromNotes = (i: number, fallback: string) => (noteSentences[i] ? `Your notes say: "${truncateWords(noteSentences[i], 260)}"` : fallback);

  return {
    concept: concept.name,
    aliases: [],
    keyIdeas: keyIdeas.length ? keyIdeas : [normalize(concept.name)],
    probe: `In your own words: what is ${concept.name}, and where would you use it?`,
    hint1: fromNotes(0, desc ? `Start from what it has to do: ${desc}` : `Think of the problem ${concept.name} solves. What goes wrong without it?`),
    hint2: fromNotes(1, `Try to name the key terms involved in ${concept.name} and how they relate.`),
    workedStep: [desc || `${concept.name} is the focus of this session.`, noteSentences[2] ?? noteSentences[0] ?? ""].filter(Boolean).join(" "),
    checkPrompt: `Explain ${concept.name} to a classmate in two sentences, with one example.`,
    misconceptions: [],
  };
}

export interface OfflineGrade {
  evaluation: Evaluation;
  misconception: { label: string; nudge: string } | null;
  /** key ideas the reply covered */
  hits: string[];
}

/** Keyword grading: correct if >= half of the key ideas appear, partial if >= 1, else wrong. */
export function gradeReply(script: TutorScript, reply: string): OfflineGrade {
  const norm = normalize(reply);
  const bag = tokenSet(reply);
  const hits = script.keyIdeas.filter((idea) => containsPhrase(norm, idea) || coverage(tokens(idea), bag) >= 0.67);
  const need = Math.max(1, Math.ceil(script.keyIdeas.length / 2));
  const tooShort = norm.split(" ").filter(Boolean).length < 3;

  let evaluation: Evaluation = hits.length >= need && !tooShort ? "correct" : hits.length >= 1 ? "partial" : "wrong";
  let misconception: OfflineGrade["misconception"] = null;
  if (evaluation !== "correct") {
    const m = script.misconceptions.find((mc) => mc.triggers.some((t) => containsPhrase(norm, t)));
    if (m) {
      misconception = { label: m.label, nudge: m.nudge };
      if (evaluation === "partial") evaluation = "wrong";
    }
  }
  return { evaluation, misconception, hits };
}

function stageText(script: TutorScript, stage: TutorStage, t: (typeof PHRASES)[keyof typeof PHRASES] = PHRASES.en): string {
  switch (stage) {
    case "probe":
      return script.probe;
    case "hint1":
      return `${t.hint} ${script.hint1}`;
    case "hint2":
      return `${t.stronger} ${script.hint2}`;
    case "worked_step":
      return `${t.worked} ${script.workedStep}\n\n${t.ownWords} ${script.checkPrompt}`;
    case "check":
      return t.gotIt;
  }
}

/** The note chunk that best overlaps the message we are about to send, as a citation. */
function citeFor(message: string, chunks: RetrievedChunk[]): SourceRef[] {
  if (chunks.length === 0) return [];
  const bag = tokenSet(message);
  let best: RetrievedChunk | null = null;
  let bestScore = 0;
  for (const c of chunks) {
    const s = coverage([...bag], tokenSet(c.text));
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  const pick = best ?? chunks[0];
  return [{ file: pick.fileName, page: pick.page }];
}

export function offlineTutorTurn(input: OfflineTutorInput): { turn: TutorTurnOutput; ladder: LadderState } {
  const script = scriptFor(input.concept, input.chunks);
  const before = input.ladder;
  const t = input.hinglish ? PHRASES.hi : PHRASES.en;
  const stage = (s: TutorStage) => stageText(script, s, t);
  const done = (message: string, evaluation: Evaluation, ladder: LadderState, misconception: string | null = null) => {
    const sources = citeFor(message, input.chunks);
    return {
      turn: {
        message: message.slice(0, 4000),
        stage: ladder.stage,
        evaluation,
        misconception,
        conceptId: input.concept.id,
        sources,
        notInNotes: sources.length === 0,
      },
      ladder,
    };
  };

  // Opening turn of a session.
  if (input.studentMessage === null) {
    return done(`${t.open(input.concept.name)} ${stage(before.stage)}`, "not_applicable", before);
  }
  // Hint button: the caller already moved the ladder one rung up.
  if (input.signal === "hint_request") {
    return done(stage(before.stage), "not_applicable", before);
  }
  // "Just tell me the answer": no ladder change, answer with a guiding question.
  if (isAnswerRequest(input.studentMessage) && before.stage !== "worked_step") {
    const guide = before.stage === "probe" ? script.hint1 : before.stage === "hint1" ? script.hint2 : script.hint2;
    return done(
      `${t.noHandover} ${guide}`,
      "not_applicable",
      nextLadder(before, "answer_request"),
    );
  }

  const grade = gradeReply(script, input.studentMessage);
  const after = nextLadder(before, grade.evaluation);
  const parts: string[] = [];
  if (grade.evaluation === "correct") {
    parts.push(t.good(grade.hits.slice(0, 2).join(t.and)));
    if (after.stage === "probe") parts.push(`${t.further} ${script.checkPrompt}`);
    else parts.push(stage(after.stage));
  } else {
    parts.push(grade.evaluation === "partial" ? t.partial : t.wrong);
    if (grade.misconception) parts.push(grade.misconception.nudge);
    parts.push(after.stage === before.stage && after.stage === "probe" ? `${t.again} ${script.probe}` : stage(after.stage));
  }
  return done(parts.join(" "), grade.evaluation, after, grade.misconception?.label ?? null);
}
