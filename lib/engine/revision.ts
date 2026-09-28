// Revision Mode (idea.md P1): "I have N minutes before the exam" → the highest-value
// revision sequence, weak × high-weightage × decayed. Re-exported from ./planner.
import {
  BAND_STRONG_FROM,
  BAND_WEAK_BELOW,
  CONFIDENCE_LOW_FROM,
  CONFIDENCE_MEDIUM_FROM,
  FADING_FROM,
  REVISION_ITEM_MAX,
  REVISION_ITEM_MIN,
  REVISION_ITEM_TAIL_MIN,
  REVISION_UNKNOWN_MASTERY,
} from "./constants";
import { decayAmount, decayedMastery } from "./mastery";
import type { EngineConcept, RevisionItem } from "./types";
import { clamp, compareNames, pct, round5, sharePct, wholeMinutes } from "./util";

interface Scored {
  c: EngineConcept;
  /** decayed display mastery, or null when never assessed */
  mastery: number | null;
  decay: number;
  score: number;
}

function masteryPhrase(s: Scored): string {
  if (s.mastery === null) return "Not assessed yet";
  const low = s.c.mastery.evidenceCount < CONFIDENCE_MEDIUM_FROM ? ", low confidence" : "";
  const label = s.mastery < BAND_WEAK_BELOW ? "Weak" : s.mastery < BAND_STRONG_FROM ? "Developing" : "Strong";
  return `${label} (${pct(s.mastery)}${low})`;
}

function revisionReason(s: Scored): string {
  const parts = [masteryPhrase(s)];
  if (s.c.weightage > 0) {
    parts.push(
      s.c.weightageSource === "pyq"
        ? `${sharePct(s.c.weightage)} of PYQ marks`
        : `~${sharePct(s.c.weightage)} of marks (estimated)`,
    );
  }
  if (s.decay >= FADING_FROM) parts.push("fading");
  return parts.join(", ");
}

/** Block length for one concept: min(20, max(10, round5(estMinutes / 3))). */
export function revisionBlockMinutes(estMinutes: number): number {
  return clamp(round5(Math.max(0, estMinutes) / 3), REVISION_ITEM_MIN, REVISION_ITEM_MAX);
}

/**
 * score = (1 − mastery) × normWeightage × (0.5 + 0.5·decay), sorted desc (ties: weightage desc,
 * name). Never-assessed concepts count as weak (REVISION_UNKNOWN_MASTERY). Blocks are taken in
 * order until the minutes run out; the last block may shrink, down to REVISION_ITEM_TAIL_MIN.
 */
export function revisionSequence(concepts: EngineConcept[], minutes: number, now: Date): RevisionItem[] {
  const budget = wholeMinutes(minutes);
  if (budget < REVISION_ITEM_TAIL_MIN || concepts.length === 0) return [];

  const maxW = concepts.reduce((m, c) => Math.max(m, c.weightage), 0);
  const scored: Scored[] = concepts
    .map((c) => {
      const known = c.mastery.evidenceCount >= CONFIDENCE_LOW_FROM;
      const m = known ? decayedMastery(c.mastery, now) : REVISION_UNKNOWN_MASTERY;
      const normW = maxW > 0 ? clamp(c.weightage / maxW, 0, 1) : 1;
      const decay = decayAmount(c.mastery, now);
      return { c, mastery: known ? m : null, decay, score: (1 - m) * normW * (0.5 + 0.5 * decay) };
    })
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.c.weightage - a.c.weightage ||
        compareNames(a.c.name, b.c.name) ||
        compareNames(a.c.id, b.c.id),
    );

  const items: RevisionItem[] = [];
  let left = budget;
  const seen = new Set<string>();
  for (const s of scored) {
    if (left < REVISION_ITEM_TAIL_MIN) break;
    if (seen.has(s.c.id)) continue;
    seen.add(s.c.id);
    const block = Math.min(revisionBlockMinutes(s.c.estMinutes), left);
    items.push({ conceptId: s.c.id, name: s.c.name, minutes: block, score: s.score, reason: revisionReason(s) });
    left -= block;
  }
  return items;
}
