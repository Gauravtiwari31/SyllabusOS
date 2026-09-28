// Everything recommendNext and buildSchedule must agree on, computed once: ranking,
// gate chains, study days, available minutes, the deadline mode and triage drops.
import { addDays, daysLeftUntil, isoDay } from "./calendar";
import { PRACTICE_BLOCK_MIN, RESERVE_FROM_MINUTES_PER_DAY, REVISION_BLOCK_MIN } from "./constants";
import { buildGraphIndex, type GraphIndex } from "./graph";
import { determineMode, gateChain, rankWithIndex } from "./ranking";
import type { DroppedConcept, PlanInput, RankedConcept, StudyMode } from "./types";
import { compareNames, weightageShare, wholeMinutes } from "./util";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface PlanContext {
  now: Date;
  graph: GraphIndex;
  ranked: RankedConcept[];
  rankedById: Map<string, RankedConcept>;
  /** Per concept: the prerequisites it waits for, nearest first (see gateChain). */
  chains: Map<string, RankedConcept[]>;
  minutesPerDay: number;
  daysLeft: number;
  skipped: Set<string>;
  /** Minutes per day held back for the practice + revision blocks. */
  reservedPerDay: number;
  learnMinutesPerDay: number;
  totalNeededMin: number;
  totalAvailableMin: number;
  mode: StudyMode;
  modeReason: string;
  dropped: DroppedConcept[];
  droppedIds: Set<string>;
}

export function buildPlanContext(input: PlanInput): PlanContext {
  const now = input.now;
  const graph = buildGraphIndex(input.concepts);
  const ranked = rankWithIndex(graph, now);
  const rankedById = new Map(ranked.map((r) => [r.conceptId, r] as const));
  const chains = new Map(ranked.map((r) => [r.conceptId, gateChain(r, rankedById)] as const));

  const minutesPerDay = wholeMinutes(input.minutesPerDay);
  const daysLeft = daysLeftUntil(input.examDate, now);
  const skipped = new Set(input.skipDates);

  // Study days are today … the day before the exam; yyyy-mm-dd strings compare as dates.
  const firstDay = isoDay(now);
  const examDay = isoDay(addDays(now, daysLeft));
  let skippedStudyDays = 0;
  for (const d of skipped) if (ISO_DAY.test(d) && d >= firstDay && d < examDay) skippedStudyDays++;
  const activeStudyDays = Math.max(0, daysLeft - skippedStudyDays);

  const reservedPerDay =
    minutesPerDay >= RESERVE_FROM_MINUTES_PER_DAY ? PRACTICE_BLOCK_MIN + REVISION_BLOCK_MIN : 0;
  const learnMinutesPerDay = minutesPerDay - reservedPerDay;
  const totalAvailableMin = learnMinutesPerDay * activeStudyDays;
  const totalNeededMin = ranked.reduce((s, r) => s + r.minutesNeeded, 0);

  const { mode, reason } = determineMode({ daysLeft, totalNeededMin, totalAvailableMin });
  const dropped =
    mode === "triage" ? triage(ranked, graph, chains, totalNeededMin, totalAvailableMin) : [];

  return {
    now,
    graph,
    ranked,
    rankedById,
    chains,
    minutesPerDay,
    daysLeft,
    skipped,
    reservedPerDay,
    learnMinutesPerDay,
    totalNeededMin,
    totalAvailableMin,
    mode,
    modeReason: reason,
    dropped,
    droppedIds: new Set(dropped.map((d) => d.conceptId)),
  };
}

/**
 * Drop concepts in ascending weightage (ties: lower priority first) until the remaining need
 * fits the available minutes. A prerequisite that gates a kept concept is never dropped —
 * the kept concept couldn't be learned without it.
 */
function triage(
  ranked: RankedConcept[],
  graph: GraphIndex,
  chains: Map<string, RankedConcept[]>,
  totalNeededMin: number,
  totalAvailableMin: number,
): DroppedConcept[] {
  const weightOf = (id: string) => graph.byId.get(id)?.weightage ?? 0;
  const open = ranked.filter((r) => r.minutesNeeded > 0);
  const kept = new Set(open.map((r) => r.conceptId));

  const gatedBy = new Map<string, string[]>(); // prerequisite id → concepts waiting on it
  for (const [id, chain] of chains) {
    for (const p of chain) gatedBy.set(p.conceptId, [...(gatedBy.get(p.conceptId) ?? []), id]);
  }

  const order = [...open].sort(
    (a, b) =>
      weightOf(a.conceptId) - weightOf(b.conceptId) ||
      a.priority - b.priority ||
      compareNames(a.name, b.name) ||
      compareNames(a.conceptId, b.conceptId),
  );

  const dropped: DroppedConcept[] = [];
  let need = totalNeededMin;
  while (need > totalAvailableMin) {
    // Re-scan from the lightest each time: dropping a concept can release its prerequisites.
    const next = order.find(
      (r) => kept.has(r.conceptId) && !(gatedBy.get(r.conceptId) ?? []).some((id) => kept.has(id)),
    );
    if (!next) break;
    kept.delete(next.conceptId);
    need -= next.minutesNeeded;
    const c = graph.byId.get(next.conceptId);
    const share = c ? weightageShare(c.weightage, c.weightageSource) : "low share of marks";
    dropped.push({
      conceptId: next.conceptId,
      name: next.name,
      weightage: c?.weightage ?? 0,
      reason: `Low weightage (${share}) — not enough time before the exam.`,
    });
  }
  return dropped;
}
