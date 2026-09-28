// Priority scoring (idea.md §5.2): components, ranking, prerequisite gating, reason strings
// and the deadline mode. PURE and deterministic. Re-exported publicly from ./priority.
import {
  HIGH_WEIGHTAGE_FROM,
  MASTERED_AT,
  MIN_LEARN_BLOCK,
  MISTAKES_SATURATE_AT,
  PREREQ_GATE,
  PRIORITY_WEIGHTS,
  RECURRING_MISCONCEPTION_BONUS,
  REVISION_DAYS,
} from "./constants";
import { buildGraphIndex, directDependentsByWeight, type GraphIndex } from "./graph";
import { confidenceOf, daysFromDecay, decayAmount, decayedMastery } from "./mastery";
import type { ComponentKey, EngineConcept, RankedConcept, ScoreComponents, StudyMode } from "./types";
import { capitalise, clamp, compareNames, pct, plural, round5, weightageShare } from "./util";

/** Fixed order used to break exact contribution ties in reasons. */
const COMPONENT_ORDER: ComponentKey[] = ["weightage", "gap", "unlock", "mistakeRate", "decay"];

/**
 * Minutes a concept still needs to reach MASTERED_AT, scaled by the gap:
 * 0 when mastered, else max(MIN_LEARN_BLOCK, round5(estMinutes · (MASTERED_AT − m) / MASTERED_AT)).
 */
export function minutesNeeded(estMinutes: number, mastery: number): number {
  if (mastery >= MASTERED_AT) return 0;
  const raw = (Math.max(0, estMinutes) * (MASTERED_AT - mastery)) / MASTERED_AT;
  return Math.max(MIN_LEARN_BLOCK, round5(raw));
}

/** min(1, (recent mistakes + BONUS·recurring misconceptions) / MISTAKES_SATURATE_AT). */
export function mistakeRateOf(c: Pick<EngineConcept, "recentMistakes" | "recurringMisconceptions">): number {
  const raw =
    Math.max(0, c.recentMistakes) + RECURRING_MISCONCEPTION_BONUS * Math.max(0, c.recurringMisconceptions);
  return Math.min(1, raw / MISTAKES_SATURATE_AT);
}

function componentsWith(c: EngineConcept, g: GraphIndex, now: Date, mastery: number): ScoreComponents {
  return {
    weightage: g.maxWeightage > 0 ? clamp(c.weightage / g.maxWeightage, 0, 1) : 0,
    gap: clamp(1 - mastery, 0, 1),
    unlock: g.maxUnlock > 0 ? (g.unlockCount.get(c.id) ?? 0) / g.maxUnlock : 0,
    mistakeRate: mistakeRateOf(c),
    decay: decayAmount(c.mastery, now),
  };
}

function weighted(components: ScoreComponents): ScoreComponents {
  return {
    weightage: PRIORITY_WEIGHTS.weightage * components.weightage,
    gap: PRIORITY_WEIGHTS.gap * components.gap,
    unlock: PRIORITY_WEIGHTS.unlock * components.unlock,
    mistakeRate: PRIORITY_WEIGHTS.mistakeRate * components.mistakeRate,
    decay: PRIORITY_WEIGHTS.decay * components.decay,
  };
}

/** All 0..1 normalised components for one concept, given the whole graph. */
export function scoreComponents(c: EngineConcept, all: EngineConcept[], now: Date): ScoreComponents {
  const g = buildGraphIndex(all.some((x) => x.id === c.id) ? all : [...all, c]);
  return componentsWith(c, g, now, decayedMastery(c.mastery, now));
}

/** The weakest direct prerequisite below PREREQ_GATE (ties by name), or null. */
function weakestGate(
  c: EngineConcept,
  g: GraphIndex,
  mastery: Map<string, number>,
): RankedConcept["blockedBy"] {
  let best: RankedConcept["blockedBy"] = null;
  for (const p of g.prereqs.get(c.id) ?? []) {
    const m = mastery.get(p) ?? 0.5;
    if (m >= PREREQ_GATE) continue;
    const name = g.byId.get(p)?.name ?? p;
    if (!best || m < best.mastery || (m === best.mastery && compareNames(name, best.name) < 0)) {
      best = { conceptId: p, name, mastery: m };
    }
  }
  return best;
}

/** Mastered concepts (nothing left to learn) last, then priority desc, then name, then id. */
function compareRanked(a: RankedConcept, b: RankedConcept): number {
  const aDone = a.minutesNeeded === 0 ? 1 : 0;
  const bDone = b.minutesNeeded === 0 ? 1 : 0;
  return aDone - bDone || b.priority - a.priority || compareNames(a.name, b.name) || compareNames(a.conceptId, b.conceptId);
}

/** rankConcepts on a prebuilt index (the planner reuses the index for reasons). */
export function rankWithIndex(g: GraphIndex, now: Date): RankedConcept[] {
  const mastery = new Map<string, number>();
  for (const c of g.byId.values()) mastery.set(c.id, decayedMastery(c.mastery, now));

  const rows: RankedConcept[] = [...g.byId.values()].map((c) => {
    const m = mastery.get(c.id) ?? 0.5;
    const components = componentsWith(c, g, now, m);
    const contributions = weighted(components);
    const value = COMPONENT_ORDER.reduce((s, k) => s + contributions[k], 0);
    const need = minutesNeeded(c.estMinutes, m);
    // priority = value / sqrt(estMinutes remaining), normalised so a MIN_LEARN_BLOCK task
    // divides by 1: a cheap high-value concept beats an expensive one of equal value.
    const priority = value / Math.sqrt(Math.max(need, MIN_LEARN_BLOCK) / MIN_LEARN_BLOCK);
    return {
      conceptId: c.id,
      name: c.name,
      unit: c.unit,
      value,
      priority,
      components,
      contributions,
      mastery: m,
      confidence: confidenceOf(c.mastery.evidenceCount),
      minutesNeeded: need,
      blockedBy: weakestGate(c, g, mastery),
    };
  });
  return rows.sort(compareRanked);
}

