// Offline previous-year-paper parser: split pasted/extracted PYQ text into questions,
// detect marks and year, and map each question to the best concept by token overlap.
// Linear-time patterns only (input is untrusted and may be large).
import { bestConceptForText } from "@/components/onboarding/model";

export const MAX_PYQ_TEXT = 60_000;
export const MAX_PYQ_QUESTIONS = 300;

export interface ParsedPyq {
  text: string;
  marks: number;
  year: number | null;
}

// "Q1.", "Q.1", "Q 1)", "1.", "1)", "(a)", "a)", "i)", "Question 3"
const QUESTION_START = /^(?:q(?:uestion)?\s?\.?\s?\d{1,3}\s?[.):-]?|\d{1,3}\s?[.)]|\(?[a-h]\)|\(?(?:i{1,3}|iv|v|vi{0,3})\)|\([a-h]\))\s+/i;
const MARKS = /[[(]\s?(\d{1,2})\s?(?:m|marks?)?\s?[\])]|\b(\d{1,2})\s?(?:m\b|marks?\b)/i;
const YEAR = /\b(20[0-4]\d|19[89]\d)\b/;

/** Split PYQ text into questions with marks (default 5 when absent) and the nearest year. */
export function parsePyqText(raw: string): ParsedPyq[] {
  const text = raw.slice(0, MAX_PYQ_TEXT).replace(/\r\n?/g, "\n");
  const lines = text
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").trim().slice(0, 1000))
    .filter(Boolean);

  const out: ParsedPyq[] = [];
  let year: number | null = null;
  let cur: string[] = [];
  const flush = () => {
    const body = cur.join(" ").trim();
    cur = [];
    if (body.length < 12 || !/[a-z]{3}/i.test(body)) return;
    const m = MARKS.exec(body);
    const marks = m ? Number(m[1] ?? m[2]) : 5;
    const clean = body.replace(MARKS, "").replace(QUESTION_START, "").replace(/\s+/g, " ").trim();
    if (clean.length < 10) return;
    out.push({ text: clean.slice(0, 600), marks: marks > 0 && marks <= 50 ? marks : 5, year });
  };

  for (const line of lines) {
    const y = YEAR.exec(line);
    // A short line with a year is a paper header ("Dec 2023 — End Semester").
    if (y && line.length < 80 && !QUESTION_START.test(line)) {
      flush();
      year = Number(y[1]);
      continue;
    }
    if (QUESTION_START.test(line)) {
      flush();
      cur.push(line);
    } else if (cur.length) {
      cur.push(line);
    }
    if (out.length >= MAX_PYQ_QUESTIONS) break;
  }
  flush();
  return out.slice(0, MAX_PYQ_QUESTIONS);
}

export interface MappedPyq extends ParsedPyq {
  conceptId: string;
}

/** Map parsed questions to concepts; questions matching no concept are dropped. */
export function mapParsedPyqs(
  questions: ParsedPyq[],
  concepts: Array<{ id: string; name: string; description?: string | null }>,
): MappedPyq[] {
  const out: MappedPyq[] = [];
  for (const q of questions) {
    const conceptId = bestConceptForText(q.text, concepts);
    if (conceptId) out.push({ ...q, conceptId });
  }
  return out;
}

/** conceptId → share of total marks (0..1), raw marks and total. */
export function weightageFrom(questions: Array<{ marks: number; conceptId: string }>, conceptIds: string[]) {
  const marks: Record<string, number> = Object.fromEntries(conceptIds.map((id) => [id, 0]));
  let totalMarks = 0;
  for (const q of questions) {
    if (!(q.conceptId in marks)) continue;
    marks[q.conceptId] += q.marks;
    totalMarks += q.marks;
  }
  const weightage: Record<string, number> = Object.fromEntries(
    conceptIds.map((id) => [id, totalMarks > 0 ? marks[id] / totalMarks : 0]),
  );
  return { weightage, marks, totalMarks };
}
