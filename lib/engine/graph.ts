// Prerequisite-graph lookups shared by ranking, reasons and the planner. Cycle-safe:
// extracted graphs can contain cycles, and nothing here may loop forever on them.
import type { EngineConcept } from "./types";
import { compareNames } from "./util";

export interface GraphIndex {
  byId: Map<string, EngineConcept>;
  /** Direct prerequisites that exist in the graph (deduped, no self-loops). */
  prereqs: Map<string, string[]>;
  /** Direct dependents: prerequisite id → ids of concepts it unlocks. */
  dependents: Map<string, string[]>;
  /** Number of transitive dependents (everything downstream) per concept. */
  unlockCount: Map<string, number>;
  maxUnlock: number;
  maxWeightage: number;
}

export function buildGraphIndex(concepts: EngineConcept[]): GraphIndex {
  const byId = new Map<string, EngineConcept>();
  for (const c of concepts) if (!byId.has(c.id)) byId.set(c.id, c);

  const prereqs = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const c of byId.values()) {
    const direct = [...new Set(c.prereqIds)].filter((p) => p !== c.id && byId.has(p));
    prereqs.set(c.id, direct);
    for (const p of direct) {
      const list = dependents.get(p) ?? [];
      list.push(c.id);
      dependents.set(p, list);
    }
  }

  const unlockCount = new Map<string, number>();
  let maxUnlock = 0;
  for (const id of byId.keys()) {
    const n = collectDownstream(id, dependents).size;
    unlockCount.set(id, n);
    maxUnlock = Math.max(maxUnlock, n);
  }

  let maxWeightage = 0;
  for (const c of byId.values()) maxWeightage = Math.max(maxWeightage, c.weightage);

  return { byId, prereqs, dependents, unlockCount, maxUnlock, maxWeightage };
}

/** Every concept reachable downstream of `id` (excluding `id` itself). */
function collectDownstream(id: string, dependents: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(dependents.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    if (next === id || seen.has(next)) continue;
    seen.add(next);
    stack.push(...(dependents.get(next) ?? []));
  }
  return seen;
}

/** Direct dependents of `id`, heaviest weightage first (ties by name) — the one worth naming. */
export function directDependentsByWeight(g: GraphIndex, id: string): EngineConcept[] {
  return (g.dependents.get(id) ?? [])
    .map((d) => g.byId.get(d))
    .filter((c): c is EngineConcept => c !== undefined)
    .sort((a, b) => b.weightage - a.weightage || compareNames(a.name, b.name) || compareNames(a.id, b.id));
}
