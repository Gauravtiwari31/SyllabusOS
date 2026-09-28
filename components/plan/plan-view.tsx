"use client";
// /plan — minutes/day and "skip today" re-plan instantly (P0 #5). The engine runs
// on the server; the numeral moves as you drag and the plan follows ~300 ms later.
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleSkipToday, updateMinutesPerDay } from "@/app/actions/study";
import type { PlanUpdate } from "./types";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { DotLoader, Meta, Stat, Tile, TileHeader } from "@/components/nu";
import { StudyNowTile } from "@/components/study-now/study-now-tile";
import { MINUTES_PER_DAY } from "@/components/settings/goal-schema";
import { cn } from "@/lib/utils";
import { DayTile } from "./day-tile";
import { ModeTile } from "./mode-tile";
import { describePlanChange, type PlanChange } from "./diff";

const DEBOUNCE_MS = 300;
const PRESETS = [30, 45, 60, 90, 120] as const;

export function PlanView({ goalId, initial }: { goalId: string; initial: PlanUpdate }) {
  const [plan, setPlan] = useState(initial);
  const [draftMinutes, setDraftMinutes] = useState<number | null>(null);
  const [change, setChange] = useState<PlanChange | null>(null);
  const [isPending, startTransition] = useTransition();
  const [skipped, setOptimisticSkipped] = useOptimistic(plan.skippedToday);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  // The plan a pending request will be diffed against (latest committed plan).
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const minutes = draftMinutes ?? plan.minutesPerDay;

  function apply(result: PlanUpdate, requestId: number) {
    // Ignore responses overtaken by a newer request.
    if (requestId !== seq.current) return;
    setChange(describePlanChange(planRef.current.schedule, result.schedule));
    setPlan(result);
    setDraftMinutes(null);
  }

  function commitMinutes(value: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (value === planRef.current.minutesPerDay) {
      setDraftMinutes(null);
      return;
    }
    const requestId = ++seq.current;
    startTransition(async () => {
      const res = await updateMinutesPerDay(goalId, value);
      if (res.ok) apply(res.data, requestId);
      else {
        toast.error(res.error);
        if (requestId === seq.current) setDraftMinutes(null);
      }
    });
  }

  function onSlide(value: number) {
    setDraftMinutes(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commitMinutes(value), DEBOUNCE_MS);
  }

  function onSkip(next: boolean) {
    const requestId = ++seq.current;
    startTransition(async () => {
      setOptimisticSkipped(next);
      const res = await toggleSkipToday(goalId, next);
      if (res.ok) apply(res.data, requestId);
      else toast.error(res.error);
    });
  }

  const { schedule, recommendation } = plan;
  const upcoming = schedule.days.slice(1);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4">
        <Tile className="gap-5">
          <TileHeader
            label="Minutes / day"
            right={isPending ? <DotLoader label="Re-planning…" /> : <Meta>Saved</Meta>}
          />
          <Stat value={minutes} unit="min" size="xl" />
          <div className="flex flex-col gap-2">
            <Slider
              aria-label="Minutes per day"
              min={MINUTES_PER_DAY.min}
              max={MINUTES_PER_DAY.max}
              step={MINUTES_PER_DAY.step}
              value={[minutes]}
              onValueChange={([v]) => onSlide(v)}
              onValueCommit={([v]) => commitMinutes(v)}
              className="py-2 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-foreground"
            />
            <div className="flex justify-between">
              <Meta>{MINUTES_PER_DAY.min}</Meta>
              <Meta>{MINUTES_PER_DAY.max}</Meta>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick presets">
            {PRESETS.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={minutes === p ? "default" : "outline"}
                aria-pressed={minutes === p}
                className="min-w-12 tabular-nums"
                onClick={() => {
                  setDraftMinutes(p);
                  commitMinutes(p);
                }}
              >
                {p}
              </Button>
            ))}
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="skip-today" className="text-sm font-medium">
                Skip today
              </label>
              <p className="text-[13px] leading-snug text-muted-foreground">
                Rest today. Its work moves to the following days.
              </p>
            </div>
            <Switch id="skip-today" checked={skipped} onCheckedChange={onSkip} />
          </div>

          <div aria-live="polite" className="empty:hidden">
            {change && (
              <div
                className={cn(
                  "flex flex-col gap-1.5 rounded-[var(--nu-radius-sm)] border p-3",
                  change.compressed ? "border-nu-accent/50" : "border-border",
                )}
              >
                <p className="flex items-center gap-2 text-sm font-medium">
                  {change.compressed && <span className="nu-dot size-1.5" aria-hidden />}
                  {change.headline}
                </p>
                {change.details.map((d) => (
                  <p key={d} className="text-[13px] leading-snug text-muted-foreground">
                    {d}
                  </p>
                ))}
              </div>
            )}
          </div>
        </Tile>

        <ModeTile schedule={schedule} maxDropped={20} showBudget showExplainer />
      </div>

      <div
        className={cn("flex min-w-0 flex-col gap-4 transition-opacity lg:col-span-2", isPending && "opacity-60")}
        aria-busy={isPending}
      >
        <StudyNowTile recommendation={recommendation} variant="compact" />

        <DayTile day={schedule.today} label="Today" minutesPerDay={plan.minutesPerDay} density="comfortable" />

        {upcoming.length > 0 && (
          <section aria-labelledby="upcoming-days" className="flex flex-col gap-3">
            <h2 id="upcoming-days" className="nu-label px-1">
              Next {upcoming.length} {upcoming.length === 1 ? "day" : "days"}
            </h2>
            <ol className="grid gap-4 sm:grid-cols-2">
              {upcoming.map((day, i) => (
                <DayTile
                  key={day.date}
                  as="li"
                  day={day}
                  label={i === 0 ? "Tomorrow" : undefined}
                  minutesPerDay={plan.minutesPerDay}
                />
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