/** Every concept ranked by priority (desc), with prerequisite gating info. Stable tie-break by name. */
export function rankConcepts(concepts: EngineConcept[], now: Date): RankedConcept[] {
  return rankWithIndex(buildGraphIndex(concepts), now);
}

/**
 * Follow blockedBy links from `start`: [its blocker, the blocker's blocker, …].
 * Stops at an ungated concept or when a cycle would repeat a concept.
 */
export function gateChain(start: RankedConcept, rankedById: Map<string, RankedConcept>): RankedConcept[] {
  const chain: RankedConcept[] = [];
  const seen = new Set([start.conceptId]);
  let cur = start;
  while (cur.blockedBy) {
    const next = rankedById.get(cur.blockedBy.conceptId);
    if (!next || seen.has(next.conceptId)) break;
    chain.push(next);
    seen.add(next.conceptId);
    cur = next;
  }
  return chain;
}

/**
 * Reason for studying the end of a gate path instead of its start.
 * path = [gated concept, …, prerequisite to study], length ≥ 2.
 */
export function gateReason(path: RankedConcept[]): string {
  const original = path[0];
  const target = path[path.length - 1];
  const via = path[path.length - 2];
  const head = `Blocked by ${target.name} (${pct(target.mastery)} mastery) — it's a prerequisite for ${via.name}`;
  return via.conceptId === original.conceptId ? `${head}.` : `${head}, which ${original.name} needs.`;
}

function componentPhrase(key: ComponentKey, r: RankedConcept, g: GraphIndex): string {
  const c = g.byId.get(r.conceptId);
  switch (key) {
    case "weightage": {
      const lead = r.components.weightage >= HIGH_WEIGHTAGE_FROM ? "high exam weightage" : "exam weightage";
      return c ? `${lead} (${weightageShare(c.weightage, c.weightageSource)})` : lead;
    }
    case "gap": {
      if (r.confidence === "none") return "no evidence yet — worth diagnosing";
      const low = r.confidence === "low" ? " (low confidence)" : "";
      return `you're at ${pct(r.mastery)} mastery${low}`;
    }
    case "unlock": {
      const named = directDependentsByWeight(g, r.conceptId)[0];
      const total = g.unlockCount.get(r.conceptId) ?? 0;
      if (!named) return "it unlocks later topics";
      return total > 1 ? `it unlocks ${named.name} and ${total - 1} more` : `it unlocks ${named.name}`;
    }
    case "mistakeRate": {
      const recurring = c?.recurringMisconceptions ?? 0;
      if (recurring > 1) return `${recurring} recurring misconceptions keep showing up`;
      if (recurring === 1) return "a recurring misconception keeps showing up";
      return `${plural(Math.max(1, c?.recentMistakes ?? 1), "recent mistake")} here`;
    }
    case "decay": {
      const days = daysFromDecay(r.components.decay, c?.mastery.evidenceCount ?? 0);
      if (!Number.isFinite(days)) return "not practised for a long time — it's fading";
      return `not practised for ${plural(Math.max(1, Math.floor(days + 1e-6)), "day")} — it's fading`;
    }
  }
}

/** Reason from the top two non-zero contributions; optionally mentions the prerequisite gate. */
export function reasonFor(r: RankedConcept, g: GraphIndex, opts: { includeGate: boolean }): string {
  const top = COMPONENT_ORDER.map((key, i) => ({ key, v: r.contributions[key], i }))
    .filter((x) => x.v > 1e-9)
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .slice(0, 2)
    .map((x) => componentPhrase(x.key, r, g));
  let reason = top.length > 0 ? `${capitalise(top.join(" and "))}.` : "Next on your list.";
  if (opts.includeGate && r.blockedBy) {
    reason += ` Blocked by ${r.blockedBy.name} (${pct(r.blockedBy.mastery)} mastery) — study that first.`;
  }
  return reason;
}

/** Reason string templated from the top two contributions (+ gating). No LLM. */
export function buildReason(ranked: RankedConcept, all: EngineConcept[]): string {
  return reasonFor(ranked, buildGraphIndex(all), { includeGate: true });
}

/**
 * Mode from the deadline: ≤ REVISION_DAYS left → "revision"; total minutes needed > minutes
 * available before the exam → "triage"; else "learn".
 */
export function determineMode(input: {
  daysLeft: number;
  totalNeededMin: number;
  totalAvailableMin: number;
}): { mode: StudyMode; reason: string } {
  const days = Math.max(0, Math.floor(input.daysLeft));
  if (days <= REVISION_DAYS) {
    const when = days === 0 ? "Exam day" : `${plural(days, "day")} left`;
    return { mode: "revision", reason: `${when} — revision mode: weakest high-weightage topics first.` };
  }
  const needed = Math.round(input.totalNeededMin);
  const available = Math.round(input.totalAvailableMin);
  if (needed > available) {
    return {
      mode: "triage",
      reason: `Not enough time: ${needed} min needed, ${available} min available — dropping low-weightage topics.`,
    };
  }
  return { mode: "learn", reason: `${plural(days, "day")} left — learning new concepts.` };
}
