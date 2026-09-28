// Greedy daily planner + revision + triage (idea.md §5.3, P1). PURE: no DB, no clock.
//
// Learn/triage days: greedy fill of the day's learn minutes from the priority list (gated
// prerequisites first), then a 15-min practice block and a 10-min revision block when the
// day has ≥ 45 min. Scheduled minutes are assumed done, so later days continue the queue.
// Revision mode (≤ 3 days left): every day is a revisionSequence, rotating through concepts.
import { addDays, isoDay } from "./calendar";
import {
  FADING_FROM,
  MAX_LEARN_BLOCK,
  MIN_LEARN_BLOCK,
  PLAN_HORIZON_DAYS,
  PRACTICE_BLOCK_MIN,
  REVISION_BLOCK_MIN,
} from "./constants";
import { buildPlanContext, type PlanContext } from "./context";
import { daysSincePractice, decayAmount } from "./mastery";
import { gateReason, mistakeRateOf, reasonFor } from "./ranking";
import { revisionSequence } from "./revision";
import type { DayPlan, EngineConcept, PlanBlock, PlanInput, Schedule } from "./types";
import { compareNames, floor5, plural } from "./util";

export { isoDay } from "./calendar";
export { revisionBlockMinutes, revisionSequence } from "./revision";

interface QueueItem {
  id: string;
  name: string;
  reason: string;
  /** Gate prerequisites that must be fully scheduled before this concept starts. */
  waitsFor: string[];
}

/** Ranked order with every blocked concept's prerequisites (deepest first) placed before it. */
function learnQueue(ctx: PlanContext): QueueItem[] {
  const queue: QueueItem[] = [];
  const queued = new Set<string>();
  const add = (id: string, reason: string) => {
    const r = ctx.rankedById.get(id);
    if (!r || queued.has(id) || r.minutesNeeded <= 0) return;
    queued.add(id);
    const waitsFor = (ctx.chains.get(id) ?? []).map((p) => p.conceptId);
    queue.push({ id, name: r.name, reason, waitsFor });
  };
  for (const r of ctx.ranked) {
    if (r.minutesNeeded <= 0 || ctx.droppedIds.has(r.conceptId)) continue;
    const chain = ctx.chains.get(r.conceptId) ?? [];
    for (let i = chain.length - 1; i >= 0; i--) {
      add(chain[i].conceptId, gateReason([r, ...chain.slice(0, i + 1)]));
    }
    add(r.conceptId, reasonFor(r, ctx.graph, { includeGate: false }));
  }
  return queue;
}

/** Practised concepts with mistakes, most mistake-prone first. */
function practiceCandidates(ctx: PlanContext): EngineConcept[] {
  return [...ctx.graph.byId.values()]
    .filter((c) => c.mastery.lastPracticedAt !== null && !ctx.droppedIds.has(c.id) && mistakeRateOf(c) > 0)
    .sort(
      (a, b) =>
        mistakeRateOf(b) - mistakeRateOf(a) ||
        b.weightage - a.weightage ||
        compareNames(a.name, b.name) ||
        compareNames(a.id, b.id),
    );
}

/** Practised concepts that are noticeably fading on `day`, most faded first. */
function revisionCandidates(ctx: PlanContext, day: Date): EngineConcept[] {
  return [...ctx.graph.byId.values()]
    .filter((c) => c.mastery.lastPracticedAt !== null && !ctx.droppedIds.has(c.id))
    .map((c) => ({ c, decay: decayAmount(c.mastery, day) }))
    .filter((x) => x.decay >= FADING_FROM)
    .sort(
      (a, b) =>
        b.decay - a.decay ||
        b.c.weightage - a.c.weightage ||
        compareNames(a.c.name, b.c.name) ||
        compareNames(a.c.id, b.c.id),
    )
    .map((x) => x.c);
}

function practiceReason(c: EngineConcept): string {
  const bits: string[] = [];
  if (c.recentMistakes > 0) bits.push(plural(c.recentMistakes, "recent mistake"));
  if (c.recurringMisconceptions === 1) bits.push("a recurring misconception");
  if (c.recurringMisconceptions > 1) bits.push(`${c.recurringMisconceptions} recurring misconceptions`);
  return `Practice: ${bits.join(" and ")}`;
}

function revisionReason(c: EngineConcept, day: Date): string {
  const days = Math.max(1, Math.floor((daysSincePractice(c.mastery, day) ?? 0) + 1e-6));
  return `Revision: not practised for ${plural(days, "day")} — fading`;
}

