// WEAKEST 3 — lowest mastery concepts with evidence, each one click from a session.
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { WeakTopic } from "@/lib/types";
import { DotBar, EmptyState, MasteryReadout, Meta, Tile, TileHeader, pct } from "@/components/nu";
import { bandFrom } from "@/components/study-now/band";
import { plural } from "@/components/plan/format";
import { cn } from "@/lib/utils";

export function WeakestTile({ topics, className }: { topics: WeakTopic[]; className?: string }) {
  return (
    <Tile className={cn("gap-4", className)}>
      <TileHeader label={`Weakest ${topics.length || 3}`} />
      {topics.length === 0 ? (
        <EmptyState className="py-6" title="No concepts yet" />
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {topics.map((t, i) => {
            const band = bandFrom(t.mastery, t.confidence);
            return (
              <li key={t.conceptId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/learn/${t.conceptId}`}
                    className="group flex min-w-0 items-baseline gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="text-[13px] tabular-nums text-muted-foreground" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 text-sm font-medium leading-snug underline-offset-4 group-hover:underline">
                      {t.name}
                    </span>
                    <ArrowUpRight
                      strokeWidth={1.5}
                      className="size-3.5 shrink-0 self-center text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                  <MasteryReadout mastery={t.mastery} band={band} confidence={t.confidence} className="shrink-0" />
                </div>
                <DotBar value={t.mastery} band={band} segments={16} label={`${t.name} mastery`} />
                <Meta className="text-[11px]">
                  {t.recentMistakes > 0 ? `${plural(t.recentMistakes, "recent mistake")}` : "No recent mistakes"} ·{" "}
                  {pct(t.weightage)}% weightage
                </Meta>
              </li>
            );
          })}
        </ol>
      )}
    </Tile>
  );
}
