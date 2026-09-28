// Shared server-side glue between Postgres and the pure engine.
// Every feature lane uses these instead of re-querying mastery/edges/mistakes itself.
import { db } from "@/lib/db";
import type { Goal } from "@/lib/generated/prisma/client";
import {
  bandOf,
  buildSchedule,
  confidenceOf,
  decayedMastery,
  displayMastery,
  initialMastery,
  isoDay,
  recommendNext,
  unitMastery,
  applyUnitPrior,
  updateMastery,
  type EngineConcept,
  type Evidence,
  type MasteryState,
  type Recommendation,
  type Schedule,
} from "@/lib/engine";
import type {
  ConceptGraphData,
  GoalSummary,
  MasteryTrendPoint,
  WeakTopic,
} from "@/lib/types";

/** Recent-mistake window for the MistakeRate component. */
const MISTAKE_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export function daysUntil(examDate: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

export function toGoalSummary(goal: Goal, now: Date = new Date()): GoalSummary {
  return {
    id: goal.id,
    subject: goal.subject,
    examDate: goal.examDate.toISOString(),
    minutesPerDay: goal.minutesPerDay,
    status: goal.status,
    isDemo: goal.isDemo,
    daysLeft: daysUntil(goal.examDate, now),
    skippedToday: goal.skipDates.includes(isoDay(now)),
  };
}

function toMasteryState(m: { theta: number; evidenceCount: number; lastPracticedAt: Date | null } | null): MasteryState {
  return m ? { theta: m.theta, evidenceCount: m.evidenceCount, lastPracticedAt: m.lastPracticedAt } : initialMastery();
}

/** DB → EngineConcept[] for one goal (mastery, prerequisite ids, recent + recurring mistakes). */
export async function loadEngineConcepts(goalId: string, now: Date = new Date()): Promise<EngineConcept[]> {
  const since = new Date(now.getTime() - MISTAKE_WINDOW_DAYS * DAY_MS);
  const [concepts, edges, mistakes] = await Promise.all([
    db.concept.findMany({ where: { goalId }, include: { mastery: true }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    db.conceptEdge.findMany({ where: { goalId } }),
    db.mistake.findMany({
      where: { goalId, createdAt: { gte: since } },
      select: { conceptId: true, misconception: true, resolved: true },
    }),
  ]);

  const prereqs = new Map<string, string[]>();
  for (const e of edges) {
    const list = prereqs.get(e.toConceptId) ?? [];
    list.push(e.fromConceptId);
    prereqs.set(e.toConceptId, list);
  }

  const recent = new Map<string, number>();
  const labels = new Map<string, Map<string, number>>();
  for (const m of mistakes) {
    if (m.resolved) continue;
    recent.set(m.conceptId, (recent.get(m.conceptId) ?? 0) + 1);
    if (m.misconception) {
      const key = m.misconception.trim().toLowerCase();
      const per = labels.get(m.conceptId) ?? new Map<string, number>();
      per.set(key, (per.get(key) ?? 0) + 1);
      labels.set(m.conceptId, per);
    }
  }

  return concepts.map((c) => ({
    id: c.id,
    name: c.name,
    unit: c.unit,
    weightage: c.weightage,
    weightageSource: c.weightageSource,
    estMinutes: c.estMinutes,
    mastery: toMasteryState(c.mastery),
    prereqIds: prereqs.get(c.id) ?? [],
    recentMistakes: recent.get(c.id) ?? 0,
    recurringMisconceptions: [...(labels.get(c.id)?.values() ?? [])].filter((n) => n >= 2).length,
  }));
}

/** "Study Now" for a goal. */
export async function getRecommendation(goal: Goal, now: Date = new Date()): Promise<Recommendation | null> {
  const concepts = await loadEngineConcepts(goal.id, now);
  return recommendNext({
    concepts,
    minutesPerDay: goal.minutesPerDay,
    examDate: goal.examDate,
    now,
    skipDates: goal.skipDates,
  });
}

/** Today's plan + upcoming days for a goal. */
export async function getSchedule(goal: Goal, now: Date = new Date()): Promise<Schedule> {
  const concepts = await loadEngineConcepts(goal.id, now);
  return buildSchedule({
    concepts,
    minutesPerDay: goal.minutesPerDay,
    examDate: goal.examDate,
    now,
    skipDates: goal.skipDates,
  });
}

/** Concept graph with mastery bands, for React Flow. */
export async function getGraphData(goalId: string, now: Date = new Date()): Promise<ConceptGraphData> {
  const [concepts, edges] = await Promise.all([
    db.concept.findMany({ where: { goalId }, include: { mastery: true }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    db.conceptEdge.findMany({ where: { goalId } }),
  ]);

  const nodes = concepts.map((c) => {
    const state = toMasteryState(c.mastery);
    const mastery = state.evidenceCount > 0 ? decayedMastery(state, now) : displayMastery(state.theta);
    return {
      id: c.id,
      name: c.name,
      unit: c.unit,
      description: c.description,
      mastery,
      band: bandOf(mastery, state.evidenceCount),
      confidence: confidenceOf(state.evidenceCount),
      evidenceCount: state.evidenceCount,
      weightage: c.weightage,
      weightageSource: c.weightageSource,
      pyqMarks: c.pyqMarks,
      estMinutes: c.estMinutes,
    };
  });

  const unitNames = [...new Set(concepts.map((c) => c.unit))];
  const units = unitNames.map((name) => {
    const children = nodes.filter((n) => n.unit === name);
    return {
      name,
      mastery: unitMastery(children.map((n) => ({ mastery: n.mastery, weightage: n.weightage }))),
      weightage: children.reduce((s, n) => s + n.weightage, 0),
      conceptCount: children.length,
    };
  });

  return {
    nodes,
    edges: edges.map((e) => ({ id: e.id, from: e.fromConceptId, to: e.toConceptId })),
    units,
  };
}

/** Weakest N concepts that have at least some evidence (falls back to unknowns). */
export function weakestTopics(
  graph: ConceptGraphData,
  mistakesByConcept: Map<string, number>,
  n = 3,
): WeakTopic[] {
  const withEvidence = graph.nodes.filter((x) => x.evidenceCount > 0);
  const pool = withEvidence.length >= n ? withEvidence : graph.nodes;
  return [...pool]
    .sort((a, b) => a.mastery - b.mastery || b.weightage - a.weightage)
    .slice(0, n)
    .map((x) => ({
      conceptId: x.id,
      name: x.name,
      unit: x.unit,
      mastery: x.mastery,
      confidence: x.confidence,
      weightage: x.weightage,
      recentMistakes: mistakesByConcept.get(x.id) ?? 0,
    }));
}

type EventSource = "diagnostic" | "quiz" | "socratic" | "check" | "decay";

/**
 * Apply one piece of evidence to a concept: update Mastery, log a MasteryEvent.
 * Returns display mastery before/after.
 */
export async function recordEvidence(input: {
  goalId: string;
  conceptId: string;
  evidence: Evidence;
  source: EventSource;
  isDemo?: boolean;
}): Promise<{ before: number; after: number }> {
  const current = await db.mastery.findUnique({ where: { conceptId: input.conceptId } });
  const before = toMasteryState(current);
  const after = updateMastery(before, input.evidence);
  await db.$transaction([
    db.mastery.upsert({
      where: { conceptId: input.conceptId },
      update: { theta: after.theta, evidenceCount: after.evidenceCount, lastPracticedAt: after.lastPracticedAt },
      create: {
        conceptId: input.conceptId,
        theta: after.theta,
        evidenceCount: after.evidenceCount,
        lastPracticedAt: after.lastPracticedAt,
      },
    }),
    db.masteryEvent.create({
      data: {
        goalId: input.goalId,
        conceptId: input.conceptId,
        thetaBefore: before.theta,
        thetaAfter: after.theta,
        source: input.source,
        isDemo: input.isDemo ?? false,
        createdAt: input.evidence.at,
      },
    }),
  ]);
  return { before: displayMastery(before.theta), after: displayMastery(after.theta) };
}

/** Unit-level diagnostic answer → low-confidence prior on every concept in the unit. */
export async function recordUnitPrior(input: {
  goalId: string;
  unit: string;
  evidence: Omit<Evidence, "kind">;
}): Promise<void> {
  const concepts = await db.concept.findMany({
    where: { goalId: input.goalId, unit: input.unit },
    include: { mastery: true },
  });
  if (concepts.length === 0) return;
  const states = concepts.map((c) => toMasteryState(c.mastery));
  const next = applyUnitPrior(states, input.evidence);
  await db.$transaction(
    concepts.flatMap((c, i) => [
      db.mastery.upsert({
        where: { conceptId: c.id },
        update: { theta: next[i].theta, evidenceCount: next[i].evidenceCount },
        create: { conceptId: c.id, theta: next[i].theta, evidenceCount: next[i].evidenceCount },
      }),
      db.masteryEvent.create({
        data: {
          goalId: input.goalId,
          conceptId: c.id,
          thetaBefore: states[i].theta,
          thetaAfter: next[i].theta,
          source: "diagnostic",
          createdAt: input.evidence.at,
        },
      }),
    ]),
  );
}

/** Store a wrong/partial answer in the mistake log. */
export async function recordMistake(input: {
  goalId: string;
  conceptId: string;
  source: "diagnostic" | "quiz" | "socratic" | "check";
  prompt: string;
  response: string;
  misconception: string | null;
}): Promise<void> {
  await db.mistake.create({
    data: {
      goalId: input.goalId,
      conceptId: input.conceptId,
      source: input.source,
      prompt: input.prompt.slice(0, 2000),
      response: input.response.slice(0, 2000),
      misconception: input.misconception?.slice(0, 200) ?? null,
    },
  });
}

/**
 * Daily mastery trend (weightage-weighted average display mastery), replaying
 * MasteryEvents from the concepts' initial state. Up to `days` most recent days.
 */
export async function getMasteryTrend(goalId: string, days = 14, now: Date = new Date()): Promise<MasteryTrendPoint[]> {
  const [concepts, events] = await Promise.all([
    db.concept.findMany({ where: { goalId }, select: { id: true, weightage: true } }),
    db.masteryEvent.findMany({ where: { goalId }, orderBy: { createdAt: "asc" } }),
  ]);
  if (concepts.length === 0 || events.length === 0) return [];

  const weight = new Map(concepts.map((c) => [c.id, c.weightage]));
  const totalW = concepts.reduce((s, c) => s + c.weightage, 0);
  const theta = new Map<string, number>(concepts.map((c) => [c.id, 0]));
  const demoDays = new Set<string>();
  const byDay = new Map<string, number>();

  const avg = () => {
    let s = 0;
    for (const c of concepts) {
      const w = totalW > 0 ? (weight.get(c.id) ?? 0) : 1;
      s += w * displayMastery(theta.get(c.id) ?? 0);
    }
    return s / (totalW > 0 ? totalW : concepts.length);
  };

  for (const e of events) {
    theta.set(e.conceptId, e.thetaAfter);
    const day = isoDay(e.createdAt);
    if (e.isDemo) demoDays.add(day);
    byDay.set(day, avg());
  }

  const start = new Date(now.getTime() - (days - 1) * DAY_MS);
  return [...byDay.entries()]
    .filter(([d]) => d >= isoDay(start))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, mastery]) => ({ date, mastery, isDemo: demoDays.has(date) }));
}
