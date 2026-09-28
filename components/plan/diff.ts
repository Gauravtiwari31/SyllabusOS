// Human-readable summary of what changed between two schedules, shown after an
// instant re-plan (minutes/day changed, day skipped). Pure and client-safe.
import type { Schedule, StudyMode } from "@/lib/engine/types";
import { plural } from "./format";

export const MODE_LABEL: Record<StudyMode, string> = {
  learn: "LEARN",
  revision: "REVISION",
  triage: "TRIAGE",
};

export interface PlanChange {
  /** One-line headline, e.g. "Plan compressed: 2 topics dropped (low weightage)". */
  headline: string;
  /** Supporting lines (mode switch, today's minutes, names of dropped topics). */
  details: string[];
  /** True when the change removes work from the plan (drops topics or switches to triage). */
  compressed: boolean;
}

function learnConceptIds(s: Schedule): Set<string> {
  const ids = new Set<string>();
  for (const day of s.days) {
    for (const b of day.blocks) if (b.kind === "learn" && b.conceptId) ids.add(b.conceptId);
  }
  return ids;
}

export function describePlanChange(prev: Schedule, next: Schedule): PlanChange {
  const details: string[] = [];

  const prevDropped = new Set(prev.dropped.map((d) => d.conceptId));
  const nextDropped = new Set(next.dropped.map((d) => d.conceptId));
  const newlyDropped = next.dropped.filter((d) => !prevDropped.has(d.conceptId));
  const restored = prev.dropped.filter((d) => !nextDropped.has(d.conceptId));

  const modeChanged = prev.mode !== next.mode;
  if (modeChanged) {
    details.push(`Mode ${MODE_LABEL[prev.mode]} → ${MODE_LABEL[next.mode]}: ${next.modeReason}`);
  }

  const todayBefore = prev.today.skipped ? 0 : prev.today.totalMinutes;
  const todayAfter = next.today.skipped ? 0 : next.today.totalMinutes;
  if (todayBefore !== todayAfter || prev.today.blocks.length !== next.today.blocks.length) {
    details.push(
      `Today ${todayBefore} → ${todayAfter} min · ${prev.today.blocks.length} → ${plural(next.today.blocks.length, "block")}`,
    );
  }

  if (newlyDropped.length > 0) {
    details.push(`Dropped: ${newlyDropped.map((d) => d.name).join(", ")}`);
  }
  if (restored.length > 0) {
    details.push(`Back in the plan: ${restored.map((d) => d.name).join(", ")}`);
  }

  let headline: string;
  if (newlyDropped.length > 0) {
    headline = `Plan compressed: ${plural(newlyDropped.length, "topic")} dropped (low weightage)`;
  } else if (restored.length > 0) {
    headline = `Plan expanded: ${plural(restored.length, "topic")} restored`;
  } else if (modeChanged) {
    headline = `Mode changed: ${MODE_LABEL[prev.mode]} → ${MODE_LABEL[next.mode]}`;
  } else if (next.today.skipped && !prev.today.skipped) {
    headline = "Skipped today — plan moved to the following days";
  } else if (prev.today.skipped && !next.today.skipped) {
    headline = "Today is back on — plan restored";
  } else {
    const before = learnConceptIds(prev);
    const after = learnConceptIds(next);
    const lost = [...before].filter((id) => !after.has(id)).length;
    const gained = [...after].filter((id) => !before.has(id)).length;
    if (lost > gained) headline = `Plan compressed: ${plural(lost - gained, "topic")} fewer before the exam`;
    else if (gained > lost) headline = `Plan expanded: ${plural(gained - lost, "topic")} more before the exam`;
    else if (details.length > 0) headline = "Plan re-balanced";
    else headline = "No change to the plan";
  }

  return {
    headline,
    details,
    compressed: newlyDropped.length > 0 || (modeChanged && next.mode === "triage"),
  };
}
