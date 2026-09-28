// Single-number tiles for the dashboard. One Ndot hero numeral per tile.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { DashboardStats, GoalSummary } from "@/lib/types";
import { DotBar, Meta, Stat, SubStat, Tile, TileHeader, pct } from "@/components/nu";
import { cn } from "@/lib/utils";
import { formatExamDate, formatMinutes, plural } from "@/components/plan/format";

/** Numerals shrink on phones so two tiles fit side by side at 375 px. */
const RESPONSIVE_STAT = "[&>.nu-stat]:text-[40px] sm:[&>.nu-stat]:text-[56px]";

export function MasteryStatTile({ stats, className }: { stats: DashboardStats; className?: string }) {
  const hasEvidence = stats.conceptsTotal > stats.conceptsUnknown;
  return (
    <Tile className={cn("justify-between gap-4", className)}>
      <TileHeader label="Mastery" />
      <Stat value={hasEvidence ? pct(stats.overallMastery) : "--"} unit="%" className={RESPONSIVE_STAT} />
      <div className="flex flex-col gap-2">
        <DotBar value={stats.overallMastery} segments={12} label="Overall mastery" />
        <SubStat className="text-[13px] text-muted-foreground">
          {stats.conceptsStrong}/{stats.conceptsTotal} strong
        </SubStat>
        {stats.conceptsUnknown > 0 && <Meta className="text-[11px]">{stats.conceptsUnknown} not tested yet</Meta>}
      </div>
    </Tile>
  );
}

export function DaysLeftTile({ goal, className }: { goal: GoalSummary; className?: string }) {
  const urgent = goal.daysLeft <= 3;
  return (
    <Tile className={cn("justify-between gap-4", className)}>
      <TileHeader label="Days left" />
      <Stat
        value={goal.daysLeft}
        unit={goal.daysLeft === 1 ? "day" : "days"}
        accent={urgent}
        className={RESPONSIVE_STAT}
      />
      <div className="flex flex-col gap-1">
        <Meta>Exam {formatExamDate(goal.examDate)}</Meta>
        {urgent && <Meta className="text-[11px]">Revision window</Meta>}
      </div>
    </Tile>
  );
}

export function SessionsTile({ stats, className }: { stats: DashboardStats; className?: string }) {
  return (
    <Tile className={cn("justify-between gap-4", className)}>
      <TileHeader label="Sessions" />
      <Stat value={stats.sessionsCompleted} unit="done" className={RESPONSIVE_STAT} />
      <SubStat className="text-[13px] text-muted-foreground">{formatMinutes(stats.minutesStudied)} studied</SubStat>
    </Tile>
  );
}

export function MistakesTile({ stats, className }: { stats: DashboardStats; className?: string }) {
  return (
    <Tile className={cn("justify-between gap-4", className)}>
      <TileHeader label="Open mistakes" />
      <Stat value={stats.openMistakes} className={RESPONSIVE_STAT} />
      <Link
        href="/mistakes"
        className="group inline-flex items-center gap-1 self-start rounded-full text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {stats.openMistakes === 0 ? "Mistake log" : `Review ${plural(stats.openMistakes, "mistake")}`}
        <ArrowUpRight strokeWidth={1.5} className="size-3.5" aria-hidden />
      </Link>
    </Tile>
  );
}
