// Offline heuristic syllabus parser: typical Indian university syllabus text → DraftGraph.
// Handles "UNIT I / UNIT – II / Unit 1: / Module 3 –" headings (roman or arabic), topics
// separated by commas / semicolons / dashes / bullets / newlines, hours like "(8 hrs)",
// boilerplate sections (outcomes, text books, references, lab…) and messy pasted PDF text.
import { CONCEPT_PREREQS } from "@/lib/demo/bank";
import type { DraftGraph } from "../schemas";
import { buildDraftGraph, type LooseConcept } from "../graph";
import { resolveScript } from "./scripts";
import { fixCase, normalize, truncateWords } from "./text";

export const MAX_HEURISTIC_CONCEPTS = 40;

export interface ParsedTopic {
  name: string;
  /** extra detail (long parentheticals, merged members) → concept description */
  detail: string;
  minutes: number;
}

export interface ParsedUnit {
  /** "Unit 2 · Transactions" */
  name: string;
  topics: ParsedTopic[];
  /** topic count before capping/merging (drives unit weightage) */
  rawCount: number;
}

// ── line-level patterns ─────────────────────────────────────────────────────
const HEADING =
  /^\s*(?:#+\s*)?(unit|module|chapter)\s*(?:no\.?\s*)?[-–:.]?\s*([ivxl]{1,5}|\d{1,2})(?![a-z0-9])\s*[-–:.)]?\s*(.*)$/i;

const BOILERPLATE =
  /^\s*(?:[#*]+\s*)?(?:course\s+(?:outcomes?|objectives?|description|code|title|contents?)|learning\s+outcomes?|objectives?|outcomes?|text\s*-?\s*books?|reference(?:\s+books?|s)?|suggested\s+(?:readings?|books)|additional\s+readings?|recommended\s+books|bibliography|lab(?:oratory)?(?:\s+(?:work|experiments?|exercises?|component|session))?|list\s+of\s+(?:experiments?|practicals?|programs?)|practicals?|tutorials?|evaluation(?:\s+scheme)?|assessment|examination\s+scheme|mode\s+of\s+evaluation|teaching\s+(?:scheme|methodology|methods?)|pre-?requisites?|credits?|web\s*(?:links|resources)|e-?resources|online\s+resources|moocs?|co\s*-?\s*po\s+mapping|marks\s+distribution|total\s*(?::|hours|lectures|periods))/i;

const ITEM_JUNK =
  /^(?:total|hours?|hrs?|periods?|lectures?|marks?|credits?|[ltpc]|etc|and|or|others?|miscellaneous|introduction|overview|basics|conclusion|challenges|applications|text\s*books?|references?|case\s+stud(?:y|ies)\s*\d*)$/i;

const ORDINAL = /^(?:first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)$/i;

const HOURS_RE =
  /\(?\[?\s*\d{1,3}\s*(?:hrs?|hours?|lectures?|lecs?|periods?|sessions?|l)\b\.?\s*\]?\)?|\b(?:hours?|hrs?|lectures?|periods?)\s*[:\-–]\s*\d{1,3}\b|\(\s*\d{1,2}\s*\)|\[\s*\d{1,2}\s*\]/gi;

const TAGS_RE = /\b(?:CO|PO|PSO|BL|K)\s*-?\s*\d+(?:\s*[,/&]\s*(?:CO|PO|PSO|BL|K)?\s*-?\s*\d+)*\b/g;

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50 };

function romanToInt(s: string): number {
  let total = 0;
  const r = s.toLowerCase();
  for (let i = 0; i < r.length; i++) {
    const cur = ROMAN[r[i]] ?? 0;
    const next = ROMAN[r[i + 1]] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}

function stripHours(s: string): string {
  return s
    .replace(HOURS_RE, " ")
    .replace(TAGS_RE, " ")
    .replace(/\s+\d{1,2}\s*$/, "") // "INTRODUCTION 9"
    .replace(/\s+/g, " ")
    .trim();
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Hard caps applied before any regex runs (input is untrusted and may be huge). */
export const MAX_SYLLABUS_TEXT = 60_000;
const MAX_LINE = 1_000;

function prep(text: string): string {
  // Bound the work first: long whitespace runs and very long lines are what make the
  // heading/bullet patterns below slow on adversarial input.
  const bounded = text
    .slice(0, MAX_SYLLABUS_TEXT)
    .replace(/[ \t ]{2,}/g, " ")
    .replace(/([.\-–_=*])\1{3,}/g, "$1$1$1")
    .split("\n")
    .map((l) => l.slice(0, MAX_LINE))
    .join("\n");
  return (
    bounded
      .replace(/\r\n?/g, "\n")
      .replace(/[  - ]/g, " ")
      .replace(/[‐‑‒−]/g, "-")
      .replace(/[–—―]/g, "–")
      .replace(/\t/g, " ")
      // inline bullets (pasted PDF text) become line starts
      .replace(/\s*[•▪●◦○■□►➢✓✔❖◆]\s*/g, "\n• ")
      // messy pasted text: line break before a unit heading found mid-line
      .replace(/(\S)[ ]+(?=(?:UNIT|MODULE|CHAPTER)\s*(?:NO\.?\s*)?[-–:.]?\s*(?:[IVXL]{1,5}|\d{1,2})(?![A-Za-z0-9]))/g, "$1\n")
      .replace(/([.;:)\]\d])[ ]+(?=(?:Unit|Module|Chapter)\s*[-–:.]?\s*(?:[IVXL]{1,5}|\d{1,2})(?![A-Za-z0-9]))/g, "$1\n")
      // boilerplate headers glued mid-line ("… Dynamic SQL TEXT BOOKS: 1. …")
      .replace(/(\S)[ ]+(?=(?:TEXT\s*BOOKS?|REFERENCES?|REFERENCE\s+BOOKS|COURSE\s+OUTCOMES?|OUTCOMES|OBJECTIVES)\b|TOTAL\s*:)/g, "$1\n")
  );
}

/** Split a heading remainder into a unit title and inline topic text. */
export function splitHeadingRest(rest: string): { title: string; topicsText: string } {
  const r = rest.replace(TAGS_RE, " ").replace(/^[\s\-–:.)]+/, "").trim();
  if (!r) return { title: "", topicsText: "" };

  // "IMPLEMENTATION TECHNIQUES 9 RAID – …": ALL-CAPS title, hours number, then topics
  const numbered = r.match(/^([A-Z][A-Z &/'()+-]{2,80}?)\s+\d{1,3}\s+(\S.*)$/);
  if (numbered) return { title: numbered[1].trim(), topicsText: numbered[2] };

  // "RELATIONAL DATABASES Purpose of Database System – …" (ALL-CAPS title, then mixed case)
  const caps = r.match(/^((?:[A-Z][A-Z0-9&/'()+-]*\s+){0,7}[A-Z][A-Z0-9&/'()+-]+)\s+(?:\d{1,3}\s+)?(?=[A-Z][a-z])/);
  if (caps) {
    const title = caps[1].trim();
    if (words(title) >= 2 || title.replace(/[^A-Z]/g, "").length >= 6) {
      return { title: stripHours(title), topicsText: r.slice(caps[0].length) };
    }
  }

  const clean = stripHours(r);
  const sep = clean.match(/^(.{2,70}?)\s*(?::|\s[–-]\s|–)\s*(.+)$/);
  if (sep && words(sep[1]) <= 8 && !/[,;]/.test(sep[1])) {
    return { title: sep[1].trim(), topicsText: sep[2] };
  }
  if (/[,;–]/.test(clean)) return { title: "", topicsText: clean };
  if (words(clean) <= 8) return { title: clean, topicsText: "" };
  return { title: "", topicsText: clean };
}

const BULLET = /^(?:•\s*|[-*]\s+|\(?\d{1,2}(?:\.\d{1,2})*[.)]?\s+|\(?[a-z][.)]\s+|\(?(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)[.)]\s+)/i;

/** Join wrapped lines into logical segments (a bullet or a capitalised line starts a new one). */
export function joinLines(lines: string[]): string[] {
  const segs: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const prev = segs[segs.length - 1];
    const isBullet = BULLET.test(line);
    const continues =
      prev !== undefined &&
      !isBullet &&
      (/^[a-z(&]/.test(line) || /(?:[,&(–-]|\b(?:and|of|the|to|in|for|with|or|its|their))$/i.test(prev));
    if (continues && /\w-$/.test(prev)) segs[segs.length - 1] = prev + line; // hyphenated wrap
    else if (continues) segs[segs.length - 1] = `${prev} ${line}`;
    else segs.push(line);
  }
  return segs;
}

/** Split on a separator regex, ignoring separators inside (...) or [...]. */
function splitTopLevel(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "[") depth++;
    if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if (depth === 0) {
      const m = sep.exec(s.slice(i));
      if (m && m.index === 0) {
        out.push(cur);
        cur = "";
        i += m[0].length - 1;
        continue;
      }
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const ITEM_SEP = /^(?:\s*[,;]\s*|\s*–\s*|\s+-\s+|-\s+(?=[A-Z])|\.\s+(?=[A-Z])|\s*\|\s*)/;

function cleanItem(raw: string): ParsedTopic | null {
  let s = raw.replace(BULLET, "").trim();
  s = stripHours(s)
    .replace(/\betc\.?$/i, "")
    .replace(/^(?:and|&|also)\s+/i, "")
    .replace(/[\s.,;:–-]+$/, "")
    .replace(/^[\s.,;:–-]+/, "")
    .trim();
  // drop unbalanced brackets
  if ((s.match(/\(/g)?.length ?? 0) !== (s.match(/\)/g)?.length ?? 0)) s = s.replace(/[()]/g, "").trim();
  // keep short technical tokens like "3NF", "2PL", "ER"; drop other scraps
  if (s.replace(/[^A-Za-z]/g, "").length < 3 && !/^[0-9]?[A-Za-z]{2,4}[0-9]?$/.test(s)) return null;
  if (ITEM_JUNK.test(s)) return null;
  let detail = "";
  const paren = s.match(/\s*\(([^()]{21,})\)\s*$/);
  if (paren) {
    detail = paren[1].trim();
    s = s.slice(0, paren.index).trim();
  }
  if (!s) return null;
  s = fixCase(s);
  const compound = s.length > 40 || /\s(?:and|&|vs\.?|versus)\s|[,/]/.test(s);
  return { name: s, detail, minutes: compound ? 45 : 30 };
}

/** Split long runs ("A and B and C…") that exceed the 80-char name limit. */
function splitLong(t: ParsedTopic): ParsedTopic[] {
  if (t.name.length <= 80) return [t];
  const parts = t.name
    .split(/\s+(?:and|&)\s+|\s*\/\s*/)
    .map((p) => cleanItem(p))
    .filter((p): p is ParsedTopic => p !== null);
  if (parts.length >= 2 && parts.every((p) => p.name.length <= 80)) return parts;
  return [{ ...t, name: truncateWords(t.name, 80), detail: truncateWords(t.name, 240), minutes: 45 }];
}

/** Topic text (one unit body) → cleaned topics. */
export function splitTopics(text: string | string[]): ParsedTopic[] {
  const lines = Array.isArray(text) ? text : text.split("\n");
  const out: ParsedTopic[] = [];
  for (const seg of joinLines(lines)) {
    const body = seg.replace(BULLET, "");
    // "Label: a, b, c" → label is a topic too; bare lowercase one-word items get the label as context
    const colon = body.match(/^([^:,;()]{3,60}):\s*(.+)$/);
    let label: string | null = null;
    let rest = body;
    if (colon && words(colon[1]) <= 6 && /[,;–]/.test(colon[2])) {
      label = colon[1].trim();
      rest = colon[2].replace(/:\s+/g, ", ");
      const l = cleanItem(label);
      if (l) out.push(l);
    } else {
      rest = body.replace(/:\s+/g, ", ");
    }
    // "First, Second, Third Normal Forms": lone ordinals attach to the following item
    const pieces: string[] = [];
    let pending = "";
    for (const piece of splitTopLevel(rest, ITEM_SEP)) {
      const p = piece.replace(BULLET, "").trim();
      if (ORDINAL.test(p)) {
        pending = pending ? `${pending}, ${p}` : p;
        continue;
      }
      pieces.push(pending ? `${pending}, ${p}` : piece);
      pending = "";
    }
    for (const piece of pieces) {
      const item = cleanItem(piece);
      if (!item) continue;
      // bare one-word items under a label get context: "Transactions – states"
      if (label && !/[\s\d]/.test(item.name) && !/^[A-Z]{2,}$/.test(item.name)) {
        item.name = `${fixCase(label)} – ${item.name.toLowerCase()}`;
      }
      out.push(...splitLong(item));
    }
  }
  return out;
}

interface RawUnit {
  word: string;
  num: number | null;
  title: string;
  lines: string[];
}

/** Text → units with topics (not yet capped). */
export function parseUnits(text: string): ParsedUnit[] {
  const lines = prep(text).split("\n");
  const raw: RawUnit[] = [];
  let cur: RawUnit | null = null;
  let skipping = false;
  const preamble: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (cur && !skipping) cur.lines.push("");
      if (!cur) skipping = false; // no-heading syllabi: a blank line ends a boilerplate block
      continue;
    }
    const h = t.match(HEADING);
    if (h) {
      const numRaw = h[2];
      const num = /^\d+$/.test(numRaw) ? Number(numRaw) : romanToInt(numRaw);
      const { title, topicsText } = splitHeadingRest(h[3] ?? "");
      cur = { word: fixCase(h[1].toLowerCase()), num, title, lines: topicsText ? [topicsText] : [] };
      raw.push(cur);
      skipping = false;
      continue;
    }
    const b = t.match(BOILERPLATE);
    if (b) {
      const after = t.slice(b[0].length).trim();
      if (!after || /^[:\-–.(]/.test(after) || /^s?\s*$/.test(after)) {
        skipping = true;
        continue;
      }
    }
    if (skipping) continue;
    if (/^\s*CO\s*\d/i.test(t)) continue; // course-outcome rows
    if (cur) {
      // "UNIT I" on its own line followed by an ALL-CAPS / "Title:" line → unit title
      if (!cur.title && cur.lines.every((l) => !l.trim())) {
        const isCaps = /[A-Z]/.test(t) && t === t.toUpperCase() && words(t) <= 8 && !/[,;]/.test(t);
        const titleColon = t.match(/^([^,;:]{2,60}):\s*(.*)$/);
        if (isCaps) {
          cur.title = stripHours(t);
          continue;
        }
        if (titleColon && words(titleColon[1]) <= 6 && !BULLET.test(t)) {
          cur.title = titleColon[1].trim();
          if (titleColon[2]) cur.lines.push(titleColon[2]);
          continue;
        }
      }
      cur.lines.push(t);
    } else {
      preamble.push(t);
    }
  }

  if (raw.length === 0) return fallbackUnits(preamble);

  // merge repeated headings (table of contents + body) by label
  const byLabel = new Map<string, ParsedUnit & { title: string }>();
  const order: string[] = [];
  const seenTopics = new Set<string>();
  for (const u of raw) {
    const label = `${u.word} ${u.num ?? byLabel.size + 1}`;
    const title = u.title ? fixCase(stripHours(u.title)) : "";
    let unit = byLabel.get(label);
    if (!unit) {
      unit = { name: label, title: "", topics: [], rawCount: 0 };
      byLabel.set(label, unit);
      order.push(label);
    }
    if (!unit.title && title) unit.title = title;
    for (const tp of splitTopics(u.lines)) {
      const k = normalize(tp.name);
      if (seenTopics.has(k)) continue;
      seenTopics.add(k);
      unit.topics.push(tp);
    }
  }
  const units: ParsedUnit[] = [];
  for (const label of order) {
    const u = byLabel.get(label)!;
    const name = u.title ? `${label} · ${truncateWords(u.title, 60)}` : label;
    let topics = u.topics;
    if (topics.length === 0 && u.title && !seenTopics.has(normalize(u.title))) {
      seenTopics.add(normalize(u.title));
      topics = [{ name: truncateWords(u.title, 80), detail: "", minutes: 30 }];
    }
    if (topics.length === 0) continue;
    units.push({ name: truncateWords(name, 80), topics, rawCount: topics.length });
  }
  return units;
}

/** No unit headings: one "Topics" unit, or sequential "Part N" groups of ≤ 8. */
function fallbackUnits(lines: string[]): ParsedUnit[] {
  const seen = new Set<string>();
  const topics = splitTopics(lines).filter((t) => {
    const k = normalize(t.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (topics.length === 0) return [];
  if (topics.length <= 10) return [{ name: "Topics", topics, rawCount: topics.length }];
  const groups = Math.ceil(topics.length / 8);
  const size = Math.ceil(topics.length / groups);
  const units: ParsedUnit[] = [];
  for (let g = 0; g < groups; g++) {
    const part = topics.slice(g * size, (g + 1) * size);
    if (part.length) units.push({ name: `Part ${g + 1}`, topics: part, rawCount: part.length });
  }
  return units;
}

function mergeTopics(a: ParsedTopic, b: ParsedTopic): ParsedTopic {
  const members = [a, b].flatMap((t) => (t.detail.startsWith("Includes: ") ? t.detail.slice(10).split("; ") : [t.name]));
  const joined = members.join(", ");
  return {
    name: joined.length <= 70 ? joined : truncateWords(`${members[0]} (+${members.length - 1} more)`, 80),
    detail: truncateWords(`Includes: ${members.join("; ")}`, 240),
    minutes: Math.min(120, a.minutes + b.minutes),
  };
}

/** Cap total concepts (≥ 1 per unit) by merging adjacent topics with the shortest combined names. */
export function capUnits(units: ParsedUnit[], max = MAX_HEURISTIC_CONCEPTS): ParsedUnit[] {
  const total = units.reduce((a, u) => a + u.topics.length, 0);
  if (total <= max) return units;
  const usable = units.slice(0, max); // pathological: more units than slots
  const sum = usable.reduce((a, u) => a + u.topics.length, 0);
  const exact = usable.map((u) => (u.topics.length * max) / sum);
  const quota = exact.map((e, i) => Math.min(usable[i].topics.length, Math.max(1, Math.floor(e))));
  let left = max - quota.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((e, i) => ({ i, r: e - Math.floor(e) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  while (left > 0) {
    let gave = false;
    for (const { i } of byRemainder) {
      if (left > 0 && quota[i] < usable[i].topics.length) {
        quota[i]++;
        left--;
        gave = true;
      }
    }
    if (!gave) break;
  }
  while (left < 0) {
    const i = quota.indexOf(Math.max(...quota));
    if (quota[i] <= 1) break;
    quota[i]--;
    left++;
  }
  return usable.map((u, i) => {
    const topics = [...u.topics];
    while (topics.length > quota[i]) {
      let best = 0;
      for (let j = 1; j < topics.length - 1; j++) {
        if (topics[j].name.length + topics[j + 1].name.length < topics[best].name.length + topics[best + 1].name.length) best = j;
      }
      topics.splice(best, 2, mergeTopics(topics[best], topics[best + 1]));
    }
    return { ...u, topics };
  });
}

/** Offline prerequisite edges: only CONCEPT_PREREQS pairs where both names resolve to scripts. */
export function inferPrereqs(names: string[]): Map<string, string[]> {
  const canon = new Map<string, string>(); // canonical (lower) → concept name
  for (const n of names) {
    const c = resolveScript(n)?.concept.toLowerCase();
    if (c && !canon.has(c)) canon.set(c, n);
  }
  const table = new Map<string, string[]>();
  for (const [k, v] of Object.entries(CONCEPT_PREREQS)) table.set(k.toLowerCase(), v);
  const out = new Map<string, string[]>();
  for (const [c, name] of canon) {
    const prereqs = (table.get(c) ?? [])
      .map((p) => canon.get(p.toLowerCase()))
      .filter((p): p is string => Boolean(p) && p !== name);
    if (prereqs.length) out.set(name, prereqs);
  }
  return out;
}

/** Heuristic syllabus text → DraftGraph (source "heuristic"). Throws when no topics are found. */
export function parseSyllabusText(subject: string, text: string): DraftGraph {
  const units = capUnits(parseUnits(text));
  if (units.length === 0) {
    throw new Error("No topics found in the syllabus text. Paste the unit-wise topic list and try again.");
  }
  const totalRaw = units.reduce((a, u) => a + u.rawCount, 0);
  const loose: LooseConcept[] = [];
  for (const u of units) {
    const unitShare = (u.rawCount / totalRaw) * 100;
    for (const t of u.topics) {
      loose.push({
        name: t.name,
        unit: u.name,
        description: t.detail,
        estMinutes: t.minutes,
        weightage: unitShare / u.topics.length,
        prerequisites: [],
      });
    }
  }
  const prereqs = inferPrereqs(loose.map((c) => c.name));
  for (const c of loose) c.prerequisites = prereqs.get(c.name) ?? [];
  return buildDraftGraph(subject, "heuristic", loose);
}
