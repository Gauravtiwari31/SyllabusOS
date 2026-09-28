// Deterministic grading of objective questions. PURE: MCQ and numeric answers never go
// through the LLM — the tutor only grades free-text (Socratic / short) replies.
import type { Outcome } from "./types";

export interface GradableQuestion {
  type: "mcq" | "numeric" | "short";
  /** mcq: option index "0".."3"; numeric: number as string (may include units) */
  answer: string;
  options?: string[] | null;
}

export interface GradeResult {
  outcome: Outcome;
  /** Human-readable correct answer, e.g. "B · Conflict serializable" or "42". */
  correctAnswerText: string;
}

/** Relative error for full / half credit on numeric answers. */
export const NUMERIC_FULL_CREDIT_REL = 0.01;
export const NUMERIC_HALF_CREDIT_REL = 0.05;
export const NUMERIC_ABS_EPSILON = 1e-6;

const letter = (i: number) => String.fromCharCode(65 + i);
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Resolve an MCQ answer/response to an option index: an index string ("0".."n-1") wins,
 * then the exact option text (case/space-insensitive), then a single letter "A".."D".
 */
export function resolveOptionIndex(value: string, options: string[]): number | null {
  const v = value.trim();
  if (/^\d+$/.test(v)) {
    const i = Number(v);
    return i < options.length ? i : null;
  }
  const byText = options.findIndex((o) => norm(o) === norm(v));
  if (byText >= 0) return byText;
  if (/^[a-z]$/i.test(v)) {
    const i = v.toUpperCase().charCodeAt(0) - 65;
    return i < options.length ? i : null;
  }
  return null;
}

const NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?`;
const FIRST_NUMBER = new RegExp(`(${NUMBER})(?:\\s*/\\s*(${NUMBER}))?`, "i");

/**
 * The first number in a string: ignores units and thousands separators (incl. Indian
 * "1,00,000"), accepts negatives, decimals, exponents and fractions like "3/4".
 */
export function parseFirstNumber(raw: string): number | null {
  let s = raw.replace(/[−–—]/g, "-"); // unicode minus / dashes
  while (/\d,\d/.test(s)) s = s.replace(/(\d),(\d)/g, "$1$2");
  const m = FIRST_NUMBER.exec(s);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  if (m[2] === undefined) return num;
  const den = Number(m[2]);
  if (!Number.isFinite(den) || den === 0) return null;
  return num / den;
}

function gradeNumeric(expected: number, got: number): Outcome {
  const diff = Math.abs(got - expected);
  if (diff <= NUMERIC_ABS_EPSILON) return 1;
  if (expected === 0) return 0;
  const rel = diff / Math.abs(expected);
  // Tiny slack so e.g. 101 vs 100 (exactly 1 %) isn't lost to floating-point error.
  if (rel <= NUMERIC_FULL_CREDIT_REL + 1e-9) return 1;
  if (rel <= NUMERIC_HALF_CREDIT_REL + 1e-9) return 0.5;
  return 0;
}

/**
 * mcq: response is the chosen index as a string ("0".."3"; exact option text also accepted) → 1 or 0.
 * numeric: parse numbers (ignore units/commas); within 1 % relative (or 1e-6 abs) → 1,
 *          within 5 % → 0.5, else 0. Unparseable → 0.
 * short: not graded here (throws) — Socratic/short answers are graded by the tutor.
 */
export function gradeObjective(q: GradableQuestion, response: string): GradeResult {
  if (q.type === "short") {
    throw new Error("gradeObjective: short answers are graded by the tutor, not deterministically");
  }

  if (q.type === "mcq") {
    const options = q.options ?? [];
    const correct = resolveOptionIndex(q.answer, options);
    if (correct === null) return { outcome: 0, correctAnswerText: q.answer.trim() };
    const chosen = resolveOptionIndex(response, options);
    return {
      outcome: chosen === correct ? 1 : 0,
      correctAnswerText: `${letter(correct)} · ${options[correct]}`,
    };
  }

  const expected = parseFirstNumber(q.answer);
  const got = parseFirstNumber(response);
  const correctAnswerText = q.answer.trim();
  if (expected === null || got === null) return { outcome: 0, correctAnswerText };
  return { outcome: gradeNumeric(expected, got), correctAnswerText };
}
