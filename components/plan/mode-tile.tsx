// MODE — set by the deadline, not multiplied into every score (idea.md §5.2).
// Triage lists the topics it dropped and says why. Presentational.
import Link from "next/link";
import type { Schedule, StudyMode } from "@/lib/engine/types";
import { DotBar, Label, Meta, Tile, TileHeader, pct } from "@/components/nu";
import { cn } from "@/lib/utils";
import { MODE_LABEL } from "./diff";
import { plural } from "./format";

const MODES: StudyMode[] = ["learn", "revision", "triage"];

export const MODE_EXPLAINER: Record<StudyMode, string> = {
  learn: "Enough time before the exam: new concepts first, in priority order.",
  revision: "Exam is close: revise weak, high-weightage topics instead of starting new ones.",
  triage: "Not enough time for everything: the lowest-weightage topics are dropped, and listed below.",
};

export function ModeTile({
  schedule,
  maxDropped = 3,
  showBudget = false,
  showExplainer = false,
  className,
}: {
  schedule: Schedule;
  /** How many dropped topics to list before "+N more". */
  maxDropped?: number;
  /** Show needed vs available minutes. */
  showBudget?: boolean;
  showExplainer?: boolean;
  className?: string;
}) {
  const dropped = schedule.dropped;
  const shown = dropped.slice(0, maxDropped);
  const coverage = schedule.totalNeededMin > 0 ? schedule.totalAvailableMin / schedule.totalNeededMin : 1;

  return (
    <Tile className={cn("gap-4", className)}>
      <TileHeader label="Mode" right={<Meta>{plural(schedule.daysLeft, "day")} left</Meta>} />

      <ul className="inline-flex self-start rounded-full border border-border p-0.5" aria-label="Study modes">
        {MODES.map((m) => {
          const active = m === schedule.mode;
          return (
            <li
              key={m}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium",
                active ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", active ? "bg-nu-accent" : "hidden")}
              />
              {MODE_LABEL[m]}
              {active && <span className="sr-only">(current mode)</span>}
            </li>
          );
        })}
      </ul>

      <p className="text-sm leading-snug">{schedule.modeReason}</p>
      {showExplainer && <p className="text-[13px] leading-snug text-muted-foreground">{MODE_EXPLAINER[schedule.mode]}</p>}

      {showBudget && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label>Time budget</Label>
            <Meta className="tabular-nums">
              {schedule.totalAvailableMin} / {schedule.totalNeededMin} min
            </Meta>
          </div>
          <DotBar
            value={coverage}
            tone={coverage < 1 ? "accent" : "paper"}
            label={`Available time covers ${pct(Math.min(1, coverage))}% of what is needed`}
          />
          <Meta className="text-[11px]">
            {coverage >= 1
              ? "Available time covers everything still to learn."
              : `Available time covers ${pct(coverage)}% of what is still needed.`}
          </Meta>
        </div>
      )}

      {dropped.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Label>Dropped · {plural(dropped.length, "topic")}</Label>
          <ul className="flex flex-col gap-2">
            {shown.map((d) => (
              <li key={d.conceptId} className="flex flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium line-through decoration-[var(--nu-dim)]">{d.name}</span>
                  <Meta className="shrink-0">{pct(d.weightage)}% wt</Meta>
                </span>
                <span className="text-[13px] leading-snug text-muted-foreground">{d.reason}</span>
              </li>
            ))}
          </ul>
          {dropped.length > shown.length && (
            <Link href="/plan" className="nu-meta underline-offset-4 hover:text-foreground hover:underline">
              +{dropped.length - shown.length} more on the plan →
            </Link>
          )}
        </div>
      )}
    </Tile>
  );
}
