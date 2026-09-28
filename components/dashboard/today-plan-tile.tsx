"use client";
// TODAY'S PLAN on the dashboard, with "skip today" + undo (instant re-plan, P0 #5).
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { ArrowRight, CalendarOff, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { toggleSkipToday } from "@/app/actions/study";
import type { DayPlan } from "@/lib/engine/types";
import { Button } from "@/components/ui/button";
import { Chip, DotBar, DotLoader, EmptyState, Label, Meta, Tile, TileHeader, pct } from "@/components/nu";
import { PlanBlockList } from "@/components/plan/plan-block-list";
import { formatDay, plural } from "@/components/plan/format";
import { cn } from "@/lib/utils";

export function TodayPlanTile({
  goalId,
  today,
  tomorrow,
  minutesPerDay,
  skippedToday,
  className,
}: {
  goalId: string;
  today: DayPlan;
  tomorrow: DayPlan | null;
  minutesPerDay: number;
  skippedToday: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [skipped, setSkipped] = useOptimistic(skippedToday);

  function toggle(next: boolean) {
    startTransition(async () => {
      setSkipped(next);
      const res = await toggleSkipToday(goalId, next);
      if (!res.ok) toast.error(res.error);
    });
  }

  const fill = minutesPerDay > 0 ? today.totalMinutes / minutesPerDay : 0;

  return (
    <Tile className={cn("gap-4", className)}>
      <TileHeader
        label="Today's plan"
        right={
          isPending ? (
            <DotLoader label="Re-planning…" />
          ) : skipped ? (
            <Chip tone="neutral">SKIPPED</Chip>
          ) : (
            <Meta className="tabular-nums">
              {today.totalMinutes}/{minutesPerDay} min
            </Meta>
          )
        }
      />

      <div aria-live="polite" className="flex flex-1 flex-col gap-4">
        {skipped ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--nu-radius-sm)] border border-dashed border-border p-4">
              <p className="flex items-center gap-2 text-sm">
                <CalendarOff strokeWidth={1.5} className="size-4 text-muted-foreground" aria-hidden />
                Skipped today — plan moved to tomorrow
              </p>
              <Button variant="outline" size="sm" onClick={() => toggle(false)} disabled={isPending}>
                <Undo2 strokeWidth={1.5} aria-hidden />
                Undo
              </Button>
            </div>
            {tomorrow && !tomorrow.skipped && tomorrow.blocks.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <Label>Tomorrow · {formatDay(tomorrow.date)}</Label>
                  <Meta className="tabular-nums">{tomorrow.totalMinutes} min</Meta>
                </div>
                <PlanBlockList blocks={tomorrow.blocks} density="compact" />
              </div>
            )}
          </div>
        ) : today.blocks.length === 0 ? (
          <EmptyState
            className="py-6"
            title="Nothing planned today"
            description="Every concept is covered or dropped. Try a revision sequence."
          />
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <DotBar value={fill} label={`${pct(Math.min(1, fill))}% of today's minutes planned`} />
              <Meta className="text-[11px]">
                {plural(today.blocks.length, "block")} · {today.totalMinutes} of {minutesPerDay} min available
              </Meta>
            </div>
            <PlanBlockList blocks={today.blocks} />
          </>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        {!skipped ? (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            onClick={() => toggle(true)}
            disabled={isPending}
          >
            <CalendarOff strokeWidth={1.5} aria-hidden />
            Skip today
          </Button>
        ) : (
          <span />
        )}
        <Link
          href="/plan"
          className="inline-flex items-center gap-1 rounded-full text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Full plan
          <ArrowRight strokeWidth={1.5} className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Tile>
  );
}
