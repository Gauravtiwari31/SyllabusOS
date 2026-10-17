"use client";
// MASTERY TREND — weightage-weighted mastery per day. Monochrome line, one accent
// dot on today's value, dotted grid. Seeded history is flagged as demo data.
import { lazy, Suspense } from "react";
import type { MasteryTrendPoint } from "@/lib/types";
import type { ChartPoint } from "./mastery-trend-chart";
import { Chip, EmptyState, Meta, Stat, SubStat, Tile, TileHeader, pct } from "@/components/nu";
import { formatDay } from "@/components/plan/format";
import { cn } from "@/lib/utils";

const MasteryTrendChart = lazy(() =>
  import("./mastery-trend-chart").then((m) => ({ default: m.MasteryTrendChart })),
);

export function MasteryTrendTile({ points, className }: { points: MasteryTrendPoint[]; className?: string }) {
  const data: ChartPoint[] = points.map((p) => ({
    date: p.date,
    label: formatDay(p.date).slice(4), // "29 Sep"
    value: Math.round(p.mastery * 100),
    isDemo: p.isDemo,
  }));
  const hasDemo = points.some((p) => p.isDemo);
  const last = points.at(-1);
  const first = points[0];
  const delta = last && first ? last.mastery - first.mastery : 0;

  return (
    <Tile className={cn("gap-4", className)}>
      <TileHeader
        label="Mastery trend"
        right={
          <>
            {hasDemo && <Chip tone="neutral">demo data</Chip>}
            <Meta>{points.length > 0 ? `${points.length}D` : "14D"}</Meta>
          </>
        }
      />
      {!last ? (
        <EmptyState
          className="flex-1 py-8"
          title="No mastery history yet"
          description="Answer the diagnostic or finish a session — every answer adds a point here."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Stat value={pct(last.mastery)} unit="%" size="md" />
            {points.length > 1 && (
              <SubStat className="text-[13px] text-muted-foreground">
                {delta >= 0 ? "+" : "−"}
                {pct(Math.abs(delta))} pts since {formatDay(first.date).slice(4)}
              </SubStat>
            )}
          </div>
          <div className="h-[180px] w-full" aria-hidden>
            <Suspense fallback={null}>
              <MasteryTrendChart data={data} />
            </Suspense>
          </div>
          <table className="sr-only">
            <caption>Mastery by day{hasDemo ? " (includes demo data)" : ""}</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Mastery</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>
                    {d.value}%{d.isDemo ? " (demo data)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Meta className="text-[11px]">Weightage-weighted average of concept mastery, end of each day.</Meta>
        </>
      )}
    </Tile>
  );
}
