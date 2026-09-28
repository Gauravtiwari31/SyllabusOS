"use client";
// Revision Mode (P1): "I have N minutes before the exam" → the highest-value sequence.
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { getRevisionPlan } from "@/app/actions/study";
import type { RevisionItem } from "@/lib/engine/types";
import { Button } from "@/components/ui/button";
import { DotBar, DotLoader, EmptyState, Meta, Tile, TileHeader, pct } from "@/components/nu";
import { formatMinutes, plural } from "@/components/plan/format";
import { cn } from "@/lib/utils";

const QUICK = [30, 60, 90, 120] as const;
const MIN = 10;
const MAX = 600;

export function RevisionPlanner({
  goalId,
  initialMinutes,
  initialItems,
}: {
  goalId: string;
  initialMinutes: number;
  initialItems: RevisionItem[];
}) {
  const inputId = useId();
  const [minutes, setMinutes] = useState(String(initialMinutes));
  const [result, setResult] = useState({ minutes: initialMinutes, items: initialItems });
  const [isPending, startTransition] = useTransition();

  function build(value: number) {
    if (!Number.isInteger(value) || value < MIN || value > MAX) {
      toast.error(`Pick between ${MIN} and ${MAX} minutes`);
      return;
    }
    setMinutes(String(value));
    startTransition(async () => {
      const res = await getRevisionPlan(goalId, value);
      if (res.ok) setResult({ minutes: value, items: res.data });
      else toast.error(res.error);
    });
  }

  const total = result.items.reduce((s, i) => s + i.minutes, 0);
  const current = Number(minutes);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Tile className="h-fit gap-6">
        <TileHeader label="Time left" />
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            build(Number(minutes));
          }}
        >
          <label htmlFor={inputId} className="flex flex-wrap items-baseline gap-x-3 gap-y-2 text-xl font-medium leading-tight sm:text-2xl">
            I have
            <span className="inline-flex items-baseline gap-1">
              <input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={MIN}
                max={MAX}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-[3.2ch] min-w-[2.5ch] border-b border-border bg-transparent text-center font-display text-[56px] leading-none tabular-nums outline-none [appearance:textfield] focus-visible:border-nu-accent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-describedby={`${inputId}-hint`}
              />
            </span>
            minutes before the exam
          </label>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick picks">
            {QUICK.map((q) => (
              <Button
                key={q}
                type="button"
                size="sm"
                variant={current === q ? "default" : "outline"}
                aria-pressed={current === q}
                className="min-w-14 tabular-nums"
                onClick={() => build(q)}
              >
                {q}
              </Button>
            ))}
          </div>

          <Button type="submit" variant="default" size="lg" disabled={isPending} className="self-start">
            {isPending ? <DotLoader /> : null}
            Build sequence
          </Button>
          <Meta id={`${inputId}-hint`} className="text-[11px] leading-relaxed">
            Weak, high-weightage and fading topics first.
          </Meta>
        </form>
      </Tile>

      <Tile className={cn("gap-5 transition-opacity lg:col-span-2", isPending && "opacity-60")} aria-busy={isPending}>
        <TileHeader
          label="Revision sequence"
          right={
            <Meta className="tabular-nums" aria-live="polite">
              {plural(result.items.length, "topic")} · {total}/{result.minutes} min
            </Meta>
          }
        />
        {result.items.length === 0 ? (
          <EmptyState
            title="Nothing to revise"
            description="No concept is weak, high-weightage or decayed enough to be worth these minutes."
          />
        ) : (
          <>
            <DotBar
              value={result.minutes > 0 ? total / result.minutes : 0}
              label={`${formatMinutes(total)} of ${formatMinutes(result.minutes)} used`}
            />
            <ol className="flex flex-col divide-y divide-border">
              {result.items.map((item, i) => (
                <li key={item.conceptId} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[auto_1fr_auto]">
                  <span className="font-dot text-[28px] leading-none text-muted-foreground" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-base font-medium">
                        <span className="sr-only">Step {i + 1}: </span>
                        {item.name}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        {item.minutes}
                        <span className="ml-0.5 text-[11px] text-[var(--nu-dim)]">min</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <DotBar value={item.score} segments={16} className="max-w-56 flex-1" label={`Revision score ${pct(item.score)}`} />
                      <Meta className="tabular-nums">{item.score.toFixed(2)}</Meta>
                    </div>
                    <p className="text-[13px] leading-snug text-muted-foreground">{item.reason}</p>
                  </div>
                  <div className="col-start-2 sm:col-start-auto sm:self-center">
                    <Button asChild size="sm" variant={i === 0 ? "accent" : "outline"}>
                      <Link href={`/learn/${item.conceptId}`}>
                        Start
                        <ArrowRight strokeWidth={1.5} data-icon="inline-end" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </Tile>
    </div>
  );
}
