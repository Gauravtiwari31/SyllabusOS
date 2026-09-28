// Adaptive diagnostic question selection (idea.md P0 #4). PURE + deterministic:
// no DB, no randomness, no clock. The service layer (lib/services/diagnostic.ts)
// rebuilds the state from Attempts on every request, so the same answers always
// lead to the same next question (resumable, reload-safe).
//
// Candidate score = 0.6 · normWeightage + 0.4 · normTransitiveDependents
//   → high-weightage concepts and prerequisite ROOTS (many downstream concepts) first.
// Adaptive step after the latest answer on concept c:
//   wrong   (0)   → probe DOWN: nearest un-asked prerequisite of c that has pool questions
//   correct (1)   → probe UP:   nearest un-asked, high-value dependent of c
//   partial (0.5) → neither — the student roughly knows c; spend the question on coverage
//   otherwise     → best candidate from a unit not covered yet, else best overall.
// Hard rules: never two questions on the same concept; stop at `maxQuestions` (10)
// or when no concept with pool questions is left.
import type { Outcome } from "@/lib/engine/types";

export const DIAGNOSTIC_MAX_QUESTIONS = 10;
/** How many concepts we try to have questions for (a few spare for adaptivity). */
export const DIAGNOSTIC_POOL_TARGET = 14;
export const SELECT_WEIGHTS = { weightage: 0.6, dependents: 0.4 } as const;

export interface SelectorConcept {
  id: string;
  unit: string;
  /** share of exam marks 0..1 */
  weightage: number;
  /** direct prerequisites */
  prereqIds: string[];
  /** direct dependents (concepts this one unlocks) */
  dependentIds: string[];
}

export interface AskedEntry {
  conceptId: string;
  outcome: Outcome;
}

export interface SelectorState {
  /** in syllabus order — the order is the final deterministic tie-break */
  concepts: SelectorConcept[];
  /** answered diagnostic questions, oldest first */
  asked: AskedEntry[];
  /** conceptId → number of usable diagnostic questions in the pool */
  poolByConcept: Record<string, number>;
  maxQuestions?: number;
}

export type PickReason = "start" | "probe_down" | "probe_up" | "coverage" | "best";

export interface Pick {
  conceptId: string;
  reason: PickReason;
  /** concept the probe started from (probe_down / probe_up), else null */
  fromId: string | null;
  score: number;
}

