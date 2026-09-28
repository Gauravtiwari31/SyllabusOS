"use client";
// MASTERY TREND — weightage-weighted mastery per day. Monochrome line, one accent
// dot on today's value, dotted grid. Seeded history is flagged as demo data.
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { MasteryTrendPoint } from "@/lib/types";
import { Chip, EmptyState, Meta, Stat, SubStat, Tile, TileHeader, pct } from "@/components/nu";
import { formatDay } from "@/components/plan/format";
import { cn } from "@/lib/utils";

interface ChartPoint {
  date: string;
  label: string;
  value: number;
  isDemo: boolean;
}

const TICK = { fill: "var(--nu-dim)", fontSize: 11, fontFamily: "var(--ui-font)" };

function TrendTooltip({ active, payload }: Pick<TooltipContentProps, "active" | "payload">) {
  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="flex flex-col gap-1 rounded-[var(--nu-radius-sm)] border border-border bg-popover px-3 py-2">
      <Meta className="text-[11px]">{formatDay(point.date)}</Meta>
      <span className="text-base font-semibold leading-none tabular-nums">{point.value}%</span>
      {point.isDemo && <Meta className="text-[10px]">demo data</Meta>}
    </div>
  );
}

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
  const lastIndex = data.length - 1;

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
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--nu-line)" strokeDasharray="2 4" />
                <XAxis
                  dataKey="label"
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 50, 100]}
                  tick={TICK}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  content={TrendTooltip}
                  cursor={{ stroke: "var(--nu-line)", strokeWidth: 1 }}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: "var(--foreground)", stroke: "var(--nu-tile)", strokeWidth: 2 }}
                  dot={({ cx, cy, index }) =>
                    index === lastIndex && cx != null && cy != null ? (
                      <circle
                        key="last"
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill="var(--nu-accent)"
                        stroke="var(--nu-tile)"
                        strokeWidth={2}
                      />
                    ) : null
                  }
                />
              </LineChart>
            </ResponsiveContainer>
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
