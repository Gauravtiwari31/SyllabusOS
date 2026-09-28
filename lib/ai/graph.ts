// Draft concept-graph helpers shared by the Gemini and heuristic syllabus paths.
// Pure functions (unit-tested): name → key resolution, weightage normalisation and
// cycle removal so the prerequisite graph is always a DAG.
import type { DraftConcept, DraftGraph } from "./schemas";
import { normalize, slugify, truncateWords } from "./offline/text";

export const MAX_DRAFT_CONCEPTS = 60; // DraftGraphSchema limit

/** Scale non-negative values so they sum to exactly 100 (2 dp). All-zero → equal split. */
export function normalizePercent(values: number[]): number[] {
  if (values.length === 0) return [];
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  const raw = total > 0 ? clean.map((v) => (v / total) * 100) : clean.map(() => 100 / clean.length);
  const rounded = raw.map((v) => Math.round(v * 100) / 100);
  const drift = Math.round((100 - rounded.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (drift !== 0) {
    let big = 0;
    for (let i = 1; i < rounded.length; i++) if (rounded[i] > rounded[big]) big = i;
    rounded[big] = Math.round((rounded[big] + drift) * 100) / 100;
  }
  return rounded;
}

/**
 * Keep prerequisite edges greedily in listing order, dropping unknown keys, self-loops,
 * duplicates and any edge that would close a cycle. Result is always a DAG.
 */
export function removeCycles(concepts: DraftConcept[]): DraftConcept[] {
  const keys = new Set(concepts.map((c) => c.key));
  // out-edges: prerequisite → dependents (accepted so far)
  const out = new Map<string, Set<string>>();
  const reaches = (from: string, to: string): boolean => {
    const stack = [from];
    const seen = new Set<string>();
    while (stack.length) {
      const k = stack.pop()!;
      if (k === to) return true;
      if (seen.has(k)) continue;
      seen.add(k);
      for (const n of out.get(k) ?? []) stack.push(n);
    }
    return false;
  };
  return concepts.map((c) => {
    const kept: string[] = [];
    for (const p of c.prereqKeys) {
      if (p === c.key || !keys.has(p) || kept.includes(p)) continue;
      // edge p → c closes a cycle iff c already reaches p
      if (reaches(c.key, p)) continue;
      kept.push(p);
      if (!out.has(p)) out.set(p, new Set());
      out.get(p)!.add(c.key);
    }
    return { ...c, prereqKeys: kept };
  });
}

/** True when the draft's prerequisite edges contain no cycle. */
export function isDag(concepts: DraftConcept[]): boolean {
  const indeg = new Map(concepts.map((c) => [c.key, 0]));
  const out = new Map<string, string[]>();
  for (const c of concepts) {
    for (const p of c.prereqKeys) {
      if (!indeg.has(p)) continue;
      indeg.set(c.key, (indeg.get(c.key) ?? 0) + 1);
      out.set(p, [...(out.get(p) ?? []), c.key]);
    }
  }
  const queue = [...indeg].filter(([, d]) => d === 0).map(([k]) => k);
  let seen = 0;
  while (queue.length) {
    const k = queue.shift()!;
    seen++;
    for (const n of out.get(k) ?? []) {
      const d = (indeg.get(n) ?? 0) - 1;
      indeg.set(n, d);
      if (d === 0) queue.push(n);
    }
  }
  return seen === concepts.length;
}

export interface LooseConcept {
  name: string;
  unit: string;
  description?: string | null;
  estMinutes?: number | null;
  weightage?: number | null;
  /** prerequisite concept NAMES (resolved case-insensitively) */
  prerequisites?: string[] | null;
}

const clampInt = (v: number | null | undefined, lo: number, hi: number, dflt: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v as number))) : dflt;

/**
 * Loose concept list (model output or heuristic) → validated-shape DraftGraph: trimmed and
 * de-duplicated names, slug-index keys, prerequisite names resolved case-insensitively,
 * weightage normalised to 100, estMinutes clamped to 10–120, cycles removed.
 */
export function buildDraftGraph(
  subject: string,
  source: DraftGraph["source"],
  loose: LooseConcept[],
): DraftGraph {
  const seen = new Set<string>();
  const kept: LooseConcept[] = [];
  for (const c of loose) {
    const name = truncateWords(c.name.replace(/\s+/g, " ").trim(), 80);
    const norm = normalize(name);
    if (norm.length < 2 || seen.has(norm)) continue;
    seen.add(norm);
    kept.push({ ...c, name, unit: truncateWords((c.unit || "").trim() || "Unit 1", 80) });
    if (kept.length >= MAX_DRAFT_CONCEPTS) break;
  }
  const keyOf = new Map<string, string>();
  const withKeys = kept.map((c, i) => {
    const key = `${slugify(c.name)}-${i}`;
    keyOf.set(normalize(c.name), key);
    return { c, key };
  });
  const weights = normalizePercent(kept.map((c) => c.weightage ?? 0));
  const concepts: DraftConcept[] = withKeys.map(({ c, key }, i) => ({
    key,
    name: c.name,
    description: truncateWords((c.description ?? "").trim(), 240),
    unit: c.unit,
    estMinutes: clampInt(c.estMinutes, 10, 120, 30),
    weightage: weights[i],
    prereqKeys: (c.prerequisites ?? [])
      .map((p) => keyOf.get(normalize(p)))
      .filter((k): k is string => Boolean(k) && k !== key),
  }));
  return { subject: subject.trim() || "Untitled subject", source, concepts: removeCycles(concepts) };
}