/** Build selector concepts from plain concepts + prerequisite edges (from → to). Ignores dangling/self edges. */
export function buildSelectorConcepts(
  concepts: Array<{ id: string; unit: string; weightage: number }>,
  edges: Array<{ from: string; to: string }>,
): SelectorConcept[] {
  const ids = new Set(concepts.map((c) => c.id));
  const prereqs = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to)) continue;
    const key = `${e.from}>${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    prereqs.set(e.to, [...(prereqs.get(e.to) ?? []), e.from]);
    dependents.set(e.from, [...(dependents.get(e.from) ?? []), e.to]);
  }
  return concepts.map((c) => ({
    id: c.id,
    unit: c.unit,
    weightage: Number.isFinite(c.weightage) ? Math.max(0, c.weightage) : 0,
    prereqIds: prereqs.get(c.id) ?? [],
    dependentIds: dependents.get(c.id) ?? [],
  }));
}

/** Number of concepts reachable downstream (transitively unlocked). Cycle-safe. */
export function transitiveDependentCounts(concepts: SelectorConcept[]): Map<string, number> {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const out = new Map<string, number>();
  for (const c of concepts) {
    const visited = new Set<string>([c.id]);
    const stack = [...c.dependentIds];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const next of byId.get(id)?.dependentIds ?? []) stack.push(next);
    }
    out.set(c.id, visited.size - 1);
  }
  return out;
}

/** 0.6 · normWeightage + 0.4 · normTransitiveDependents, each normalised by the goal's max. */
export function candidateScores(concepts: SelectorConcept[]): Map<string, number> {
  const deps = transitiveDependentCounts(concepts);
  const maxW = Math.max(0, ...concepts.map((c) => c.weightage));
  const maxD = Math.max(0, ...deps.values());
  const scores = new Map<string, number>();
  for (const c of concepts) {
    const w = maxW > 0 ? c.weightage / maxW : 0;
    const d = maxD > 0 ? (deps.get(c.id) ?? 0) / maxD : 0;
    scores.set(c.id, SELECT_WEIGHTS.weightage * w + SELECT_WEIGHTS.dependents * d);
  }
  return scores;
}

/** All concepts, best diagnostic candidates first (score desc, then syllabus order). */
export function rankCandidates(concepts: SelectorConcept[]): SelectorConcept[] {
  const scores = candidateScores(concepts);
  const index = new Map(concepts.map((c, i) => [c.id, i]));
  return [...concepts].sort(
    (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || index.get(a.id)! - index.get(b.id)!,
  );
}

/** Planned number of questions: min(max, concepts that have (or had) pool questions). */
export function plannedTotal(state: SelectorState): number {
  const max = state.maxQuestions ?? DIAGNOSTIC_MAX_QUESTIONS;
  const ids = new Set(state.asked.map((a) => a.conceptId));
  for (const c of state.concepts) if ((state.poolByConcept[c.id] ?? 0) > 0) ids.add(c.id);
  return Math.min(max, ids.size);
}

/** The next concept to ask about, or null when the diagnostic is complete. */
export function pickNext(state: SelectorState): Pick | null {
  const max = state.maxQuestions ?? DIAGNOSTIC_MAX_QUESTIONS;
  const askedIds = new Set(state.asked.map((a) => a.conceptId));
  if (askedIds.size >= max || state.asked.length >= max) return null;

  const byId = new Map(state.concepts.map((c) => [c.id, c]));
  const index = new Map(state.concepts.map((c, i) => [c.id, i]));
  const scores = candidateScores(state.concepts);
  const score = (id: string) => scores.get(id) ?? 0;
  const askable = (id: string) => !askedIds.has(id) && (state.poolByConcept[id] ?? 0) > 0 && byId.has(id);

  const available = state.concepts.filter((c) => askable(c.id));
  if (available.length === 0) return null;

  const best = (list: SelectorConcept[]) =>
    [...list].sort((a, b) => score(b.id) - score(a.id) || index.get(a.id)! - index.get(b.id)!)[0];

  const last = state.asked[state.asked.length - 1];
  if (!last) {
    const top = best(available);
    return { conceptId: top.id, reason: "start", fromId: null, score: score(top.id) };
  }

  // Probes may not pile more than `unitCap` questions into one unit, so a run of wrong
  // answers can't spend the whole diagnostic inside a single prerequisite chain.
  const unitsWithPool = new Set(
    state.concepts.filter((c) => askedIds.has(c.id) || askable(c.id)).map((c) => c.unit),
  );
  const unitCap = Math.max(2, Math.ceil(max / Math.max(1, unitsWithPool.size)) + 1);
  const askedPerUnit = new Map<string, number>();
  for (const id of askedIds) {
    const unit = byId.get(id)?.unit;
    if (unit !== undefined) askedPerUnit.set(unit, (askedPerUnit.get(unit) ?? 0) + 1);
  }
  const underCap = (c: SelectorConcept) => (askedPerUnit.get(c.unit) ?? 0) < unitCap;

  const lastConcept = byId.get(last.conceptId);
  if (lastConcept && last.outcome !== 0.5) {
    const direction = last.outcome === 0 ? "down" : "up";
    const median = medianScore(available.map((c) => score(c.id)));
    const accept = (c: SelectorConcept) =>
      askable(c.id) && underCap(c) && (direction === "down" || score(c.id) >= median);
    const probe = nearestMatch(lastConcept, byId, direction, accept, best);
    if (probe) {
      return {
        conceptId: probe.id,
        reason: direction === "down" ? "probe_down" : "probe_up",
        fromId: lastConcept.id,
        score: score(probe.id),
      };
    }
  }

  const coveredUnits = new Set([...askedIds].map((id) => byId.get(id)?.unit));
  const fresh = available.filter((c) => !coveredUnits.has(c.unit));
  if (fresh.length > 0) {
    const top = best(fresh);
    return { conceptId: top.id, reason: "coverage", fromId: null, score: score(top.id) };
  }
  const top = best(available);
  return { conceptId: top.id, reason: "best", fromId: null, score: score(top.id) };
}

/**
 * Breadth-first walk up (prerequisites) or down (dependents) the graph from `start`;
 * returns the best accepted concept at the NEAREST level that has one.
 */
function nearestMatch(
  start: SelectorConcept,
  byId: Map<string, SelectorConcept>,
  direction: "down" | "up",
  accept: (c: SelectorConcept) => boolean,
  best: (list: SelectorConcept[]) => SelectorConcept,
): SelectorConcept | null {
  const neighbours = (c: SelectorConcept) => (direction === "down" ? c.prereqIds : c.dependentIds);
  const visited = new Set<string>([start.id]);
  let frontier = [start];
  while (frontier.length > 0) {
    const level: SelectorConcept[] = [];
    for (const c of frontier) {
      for (const id of neighbours(c)) {
        if (visited.has(id)) continue;
        visited.add(id);
        const n = byId.get(id);
        if (n) level.push(n);
      }
    }
    const matches = level.filter(accept);
    if (matches.length > 0) return best(matches);
    frontier = level;
  }
  return null;
}

function medianScore(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Short, human-readable reason shown under the question ("why this question?"). */
export function pickReasonText(
  pick: Pick,
  names: Map<string, { name: string; unit: string }>,
  dependentsCount: number,
): string {
  const from = pick.fromId ? names.get(pick.fromId)?.name : null;
  const self = names.get(pick.conceptId);
  switch (pick.reason) {
    case "start":
      return dependentsCount > 0
        ? `High-value start: unlocks ${dependentsCount} concept${dependentsCount === 1 ? "" : "s"}`
        : "High-value start: top exam weightage";
    case "probe_down":
      return from ? `Checking a prerequisite of ${from}` : "Checking a prerequisite";
    case "probe_up":
      return from ? `${from} looked solid, testing what it unlocks` : "Testing what this unlocks";
    case "coverage":
      return self ? `Covering a new unit: ${self.unit}` : "Covering a new unit";
    case "best":
      return "Next most valuable concept";
  }
}
