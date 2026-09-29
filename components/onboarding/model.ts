// Pure onboarding logic shared by the graph editor (client) and lib/services/onboarding (server).
// No React, no server deps. Unit-tested in lib/services/onboarding.test.ts.
import type { DraftConcept, DraftGraph } from "@/lib/ai/schemas";
import type { ConceptGraphData, GraphEdge, GraphNode } from "@/lib/types";
import type { SetupStep } from "./types";

export const DRAFT_LIMITS = {
  minConcepts: 1,
  maxConcepts: 60,
  minMinutes: 5,
  maxMinutes: 240,
  maxName: 80,
  maxUnit: 80,
  maxDescription: 240,
} as const;

/**
 * Caps for uploading a syllabus / PYQ / notes PDF *file*. With Vercel Blob configured the
 * browser uploads it straight to Blob and the action only receives its URL, so MAX_UPLOAD_MB
 * applies (Gemini takes inline PDFs up to 50 MB). Without Blob the file travels in the
 * server-action body, which Vercel caps at 4.5 MB per request, so MAX_INLINE_UPLOAD_MB applies
 * (next.config.ts sets the body limit to match). PDFs over the cap aren't rejected: their text
 * is read on the device with PDF.js (pdf-text.ts), so only scans (no text layer) are limited.
 */
export const MAX_UPLOAD_MB = 20;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_INLINE_UPLOAD_MB = 4;
export const MAX_INLINE_UPLOAD_BYTES = MAX_INLINE_UPLOAD_MB * 1024 * 1024;

/** File-upload cap in MB for the upload path in use. */
export const uploadLimitMb = (directUploads: boolean) => (directUploads ? MAX_UPLOAD_MB : MAX_INLINE_UPLOAD_MB);

/** True when a PDF is over the file-upload cap, so its text is read on the device instead. */
export const readsOnDevice = (size: number, directUploads: boolean) => size > uploadLimitMb(directUploads) * 1024 * 1024;
export const DEFAULT_UNIT = "General";
export const DEFAULT_EST_MINUTES = 30;

