// A day's blocks: kind chip · concept · minutes · reason. Presentational.
import Link from "next/link";
import type { PlanBlock, PlanBlockKind } from "@/lib/engine/types";
import { Chip } from "@/components/nu";
import { cn } from "@/lib/utils";

export const BLOCK_LABEL: Record<PlanBlockKind, string> = {
  learn: "LEARN",
  practice: "PRACTICE",
  revision: "REVISION",
};

const FALLBACK_NAME: Record<PlanBlockKind, string> = {
  learn: "New concept",
  practice: "Mixed practice",
  revision: "Quick review",
};

export function PlanBlockList({
  blocks,
  density = "comfortable",
  className,
}: {
  blocks: PlanBlock[];
  /** "compact" hides reasons (upcoming-day tiles). */
  density?: "comfortable" | "compact";
  className?: string;
}) {
  const compact = density === "compact";
  return (
    <ol className={cn("flex flex-col", compact ? "gap-2" : "divide-y divide-border", className)}>
      {blocks.map((b, i) => {
        const name = b.conceptName ?? FALLBACK_NAME[b.kind];
        return (
          <li
            key={`${b.kind}-${b.conceptId ?? "none"}-${i}`}
            className={cn("flex min-w-0 flex-col gap-1", !compact && "py-3 first:pt-0 last:pb-0")}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Chip
                tone="neutral"
                className={cn(
                  "w-[76px] shrink-0 justify-center px-0 text-[10px]",
                  b.kind === "learn" && "border-foreground/40 text-foreground",
                )}
              >
                {BLOCK_LABEL[b.kind]}
              </Chip>
              {b.conceptId ? (
                <Link
                  href={`/learn/${b.conceptId}`}
                  className="min-w-0 truncate text-sm font-medium underline-offset-4 hover:underline"
                >
                  {name}
                </Link>
              ) : (
                <span className="min-w-0 truncate text-sm font-medium">{name}</span>
              )}
              <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">
                {b.minutes}
                <span className="ml-0.5 text-[11px] text-[var(--nu-dim)]">min</span>
              </span>
            </div>
            {!compact && b.reason && (
              <p className="pl-[86px] text-[13px] leading-snug text-muted-foreground max-sm:pl-0">{b.reason}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
