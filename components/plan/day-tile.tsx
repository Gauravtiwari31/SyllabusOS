// One day of the schedule as a tile. Presentational.
import type { DayPlan } from "@/lib/engine/types";
import { Chip, DotBar, Meta, Tile, TileHeader, pct } from "@/components/nu";
import { cn } from "@/lib/utils";
import { PlanBlockList } from "./plan-block-list";
import { formatDay, plural } from "./format";

export function DayTile({
  day,
  label,
  minutesPerDay,
  density = "compact",
  as = "article",
  className,
}: {
  day: DayPlan;
  /** "TODAY" / "TOMORROW" etc. Falls back to the formatted date. */
  label?: string;
  minutesPerDay: number;
  density?: "comfortable" | "compact";
  as?: "article" | "li";
  className?: string;
}) {
  const fill = minutesPerDay > 0 ? day.totalMinutes / minutesPerDay : 0;
  return (
    <Tile as={as} className={cn("gap-3", day.skipped && "border-dashed", className)}>
      <TileHeader
        label={label ? `${label} · ${formatDay(day.date)}` : formatDay(day.date)}
        right={
          day.skipped ? (
            <Chip tone="neutral">SKIPPED</Chip>
          ) : (
            <Meta className="tabular-nums">
              {day.totalMinutes}/{minutesPerDay} min
            </Meta>
          )
        }
      />
      {day.skipped ? (
        <p className="text-sm text-muted-foreground">Rest day — its work moved to the following days.</p>
      ) : day.blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing planned.</p>
      ) : (
        <>
          <DotBar
            value={fill}
            segments={density === "compact" ? 16 : 24}
            label={`${pct(Math.min(1, fill))}% of the day's minutes planned`}
          />
          <PlanBlockList blocks={day.blocks} density={density} />
          {density === "compact" && <Meta className="text-[11px]">{plural(day.blocks.length, "block")}</Meta>}
        </>
      )}
    </Tile>
  );
}
