// Offline question source: the built-in (hand-verified) bank, matched to the requested
// concepts by canonical name / alias. Concepts without bank coverage get nothing.
import type { QuestionDraft } from "../index";
import { bankQuestionsFor } from "./scripts";

type Purpose = "diagnostic" | "practice" | "check";

/** Order of purposes to fall back through when a concept has none of the requested kind. */
const FALLBACK: Record<Purpose, Purpose[]> = {
  diagnostic: ["diagnostic", "practice", "check"],
  practice: ["practice", "check", "diagnostic"],
  check: ["check", "practice", "diagnostic"],
};

/** Up to `perConcept` bank questions for one concept (easiest first for diagnostics). */
export function bankDraftsFor(
  concept: { id: string; name: string; unit: string },
  purpose: Purpose,
  perConcept: number,
): QuestionDraft[] {
  const seen = new Set<string>();
  const picked: QuestionDraft[] = [];
  for (const p of FALLBACK[purpose]) {
    const pool = bankQuestionsFor(concept.name, p);
    const ordered = purpose === "diagnostic" ? [...pool].sort((a, b) => a.difficulty - b.difficulty) : pool;
    for (const q of ordered) {
      if (picked.length >= perConcept) return picked;
      if (seen.has(q.body)) continue;
      seen.add(q.body);
      picked.push({
        conceptId: concept.id,
        unit: concept.unit,
        type: q.type,
        body: q.body,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        verified: true,
      });
    }
  }
  return picked;
}

/** Spread `count` questions across the concepts, round-robin, from the bank. */
export function offlineQuestions(
  concepts: Array<{ id: string; name: string; unit: string }>,
  count: number,
  purpose: Purpose,
): QuestionDraft[] {
  if (concepts.length === 0 || count <= 0) return [];
  const perConcept = Math.max(1, Math.ceil(count / concepts.length));
  const lists = concepts.map((c) => bankDraftsFor(c, purpose, perConcept));
  const out: QuestionDraft[] = [];
  for (let round = 0; out.length < count && round < perConcept; round++) {
    for (const list of lists) {
      if (out.length >= count) break;
      if (list[round]) out.push(list[round]);
    }
  }
  return out;
}