// ── small utils ─────────────────────────────────────────────────────────────
let keySeq = 0;
/** Stable client key for a new draft concept (not a DB id). Call from event handlers only. */
export function newKey(prefix = "c"): string {
  keySeq += 1;
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${keySeq.toString(36)}`;
}

/** Collapse whitespace; used for display names. */
export function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Case/space-insensitive identity of a name. */
export function normName(s: string): string {
  return cleanText(s).toLowerCase();
}

export const round1 = (x: number) => Math.round(x * 10) / 10;

function clampNumber(x: unknown, min: number, max: number, fallback: number): number {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ── units & weightage ───────────────────────────────────────────────────────
/** Unit names in first-appearance order, plus any empty units the editor is holding. */
export function unitsOf(concepts: Pick<DraftConcept, "unit">[], extraUnits: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [...concepts.map((c) => c.unit), ...extraUnits]) {
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

export function groupByUnit(
  concepts: DraftConcept[],
  extraUnits: string[] = [],
): Array<{ unit: string; concepts: DraftConcept[] }> {
  return unitsOf(concepts, extraUnits).map((unit) => ({
    unit,
    concepts: concepts.filter((c) => c.unit === unit),
  }));
}

export function weightageTotal(concepts: Pick<DraftConcept, "weightage">[]): number {
  return concepts.reduce((s, c) => s + (Number.isFinite(c.weightage) ? Math.max(0, c.weightage) : 0), 0);
}

/**
 * Percent inputs → shares that sum to 1. When every weightage is 0 the concepts share
 * equally, so the engine never sees an all-zero goal.
 */
export function normaliseWeightage(concepts: Pick<DraftConcept, "key" | "weightage">[]): Map<string, number> {
  const total = weightageTotal(concepts);
  const out = new Map<string, number>();
  for (const c of concepts) {
    const w = Number.isFinite(c.weightage) ? Math.max(0, c.weightage) : 0;
    out.set(c.key, total > 0 ? w / total : 1 / Math.max(1, concepts.length));
  }
  return out;
}

// ── draft → graph preview ───────────────────────────────────────────────────
/** Draft → ConceptGraphData for the live preview (every node is "unknown": no evidence yet). */
export function draftToGraphData(draft: Pick<DraftGraph, "concepts">): ConceptGraphData {
  const share = normaliseWeightage(draft.concepts);
  const keys = new Set(draft.concepts.map((c) => c.key));

  const nodes: GraphNode[] = draft.concepts.map((c) => ({
    id: c.key,
    name: cleanText(c.name) || "Untitled concept",
    unit: c.unit,
    description: c.description ? c.description : null,
    mastery: 0,
    band: "unknown",
    confidence: "none",
    evidenceCount: 0,
    weightage: share.get(c.key) ?? 0,
    weightageSource: "estimated",
    pyqMarks: null,
    estMinutes: c.estMinutes,
  }));

  const seenEdges = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const c of draft.concepts) {
    for (const p of c.prereqKeys) {
      const id = `${p}->${c.key}`;
      if (p === c.key || !keys.has(p) || seenEdges.has(id)) continue;
      seenEdges.add(id);
      edges.push({ id, from: p, to: c.key });
    }
  }

  const units = unitsOf(draft.concepts).map((name) => {
    const children = nodes.filter((n) => n.unit === name);
    return {
      name,
      mastery: 0,
      weightage: children.reduce((s, n) => s + n.weightage, 0),
      conceptCount: children.length,
    };
  });

  return { nodes, edges, units };
}

// ── prerequisites & cycles ──────────────────────────────────────────────────
type PrereqNode = Pick<DraftConcept, "key" | "prereqKeys">;

/**
 * Path of keys from `startKey` to `targetKey` following prerequisite links
 * ([start, its prereq, …, target]), or null. BFS → shortest explanation.
 */
export function prereqPath(concepts: PrereqNode[], startKey: string, targetKey: string): string[] | null {
  if (startKey === targetKey) return [startKey];
  const byKey = new Map(concepts.map((c) => [c.key, c]));
  const prev = new Map<string, string>();
  const seen = new Set([startKey]);
  const queue = [startKey];
  while (queue.length > 0) {
    const k = queue.shift() as string;
    for (const p of byKey.get(k)?.prereqKeys ?? []) {
      if (seen.has(p) || !byKey.has(p)) continue;
      seen.add(p);
      prev.set(p, k);
      if (p === targetKey) {
        const path = [p];
        let cur = p;
        while (prev.has(cur)) {
          cur = prev.get(cur) as string;
          path.unshift(cur);
        }
        return path;
      }
      queue.push(p);
    }
  }
  return null;
}

/**
 * Would making `prereqKey` a prerequisite of `conceptKey` create a loop?
 * Returns the offending path [prereqKey, …, conceptKey] or null.
 */
export function cycleIfAdded(concepts: PrereqNode[], conceptKey: string, prereqKey: string): string[] | null {
  return prereqPath(concepts, prereqKey, conceptKey);
}

/** Human explanation for a blocked prerequisite, or null when it is allowed. */
export function explainCycle(concepts: DraftConcept[], conceptKey: string, prereqKey: string): string | null {
  const path = cycleIfAdded(concepts, conceptKey, prereqKey);
  if (!path) return null;
  if (path.length === 1) return "A concept can't be its own prerequisite.";
  const name = (k: string) => cleanText(concepts.find((c) => c.key === k)?.name ?? "?") || "Untitled";
  const via = path.slice(1, -1).map(name);
  return `${name(prereqKey)} already builds on ${name(conceptKey)}${
    via.length ? ` (via ${via.join(" → ")})` : ""
  }. Adding it would create a loop.`;
}

/**
 * Any cycle in the prerequisite graph as keys [k0, k1, …, k0] where each key lists the next
 * as a prerequisite; null when the graph is acyclic.
 */
export function findCycle(concepts: PrereqNode[]): string[] | null {
  const byKey = new Map(concepts.map((c) => [c.key, c]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (k: string): string[] | null => {
    state.set(k, "visiting");
    stack.push(k);
    for (const p of byKey.get(k)?.prereqKeys ?? []) {
      if (!byKey.has(p)) continue;
      const s = state.get(p);
      if (s === "visiting") return [...stack.slice(stack.indexOf(p)), p];
      if (s === undefined) {
        const found = visit(p);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(k, "done");
    return null;
  };

  for (const c of concepts) {
    if (!state.has(c.key)) {
      const found = visit(c.key);
      if (found) return found;
    }
  }
  return null;
}

// ── sanitise (AI output) & validate (before confirm) ────────────────────────
/**
 * Make an extracted draft safe to edit: trims names, fills units, clamps numbers, removes
 * duplicate keys/names, dangling or self prerequisites, caps the concept count and breaks
 * cycles. Returns the fixes applied so the UI can tell the student.
 */
export function sanitizeDraft(
  draft: DraftGraph,
  opts: { maxConcepts?: number } = {},
): { draft: DraftGraph; fixes: string[] } {
  const max = opts.maxConcepts ?? DRAFT_LIMITS.maxConcepts;
  const fixes: string[] = [];

  let concepts: DraftConcept[] = draft.concepts.map((c) => ({
    key: typeof c.key === "string" ? c.key : "",
    name: cleanText(c.name ?? "").slice(0, DRAFT_LIMITS.maxName),
    description: cleanText(c.description ?? "").slice(0, DRAFT_LIMITS.maxDescription),
    unit: cleanText(c.unit ?? "").slice(0, DRAFT_LIMITS.maxUnit) || DEFAULT_UNIT,
    estMinutes: Math.round(
      clampNumber(c.estMinutes, DRAFT_LIMITS.minMinutes, DRAFT_LIMITS.maxMinutes, DEFAULT_EST_MINUTES),
    ),
    weightage: round1(clampNumber(c.weightage, 0, 100, 0)),
    prereqKeys: Array.isArray(c.prereqKeys) ? c.prereqKeys.filter((k) => typeof k === "string") : [],
  }));

  const named = concepts.filter((c) => c.name.length > 0);
  if (named.length < concepts.length) {
    const n = concepts.length - named.length;
    fixes.push(`Dropped ${n} concept${n === 1 ? "" : "s"} without a name`);
  }
  concepts = named;

  const seenKeys = new Set<string>();
  concepts = concepts.map((c) => {
    if (!c.key || seenKeys.has(c.key)) {
      const key = newKey();
      seenKeys.add(key);
      return { ...c, key };
    }
    seenKeys.add(c.key);
    return c;
  });

  const nameCount = new Map<string, number>();
  const taken = new Set(concepts.map((c) => normName(c.name)));
  concepts = concepts.map((c) => {
    const n = normName(c.name);
    const count = (nameCount.get(n) ?? 0) + 1;
    nameCount.set(n, count);
    if (count === 1) return c;
    let suffix = count;
    let renamed = `${c.name} (${suffix})`;
    while (taken.has(normName(renamed))) renamed = `${c.name} (${++suffix})`;
    taken.add(normName(renamed));
    fixes.push(`Renamed duplicate "${c.name}" to "${renamed}"`);
    return { ...c, name: renamed.slice(0, DRAFT_LIMITS.maxName) };
  });

  if (concepts.length > max) {
    fixes.push(`Kept the first ${max} of ${concepts.length} concepts`);
    concepts = concepts.slice(0, max);
  }

  const keys = new Set(concepts.map((c) => c.key));
  concepts = concepts.map((c) => ({
    ...c,
    prereqKeys: [...new Set(c.prereqKeys)].filter((k) => k !== c.key && keys.has(k)),
  }));

  const nameOf = (k: string) => concepts.find((c) => c.key === k)?.name ?? "?";
  for (let guard = 0; guard < 500; guard++) {
    const cycle = findCycle(concepts);
    if (!cycle) break;
    // cycle = [k0, …, k(n-1), k0]: drop the closing link k(n-1) → needs k0.
    const dependent = cycle[cycle.length - 2];
    const prereq = cycle[cycle.length - 1];
    concepts = concepts.map((c) =>
      c.key === dependent ? { ...c, prereqKeys: c.prereqKeys.filter((k) => k !== prereq) } : c,
    );
    fixes.push(`Removed a circular prerequisite: "${nameOf(dependent)}" no longer requires "${nameOf(prereq)}"`);
  }

  return { draft: { subject: cleanText(draft.subject ?? ""), source: draft.source, concepts }, fixes };
}

export type DraftIssueField = "name" | "unit" | "estMinutes" | "weightage" | "graph";

export interface DraftIssue {
  key?: string;
  field: DraftIssueField;
  message: string;
}

/** Everything that blocks "Confirm graph". Empty array = valid. */
export function validateDraft(draft: Pick<DraftGraph, "concepts">): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const { concepts } = draft;

  if (concepts.length < DRAFT_LIMITS.minConcepts) {
    issues.push({ field: "graph", message: "Add at least one concept." });
  }
  if (concepts.length > DRAFT_LIMITS.maxConcepts) {
    issues.push({
      field: "graph",
      message: `Keep it to ${DRAFT_LIMITS.maxConcepts} concepts or fewer (you have ${concepts.length}). Merge or delete some.`,
    });
  }

  const byName = new Map<string, string[]>();
  for (const c of concepts) {
    const name = cleanText(c.name);
    if (!name) issues.push({ key: c.key, field: "name", message: "Name can't be empty." });
    else if (name.length > DRAFT_LIMITS.maxName)
      issues.push({ key: c.key, field: "name", message: `Name is over ${DRAFT_LIMITS.maxName} characters.` });
    if (name) byName.set(normName(name), [...(byName.get(normName(name)) ?? []), c.key]);

    if (!cleanText(c.unit)) issues.push({ key: c.key, field: "unit", message: "Unit name can't be empty." });
    if (
      !Number.isInteger(c.estMinutes) ||
      c.estMinutes < DRAFT_LIMITS.minMinutes ||
      c.estMinutes > DRAFT_LIMITS.maxMinutes
    ) {
      issues.push({
        key: c.key,
        field: "estMinutes",
        message: `Minutes must be a whole number from ${DRAFT_LIMITS.minMinutes} to ${DRAFT_LIMITS.maxMinutes}.`,
      });
    }
    if (!Number.isFinite(c.weightage) || c.weightage < 0 || c.weightage > 100) {
      issues.push({ key: c.key, field: "weightage", message: "Weightage must be between 0 and 100 %." });
    }
  }

  for (const [, keys] of byName) {
    if (keys.length < 2) continue;
    const label = cleanText(concepts.find((c) => c.key === keys[0])?.name ?? "");
    for (const key of keys) issues.push({ key, field: "name", message: `Duplicate name "${label}".` });
  }

  const cycle = findCycle(concepts);
  if (cycle) {
    const name = (k: string) => cleanText(concepts.find((c) => c.key === k)?.name ?? "?");
    issues.push({ field: "graph", message: `Circular prerequisites: ${cycle.map(name).join(" → ")}.` });
  }

  return issues;
}

// ── editor reducer ──────────────────────────────────────────────────────────
export type DraftAction =
  | { type: "replace"; draft: DraftGraph }
  | { type: "rename"; key: string; name: string }
  | { type: "update"; key: string; patch: Partial<Pick<DraftConcept, "estMinutes" | "weightage" | "description">> }
  | { type: "delete"; key: string }
  | { type: "add"; key: string; unit: string; name: string }
  | { type: "togglePrereq"; key: string; prereqKey: string }
  | { type: "renameUnit"; from: string; to: string }
  | { type: "deleteUnit"; unit: string };

function withoutKeys(concepts: DraftConcept[], removed: Set<string>): DraftConcept[] {
  return concepts
    .filter((c) => !removed.has(c.key))
    .map((c) =>
      c.prereqKeys.some((k) => removed.has(k)) ? { ...c, prereqKeys: c.prereqKeys.filter((k) => !removed.has(k)) } : c,
    );
}

/** Pure editor reducer. Invalid operations (e.g. a prerequisite that makes a loop) are no-ops. */
export function draftReducer(draft: DraftGraph, action: DraftAction): DraftGraph {
  switch (action.type) {
    case "replace":
      return action.draft;
    case "rename":
      return {
        ...draft,
        concepts: draft.concepts.map((c) =>
          c.key === action.key ? { ...c, name: action.name.slice(0, DRAFT_LIMITS.maxName) } : c,
        ),
      };
    case "update":
      return {
        ...draft,
        concepts: draft.concepts.map((c) => (c.key === action.key ? { ...c, ...action.patch } : c)),
      };
    case "delete":
      return { ...draft, concepts: withoutKeys(draft.concepts, new Set([action.key])) };
    case "add": {
      const inUnit = draft.concepts.filter((c) => c.unit === action.unit);
      const pool = inUnit.length ? inUnit : draft.concepts;
      const weightage = pool.length ? round1(weightageTotal(pool) / pool.length) : 5;
      const concept: DraftConcept = {
        key: action.key,
        name: action.name.slice(0, DRAFT_LIMITS.maxName),
        description: "",
        unit: action.unit,
        estMinutes: DEFAULT_EST_MINUTES,
        weightage,
        prereqKeys: [],
      };
      let lastIdx = -1;
      draft.concepts.forEach((c, i) => {
        if (c.unit === action.unit) lastIdx = i;
      });
      const concepts = [...draft.concepts];
      concepts.splice(lastIdx >= 0 ? lastIdx + 1 : concepts.length, 0, concept);
      return { ...draft, concepts };
    }
    case "togglePrereq": {
      const target = draft.concepts.find((c) => c.key === action.key);
      if (!target) return draft;
      if (target.prereqKeys.includes(action.prereqKey)) {
        return {
          ...draft,
          concepts: draft.concepts.map((c) =>
            c.key === action.key ? { ...c, prereqKeys: c.prereqKeys.filter((k) => k !== action.prereqKey) } : c,
          ),
        };
      }
      if (!draft.concepts.some((c) => c.key === action.prereqKey)) return draft;
      if (cycleIfAdded(draft.concepts, action.key, action.prereqKey)) return draft;
      return {
        ...draft,
        concepts: draft.concepts.map((c) =>
          c.key === action.key ? { ...c, prereqKeys: [...c.prereqKeys, action.prereqKey] } : c,
        ),
      };
    }
    case "renameUnit": {
      const to = cleanText(action.to).slice(0, DRAFT_LIMITS.maxUnit);
      if (!to || to === action.from) return draft;
      return { ...draft, concepts: draft.concepts.map((c) => (c.unit === action.from ? { ...c, unit: to } : c)) };
    }
    case "deleteUnit": {
      const removed = new Set(draft.concepts.filter((c) => c.unit === action.unit).map((c) => c.key));
      return { ...draft, concepts: withoutKeys(draft.concepts, removed) };
    }
  }
}

/** A unit name not yet used, e.g. "Unit 5". */
export function nextUnitName(existing: string[]): string {
  const taken = new Set(existing.map(normName));
  for (let i = existing.length + 1; ; i++) {
    const name = `Unit ${i}`;
    if (!taken.has(normName(name))) return name;
  }
}

// ── confirm plan (server uses it to write rows) ─────────────────────────────
export interface ConfirmConceptPlan {
  key: string;
  name: string;
  description: string | null;
  unit: string;
  estMinutes: number;
  /** share 0..1 */
  weightage: number;
  order: number;
}

/**
 * Validated draft → rows to insert: names trimmed, units kept contiguous in display order,
 * weightage normalised to shares, prerequisite edges de-duplicated.
 */
export function planConfirm(draft: Pick<DraftGraph, "concepts">): {
  concepts: ConfirmConceptPlan[];
  edges: Array<{ fromKey: string; toKey: string }>;
} {
  const share = normaliseWeightage(draft.concepts);
  const ordered = groupByUnit(draft.concepts).flatMap((g) => g.concepts);
  const concepts = ordered.map((c, order) => ({
    key: c.key,
    name: cleanText(c.name),
    description: cleanText(c.description ?? "") || null,
    unit: cleanText(c.unit),
    estMinutes: c.estMinutes,
    weightage: share.get(c.key) ?? 0,
    order,
  }));
  const keys = new Set(concepts.map((c) => c.key));
  const seen = new Set<string>();
  const edges: Array<{ fromKey: string; toKey: string }> = [];
  for (const c of ordered) {
    for (const p of c.prereqKeys) {
      const id = `${p}->${c.key}`;
      if (p === c.key || !keys.has(p) || seen.has(id)) continue;
      seen.add(id);
      edges.push({ fromKey: p, toKey: c.key });
    }
  }
  return { concepts, edges };
}

/** Confirmed DB concepts + edges → an editable draft (keys are DB ids). */
export function draftFromConcepts(input: {
  subject: string;
  concepts: Array<{
    id: string;
    name: string;
    description: string | null;
    unit: string;
    estMinutes: number;
    weightage: number;
  }>;
  edges: Array<{ from: string; to: string }>;
}): DraftGraph {
  const prereqs = new Map<string, string[]>();
  for (const e of input.edges) prereqs.set(e.to, [...(prereqs.get(e.to) ?? []), e.from]);
  return {
    subject: input.subject,
    source: "ai",
    concepts: input.concepts.map((c) => ({
      key: c.id,
      name: c.name,
      description: c.description ?? "",
      unit: c.unit,
      estMinutes: Math.round(clampNumber(c.estMinutes, DRAFT_LIMITS.minMinutes, DRAFT_LIMITS.maxMinutes, 30)),
      weightage: round1(clampNumber(c.weightage * 100, 0, 100, 0)),
      prereqKeys: prereqs.get(c.id) ?? [],
    })),
  };
}

// ── PYQ weightage ───────────────────────────────────────────────────────────
/**
 * Marks per concept → share of total PYQ marks. Questions without marks are counted
 * instead when the whole paper carries no marks (basis "count").
 */
export function pyqWeightage(
  questions: Array<{ conceptId: string | null; marks: number | null }>,
  conceptIds: string[],
): { share: Record<string, number>; marks: Record<string, number>; total: number; basis: "marks" | "count" } {
  const valid = new Set(conceptIds);
  const mapped = questions.filter((q): q is { conceptId: string; marks: number | null } =>
    Boolean(q.conceptId && valid.has(q.conceptId)),
  );
  const safeMarks = (m: number | null) => (m !== null && Number.isFinite(m) && m > 0 ? m : 0);
  const basis = mapped.some((q) => safeMarks(q.marks) > 0) ? "marks" : "count";

  const marks: Record<string, number> = Object.fromEntries(conceptIds.map((id) => [id, 0]));
  for (const q of mapped) marks[q.conceptId] += basis === "marks" ? safeMarks(q.marks) : 1;
  const total = Object.values(marks).reduce((s, m) => s + m, 0);
  const share: Record<string, number> = Object.fromEntries(
    conceptIds.map((id) => [id, total > 0 ? marks[id] / total : 0]),
  );
  return { share, marks, total, basis };
}

// ── notes helpers ───────────────────────────────────────────────────────────
export interface PageChunk {
  /** 1-based page number */
  page: number;
  text: string;
}

const PAGE_MARKER = /^[ \t]*-{2,}[ \t]*page[ \t]+(\d+)[ \t]*-{2,}[ \t]*$/gim;

function packPieces(pieces: string[], max: number, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const p of pieces) {
    if (cur && cur.length + sep.length + p.length > max) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}${sep}${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

function hardSplit(paragraph: string, max: number): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/).flatMap((s) => {
    if (s.length <= max) return [s];
    const parts: string[] = [];
    for (let i = 0; i < s.length; i += max) parts.push(s.slice(i, i + max));
    return parts;
  });
  return packPieces(sentences, max, " ");
}

/**
 * Pasted notes → pages for citation. Honours form-feeds and "--- page N ---" markers;
 * otherwise packs paragraphs into ~maxChars pseudo-pages.
 */
export function splitTextIntoPages(input: string, maxChars = 3000): PageChunk[] {
  const text = input.replace(/\r\n?/g, "\n");

  if (text.includes("\f")) {
    return text
      .split("\f")
      .map((t, i) => ({ page: i + 1, text: t.trim() }))
      .filter((p) => p.text.length > 0);
  }

  const markers = [...text.matchAll(PAGE_MARKER)];
  if (markers.length > 0) {
    const pages: PageChunk[] = [];
    const lead = text.slice(0, markers[0].index).trim();
    markers.forEach((m, i) => {
      const start = (m.index ?? 0) + m[0].length;
      const end = i + 1 < markers.length ? (markers[i + 1].index ?? text.length) : text.length;
      let body = text.slice(start, end).trim();
      if (i === 0 && lead) body = `${lead}\n\n${body}`.trim();
      if (body) pages.push({ page: Math.max(1, Number(m[1])), text: body });
    });
    return pages;
  }

  const paragraphs = text
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > maxChars ? hardSplit(p, maxChars) : [p]));
  return packPieces(paragraphs, maxChars, "\n\n").map((t, i) => ({ page: i + 1, text: t }));
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "that", "this", "are", "its", "their", "what", "how",
  "why", "using", "use", "based", "basic", "basics", "introduction", "intro", "concept", "concepts",
  "unit", "part", "types", "type", "overview",
]);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Best concept for a chunk of notes by name-token overlap (used to re-tag note chunks after
 * the graph is re-confirmed). Null when no concept name word appears in the text.
 */
export function bestConceptForText(
  text: string,
  concepts: Array<{ id: string; name: string; description?: string | null }>,
): string | null {
  const words = tokens(text);
  const haySet = new Set(words);
  const hay = ` ${words.join(" ")} `;
  let best: { id: string; score: number } | null = null;
  for (const c of concepts) {
    const nameTokens = [...new Set(tokens(c.name))];
    if (nameTokens.length === 0) continue;
    const hits = nameTokens.filter((t) => haySet.has(t)).length;
    if (hits === 0) continue;
    let score = (hits / nameTokens.length) * 2 + hits * 0.5;
    if (nameTokens.length > 1 && hay.includes(` ${nameTokens.join(" ")} `)) score += 3;
    if (c.description) {
      const d = [...new Set(tokens(c.description))];
      if (d.length) score += (d.filter((t) => haySet.has(t)).length / d.length) * 0.5;
    }
    if (!best || score > best.score) best = { id: c.id, score };
  }
  return best?.id ?? null;
}

// ── files ───────────────────────────────────────────────────────────────────
/** Client-side PDF check on metadata (any size: see readsOnDevice). Returns an error message or null. */
export function checkPdfMeta(file: { name: string; type: string; size: number }): string | null {
  if (file.size <= 0) return "That file is empty.";
  const looksPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksPdf) return `"${file.name}" isn't a PDF. Upload a PDF or paste the text.`;
  return null;
}

