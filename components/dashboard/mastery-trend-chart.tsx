"use client";
// The Recharts line for the mastery trend tile. Its own module so the tile can load it lazily:
// Recharts is one of the largest client dependencies and the chart sits below the fold.
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
import { Meta } from "@/components/nu";
import { formatDay } from "@/components/plan/format";

export interface ChartPoint {
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

export function MasteryTrendChart({ data }: { data: ChartPoint[] }) {
  const lastIndex = data.length - 1;
  return (
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
  );
}
