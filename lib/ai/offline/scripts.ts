// Map a free-form concept name (e.g. from the heuristic syllabus parser) onto a built-in
// tutor script / question-bank entry. Exact canonical-or-alias match first (findTutorScript),
// then a conservative token-subset match: every content token of a script name/alias must
// appear in the concept name; the longest such alias wins.
import {
  findBankQuestions,
  findTutorScript,
  QUESTION_BANK,
  TUTOR_SCRIPTS,
  type BankQuestion,
  type TutorScript,
} from "@/lib/demo/bank";
import { tokens } from "./text";

export function resolveScript(conceptName: string): TutorScript | null {
  const exact = findTutorScript(conceptName);
  if (exact) return exact;
  const have = new Set(tokens(conceptName));
  if (have.size === 0) return null;
  let best: TutorScript | null = null;
  let bestLen = 0;
  for (const s of TUTOR_SCRIPTS) {
    for (const name of [s.concept, ...s.aliases]) {
      const need = [...new Set(tokens(name))];
      if (need.length === 0) continue;
      // single-token aliases are too loose unless they are the whole concept name
      if (need.length === 1 && have.size > 2) continue;
      if (need.every((t) => have.has(t)) && need.length > bestLen) {
        best = s;
        bestLen = need.length;
      }
    }
  }
  return best;
}

/** Canonical demo-bank name for a concept, or null when it has no built-in content. */
export function canonicalName(conceptName: string): string | null {
  return resolveScript(conceptName)?.concept ?? null;
}

/**
 * Bank questions for a concept: exact name/alias first, then via the resolved script, then
 * a token-subset match on bank concept names (for bank entries without a tutor script).
 */
export function bankQuestionsFor(
  conceptName: string,
  purpose?: "diagnostic" | "practice" | "check",
): BankQuestion[] {
  const direct = findBankQuestions(conceptName, purpose);
  if (direct.length) return direct;
  const script = resolveScript(conceptName);
  if (script) {
    const viaScript = findBankQuestions(script.concept, purpose);
    if (viaScript.length) return viaScript;
  }
  const have = new Set(tokens(conceptName));
  let bestName: string | null = null;
  let bestLen = 0;
  for (const name of new Set(QUESTION_BANK.map((q) => q.concept))) {
    const need = [...new Set(tokens(name))];
    if (need.length === 0 || (need.length === 1 && have.size > 2)) continue;
    if (need.every((t) => have.has(t)) && need.length > bestLen) {
      bestName = name;
      bestLen = need.length;
    }
  }
  return bestName ? findBankQuestions(bestName, purpose) : [];
}