function planLearnDay(
  ctx: PlanContext,
  queue: QueueItem[],
  remaining: Map<string, number>,
  mistakeCandidates: EngineConcept[],
  day: Date,
  dayIndex: number,
): PlanBlock[] {
  const learn: PlanBlock[] = [];
  const learnedToday = new Set<string>();

  /** Greedy fill; one block per concept per day. Returns the unused minutes. */
  const fill = (budget: number): number => {
    let left = budget;
    for (const item of queue) {
      if (left < MIN_LEARN_BLOCK) break;
      const need = remaining.get(item.id) ?? 0;
      if (need <= 0 || learnedToday.has(item.id)) continue;
      if (item.waitsFor.some((p) => (remaining.get(p) ?? 0) > 0)) continue;
      const minutes = Math.min(need, MAX_LEARN_BLOCK, floor5(left));
      learn.push({ kind: "learn", conceptId: item.id, conceptName: item.name, minutes, reason: item.reason });
      remaining.set(item.id, need - minutes);
      learnedToday.add(item.id);
      left -= minutes;
    }
    return left;
  };

  const reserveOn = ctx.reservedPerDay > 0;
  const mistakePick = reserveOn && mistakeCandidates.length > 0
    ? mistakeCandidates[dayIndex % mistakeCandidates.length]
    : null;
  const revisionPool = reserveOn ? revisionCandidates(ctx, day).filter((c) => c.id !== mistakePick?.id) : [];
  const hasNeed = [...remaining.values()].some((v) => v > 0);
  const reservePractice = reserveOn && (mistakePick !== null || hasNeed);
  const reserveRevision = revisionPool.length > 0;

  const left = fill(
    ctx.minutesPerDay - (reservePractice ? PRACTICE_BLOCK_MIN : 0) - (reserveRevision ? REVISION_BLOCK_MIN : 0),
  );

  let practice: PlanBlock | null = null;
  if (mistakePick) {
    practice = {
      kind: "practice",
      conceptId: mistakePick.id,
      conceptName: mistakePick.name,
      minutes: PRACTICE_BLOCK_MIN,
      reason: practiceReason(mistakePick),
    };
  } else if (reservePractice && learn.length > 0) {
    practice = {
      kind: "practice",
      conceptId: learn[0].conceptId,
      conceptName: learn[0].conceptName,
      minutes: PRACTICE_BLOCK_MIN,
      reason: `Practice: questions on ${learn[0].conceptName} to lock in today's learning`,
    };
  }

  // Don't revise something that is being learned or practised today anyway.
  const revisable = revisionPool.filter((c) => !learnedToday.has(c.id) && c.id !== practice?.conceptId);
  const revisionPick = revisable.length > 0 ? revisable[dayIndex % revisable.length] : null;
  const revision: PlanBlock | null = revisionPick
    ? {
        kind: "revision",
        conceptId: revisionPick.id,
        conceptName: revisionPick.name,
        minutes: REVISION_BLOCK_MIN,
        reason: revisionReason(revisionPick, day),
      }
    : null;

  // Reserved blocks without a candidate give their minutes back to learning.
  const returned =
    (reservePractice && !practice ? PRACTICE_BLOCK_MIN : 0) + (reserveRevision && !revision ? REVISION_BLOCK_MIN : 0);
  if (returned > 0) fill(left + returned);

  return [...learn, ...(practice ? [practice] : []), ...(revision ? [revision] : [])];
}

function learnDays(ctx: PlanContext, horizon: number): DayPlan[] {
  const queue = learnQueue(ctx);
  const remaining = new Map(queue.map((q) => [q.id, ctx.rankedById.get(q.id)?.minutesNeeded ?? 0] as const));
  const mistakeCandidates = practiceCandidates(ctx);
  const days: DayPlan[] = [];
  let active = 0;
  for (let k = 0; k < horizon; k++) {
    const day = addDays(ctx.now, k);
    const date = isoDay(day);
    if (ctx.skipped.has(date)) {
      days.push({ date, skipped: true, blocks: [], totalMinutes: 0 });
      continue;
    }
    const blocks = planLearnDay(ctx, queue, remaining, mistakeCandidates, day, active++);
    days.push({ date, skipped: false, blocks, totalMinutes: blocks.reduce((s, b) => s + b.minutes, 0) });
  }
  return days;
}

/** Revision mode: each day is a revisionSequence, preferring concepts not revised on earlier days. */
function revisionDays(ctx: PlanContext, horizon: number): DayPlan[] {
  const concepts = [...ctx.graph.byId.values()];
  const used = new Set<string>();
  const days: DayPlan[] = [];
  for (let k = 0; k < horizon; k++) {
    const day = addDays(ctx.now, k);
    const date = isoDay(day);
    if (ctx.skipped.has(date)) {
      days.push({ date, skipped: true, blocks: [], totalMinutes: 0 });
      continue;
    }
    const fresh = revisionSequence(concepts.filter((c) => !used.has(c.id)), ctx.minutesPerDay, day);
    const freshMinutes = fresh.reduce((s, i) => s + i.minutes, 0);
    const topUp = revisionSequence(concepts.filter((c) => used.has(c.id)), ctx.minutesPerDay - freshMinutes, day);
    for (const i of fresh) used.add(i.conceptId);
    if (fresh.length === 0) used.clear();

    const blocks: PlanBlock[] = [...fresh, ...topUp].map((i) => ({
      kind: "revision",
      conceptId: i.conceptId,
      conceptName: i.name,
      minutes: i.minutes,
      reason: `Revision: ${i.reason}`,
    }));
    days.push({ date, skipped: false, blocks, totalMinutes: blocks.reduce((s, b) => s + b.minutes, 0) });
  }
  return days;
}

/**
 * Today's plan + the following days until the exam. Greedy fill of available minutes
 * from the priority list, reserving a 15-min practice block and a 10-min revision block.
 * Skipped days get no blocks and their work flows to later days; triage drops the
 * lowest-weightage concepts (with reasons) when the need exceeds available time.
 * On exam day (0 days left) today is still planned, as a revision day.
 */
export function buildSchedule(input: PlanInput): Schedule {
  const ctx = buildPlanContext(input);
  const horizon = Math.max(1, Math.min(ctx.daysLeft, PLAN_HORIZON_DAYS));
  const days = ctx.mode === "revision" ? revisionDays(ctx, horizon) : learnDays(ctx, horizon);
  return {
    mode: ctx.mode,
    modeReason: ctx.modeReason,
    daysLeft: ctx.daysLeft,
    today: days[0],
    days,
    dropped: ctx.dropped,
    totalNeededMin: ctx.totalNeededMin,
    totalAvailableMin: ctx.totalAvailableMin,
  };
}
