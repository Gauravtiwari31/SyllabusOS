// Deterministic priority engine (idea.md §5.2). PURE: no DB, no LLM, no clock.
//
//   value(c)    = 0.30·Weightage + 0.30·Gap + 0.20·Unlock + 0.10·MistakeRate + 0.10·Decay
//   priority(c) = value(c) / sqrt(max(minutesNeeded, MIN_LEARN_BLOCK) / MIN_LEARN_BLOCK)
//
// The deadline sets the mode (learn / revision / triage) instead of multiplying every score.
// Implementation lives in ./ranking (scores, reasons) and ./context (days, mode, triage) so
// the planner can share it without an import cycle.
import { MAX_LEARN_BLOCK, MIN_LEARN_BLOCK, REVISION_ITEM_MAX } from "./constants";
import { buildPlanContext, type PlanContext } from "./context";
import { gateReason, reasonFor } from "./ranking";
import { revisionSequence } from "./revision";
import type { EngineConcept, RankedConcept, Recommendation } from "./types";
import { clamp, round5 } from "./util";

export {
  buildReason,
  determineMode,
  gateChain,
  minutesNeeded,
  mistakeRateOf,
  rankConcepts,
  scoreComponents,
} from "./ranking";

/** Concepts still worth learning in this mode (triage drops excluded; falls back if all dropped). */
function learnCandidates(ctx: PlanContext): RankedConcept[] {
  const open = ctx.ranked.filter((r) => r.minutesNeeded > 0);
  const kept = open.filter((r) => !ctx.droppedIds.has(r.conceptId));
  return kept.length > 0 ? kept : open;
}

function recommendRevision(ctx: PlanContext, concepts: EngineConcept[]): Recommendation | null {
  // Ask for enough minutes to also list alternatives, then cap the pick at the day's minutes.
  const seq = revisionSequence(concepts, Math.max(ctx.minutesPerDay, 4 * REVISION_ITEM_MAX), ctx.now);
  const top = seq[0];
  const ranked = top ? ctx.rankedById.get(top.conceptId) : undefined;
  if (!top || !ranked) return null;
  return {
    conceptId: top.conceptId,
    conceptName: top.name,
    unit: ranked.unit,
    minutes: Math.min(top.minutes, Math.max(ctx.minutesPerDay, MIN_LEARN_BLOCK)),
    reason: `Revision: ${top.reason}.`,
    mode: ctx.mode,
    components: ranked.components,
    contributions: ranked.contributions,
    mastery: ranked.mastery,
    confidence: ranked.confidence,
    gatedFor: null,
    alternatives: seq.slice(1, 4).map((item) => ({
      conceptId: item.conceptId,
      name: item.name,
      priority: ctx.rankedById.get(item.conceptId)?.priority ?? 0,
      reason: `Revision: ${item.reason}.`,
    })),
  };
}

/** The single "Study Now" answer. null when there are no concepts or everything is mastered. */
export function recommendNext(input: {
  concepts: EngineConcept[];
  minutesPerDay: number;
  examDate: Date;
  now: Date;
  skipDates: string[];
}): Recommendation | null {
  if (input.concepts.length === 0) return null;
  const ctx = buildPlanContext(input);
  if (ctx.ranked.every((r) => r.minutesNeeded === 0)) return null;

  if (ctx.mode === "revision") return recommendRevision(ctx, input.concepts);

  const candidates = learnCandidates(ctx);
  const top = candidates[0];
  // Prerequisite gating: study the (recursively) weakest blocking prerequisite first.
  const chain = ctx.chains.get(top.conceptId) ?? [];
  const pick = chain.length > 0 ? chain[chain.length - 1] : top;
  const reason =
    chain.length > 0 ? gateReason([top, ...chain]) : reasonFor(top, ctx.graph, { includeGate: false });
  const minutes = clamp(
    round5(Math.min(pick.minutesNeeded, MAX_LEARN_BLOCK, ctx.learnMinutesPerDay)),
    MIN_LEARN_BLOCK,
    MAX_LEARN_BLOCK,
  );

  return {
    conceptId: pick.conceptId,
    conceptName: pick.name,
    unit: pick.unit,
    minutes,
    reason,
    mode: ctx.mode,
    components: pick.components,
    contributions: pick.contributions,
    mastery: pick.mastery,
    confidence: pick.confidence,
    gatedFor: chain.length > 0 ? { conceptId: top.conceptId, name: top.name } : null,
    alternatives: candidates
      .filter((r) => r.conceptId !== pick.conceptId)
      .slice(0, 3)
      .map((r) => ({
        conceptId: r.conceptId,
        name: r.name,
        priority: r.priority,
        reason: reasonFor(r, ctx.graph, { includeGate: true }),
      })),
  };
}
