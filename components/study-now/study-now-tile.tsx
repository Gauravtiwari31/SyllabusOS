// STUDY NOW — the one decision the product exists to make (P0 #5).
// Presentational: renders on the server (dashboard) or inside client views (plan).
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, Label, MasteryReadout, Meta, Stat, Tile, TileHeader } from "@/components/nu";
import type { Recommendation } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { MODE_LABEL } from "@/components/plan/diff";
import { WhyThis } from "./why-this";
import { bandFrom } from "./band";

export function StudyNowTile({
  recommendation,
  variant = "hero",
  className,
}: {
  recommendation: Recommendation | null;
  /** "hero" = dashboard hero; "compact" = side tile on /plan. */
  variant?: "hero" | "compact";
  className?: string;
}) {
  const hero = variant === "hero";

  if (!recommendation) {
    return (
      <Tile className={className}>
        <TileHeader label="Study now" />
        <EmptyState
          className="flex-1"
          title="Everything is at target mastery"
          description="No concept needs new learning right now. Keep it fresh with a revision sequence."
          action={
            <Button asChild variant="outline">
              <Link href="/revision">Try Revision</Link>
            </Button>
          }
        />
      </Tile>
    );
  }

  const r = recommendation;
  const band = bandFrom(r.mastery, r.confidence);
  const alternatives = r.alternatives.slice(0, 3);

  return (
    <Tile accent className={cn(hero ? "gap-6" : "gap-4", className)} aria-labelledby="study-now-concept">
      <TileHeader
        label="Study now"
        live
        right={
          <>
            <Chip tone="neutral" className="text-xs">
              {MODE_LABEL[r.mode]}
            </Chip>
          </>
        }
      />

      <div className={cn("flex flex-col gap-4", hero && "sm:flex-row sm:items-end sm:justify-between sm:gap-8")}>
        <div className="flex min-w-0 flex-col gap-2">
          <Meta>{r.unit}</Meta>
          <h3
            id="study-now-concept"
            className={cn(
              "font-semibold leading-tight tracking-[-0.01em] text-balance break-words",
              hero ? "text-[28px] sm:text-[40px]" : "text-xl sm:text-2xl",
            )}
          >
            {r.conceptName}
          </h3>
        </div>
        <Stat value={r.minutes} unit="min" size={hero ? "xl" : "md"} className="shrink-0" />
      </div>

      <p className={cn("text-pretty leading-snug", hero ? "text-lg max-w-2xl" : "text-sm text-muted-foreground")}>
        {r.reason}
      </p>

      <WhyThis components={r.components} contributions={r.contributions} conceptName={r.conceptName} />

      {r.gatedFor && (
        <p className="nu-meta">
          You need this before{" "}
          <Link href={`/learn/${r.gatedFor.conceptId}`} className="text-foreground underline-offset-4 hover:underline">
            {r.gatedFor.name}
          </Link>
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button asChild variant="accent" size={hero ? "xl" : "lg"}>
          <Link href={`/learn/${r.conceptId}`}>
            Start session
            <ArrowRight strokeWidth={1.5} data-icon="inline-end" aria-hidden />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Label>Mastery now</Label>
          <MasteryReadout mastery={r.mastery} band={band} confidence={r.confidence} />
        </div>
      </div>

      {hero && alternatives.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Label>Or</Label>
          <ul className="flex flex-col gap-1.5">
            {alternatives.map((alt) => (
              <li key={alt.conceptId} className="min-w-0">
                <Link
                  href={`/learn/${alt.conceptId}`}
                  className="group flex min-w-0 items-baseline gap-2 rounded-md text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="shrink-0 font-medium underline-offset-4 group-hover:underline">{alt.name}</span>
                  <span className="truncate text-muted-foreground">· {alt.reason}</span>
                  <ArrowUpRight
                    strokeWidth={1.5}
                    className="ml-auto size-3.5 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  );
}