/** "%PDF-" must appear within the first 1024 bytes. */
export function isPdfBytes(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - 4, 1024);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) {
      return true;
    }
  }
  return false;
}

/** Keep only the base name; strip control characters; cap the length. */
export function safeFileName(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // Control characters and bidi overrides (which can disguise "gpj.pdf" as "pdf.jpg").
  const cleaned = base.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 120);
  return cleaned || fallback;
}

/** Name for a Blob pathname (it becomes part of a public URL): [A-Za-z0-9._-] only, ends in .pdf. */
export function blobFileName(name: string, fallback: string): string {
  const stem = safeFileName(name, fallback)
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${stem || fallback.replace(/\.pdf$/i, "")}.pdf`;
}

// ── flow ────────────────────────────────────────────────────────────────────
/** Where a returning student should land in the setup flow. */
export function resumeStep(input: {
  status: "draft" | "diagnosing" | "active";
  conceptCount: number;
  hasPyq: boolean;
  notesCount: number;
}): SetupStep {
  if (input.conceptCount === 0 || input.status === "draft") return 1;
  if (input.notesCount > 0) return 4;
  if (input.hasPyq) return 3;
  return 2;
}

/** Whole days from one yyyy-mm-dd to another (calendar days, timezone-free). */
export function daysBetweenIso(fromIso: string, toIso: string): number | null {
  const parse = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const a = parse(fromIso);
  const b = parse(toIso);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}
