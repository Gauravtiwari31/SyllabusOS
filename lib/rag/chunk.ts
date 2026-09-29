// Pure text helpers for grounding: page-text normalisation and page-bounded chunking.
// No server deps; unit-tested in lib/rag/chunk.test.ts.

export interface PageText {
  /** 1-based page number */
  page: number;
  text: string;
}

/** ~4 characters per token for English prose (Gemini tokenizer average). */
export const CHARS_PER_TOKEN = 4;
export const DEFAULT_TARGET_TOKENS = 800;
export const DEFAULT_OVERLAP_TOKENS = 100;

// Control characters except \t and \n. Postgres TEXT rejects NUL; the rest are PDF noise.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/**
 * Clean one page of extracted text: strip control characters, collapse runs of spaces/tabs,
 * trim every line and keep at most one blank line between paragraphs.
 */
export function normalizePageText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\f/g, "\n\n")
    .replace(CONTROL, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** PDFs are read up to these caps, whether on the server or on the student's device. */
export const MAX_PDF_PAGES = 300;
export const MAX_PDF_CHARS = 400_000;

/**
 * Raw per-page PDF text → normalised pages, empty pages dropped, stopping at MAX_PDF_CHARS.
 * Used for server-side extraction and, again on the server, for pages read on the device.
 */
export function capPageTexts(raw: PageText[]): PageText[] {
  const pages: PageText[] = [];
  let total = 0;
  for (const p of raw) {
    if (total >= MAX_PDF_CHARS) break;
    const clean = normalizePageText(p.text).slice(0, MAX_PDF_CHARS - total);
    total += clean.length;
    if (clean) pages.push({ page: p.page, text: clean });
  }
  return pages;
}

/** True when a chunk carries any letter (drops page-number-only and punctuation-only chunks). */
export function hasContent(text: string): boolean {
  return /\p{L}/u.test(text);
}

// Split levels, coarsest first: paragraph → line → sentence → word.
const LEVELS: RegExp[] = [/\n[ \t]*\n+/g, /\n/g, /(?<=[.!?;:])\s+/g, /\s+/g];

/** Split after every match of `re`, keeping the delimiter on the left piece (join = original). */
function splitKeep(text: string, re: RegExp): string[] {
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end > last && end < text.length) {
      out.push(text.slice(last, end));
      last = end;
    }
  }
  out.push(text.slice(last));
  return out.filter((p) => p.length > 0);
}

/** Pieces no longer than `max` whose concatenation is `text`, cut at the coarsest boundary that works. */
export function atomize(text: string, max: number, level = 0): string[] {
  if (text.length <= max) return [text];
  if (level >= LEVELS.length) {
    const parts: string[] = [];
    for (let i = 0; i < text.length; i += max) parts.push(text.slice(i, i + max));
    return parts;
  }
  const pieces = splitKeep(text, LEVELS[level]);
  if (pieces.length <= 1) return atomize(text, max, level + 1);
  return pieces.flatMap((p) => (p.length <= max ? [p] : atomize(p, max, level + 1)));
}

/**
 * The last ≤ `maxChars` of `text`, starting at a sentence boundary when one exists in that
 * window, else at a word boundary. Empty when nothing sensible fits.
 */
export function tailText(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const window = t.slice(t.length - maxChars);
  const sentence = /[.!?;:]\s+/.exec(window);
  if (sentence && window.length - (sentence.index + sentence[0].length) >= maxChars / 4) {
    return window.slice(sentence.index + sentence[0].length).trim();
  }
  const space = window.search(/\s/);
  return space >= 0 ? window.slice(space).trim() : "";
}

/** One page's text → chunks of ≤ maxChars (sizes balanced), each after the first led by an overlap tail. */
function chunkPageText(text: string, maxChars: number, overlapChars: number): string[] {
  const atoms = atomize(text, maxChars);
  const total = text.length;
  // Balanced target: 3300 chars → two ~1650-char chunks rather than 3200 + 100.
  const target = Math.min(maxChars, Math.ceil(total / Math.ceil(total / maxChars)));

  const bodies: string[] = [];
  let cur = "";
  for (const a of atoms) {
    if (cur && (cur.length + a.length > maxChars || cur.length >= target)) {
      bodies.push(cur);
      cur = "";
    }
    cur += a;
  }
  if (cur) bodies.push(cur);

  return bodies.map((body, i) => {
    const b = body.trim();
    if (i === 0 || overlapChars <= 0) return b;
    const lead = tailText(bodies[i - 1], Math.min(overlapChars, maxChars - b.length - 1));
    return lead ? `${lead} ${b}` : b;
  });
}

/**
 * Split pages into ~targetTokens chunks, never crossing a page boundary (keeps citations exact).
 * Splits on paragraph, then line, then sentence, then word boundaries; consecutive chunks of a
 * page share ~overlapTokens of text; chunks without any letter are dropped.
 */
export function chunkPages(
  pages: PageText[],
  opts: { targetTokens?: number; overlapTokens?: number } = {},
): PageText[] {
  const targetTokens = clampInt(opts.targetTokens ?? DEFAULT_TARGET_TOKENS, 50, 2000);
  const overlapTokens = clampInt(opts.overlapTokens ?? DEFAULT_OVERLAP_TOKENS, 0, Math.floor(targetTokens / 2));
  const maxChars = targetTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;

  const out: PageText[] = [];
  for (const p of pages) {
    if (!Number.isInteger(p.page) || p.page < 1) continue;
    const text = normalizePageText(p.text ?? "");
    if (!text) continue;
    for (const chunk of chunkPageText(text, maxChars, overlapChars)) {
      if (hasContent(chunk)) out.push({ page: p.page, text: chunk });
    }
  }
  return out;
}

function clampInt(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.round(x)));
}
