"use client";
// "Why this?" — the score breakdown behind a recommendation (USP 1: explainable, no LLM).
import { useId, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DotBar, Label, Meta } from "@/components/nu";
import { cn } from "@/lib/utils";
import { PRIORITY_WEIGHTS } from "@/lib/engine/constants";
import type { ComponentKey, ScoreComponents } from "@/lib/engine/types";

const ROWS: Array<{ key: ComponentKey; label: string; hint: string }> = [
  { key: "weightage", label: "Weightage", hint: "share of exam marks" },
  { key: "gap", label: "Gap", hint: "1 − mastery" },
  { key: "unlock", label: "Unlock", hint: "topics it unblocks" },
  { key: "mistakeRate", label: "Mistakes", hint: "recent + recurring" },
  { key: "decay", label: "Decay", hint: "forgotten since practice" },
];

const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
/** Bars share one absolute scale: a full bar = the largest possible contribution. */
const MAX_WEIGHT = Math.max(...Object.values(PRIORITY_WEIGHTS));

export function WhyThis({
  components,
  contributions,
  conceptName,
}: {
  components: ScoreComponents;
  contributions: ScoreComponents;
  conceptName: string;
}) {
  const value = ROWS.reduce((s, r) => s + (contributions[r.key] ?? 0), 0);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // Inline disclosure inside the tile (a floating popover flipped over the title and nav).
  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="-ml-2.5 self-start text-muted-foreground hover:text-foreground"
      >
        <Info strokeWidth={1.5} aria-hidden />
        Why this?
        <ChevronDown
          className={cn("transition-transform", open && "rotate-180")}
          strokeWidth={1.5}
          aria-hidden
        />
      </Button>
      {open && (
        <div
          id={panelId}
          className="flex max-w-xl flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4 sm:p-5 animate-in fade-in duration-150 motion-reduce:animate-none"
        >
          <div className="flex flex-col gap-1">
            <Label>Why {conceptName}?</Label>
            <p className="text-sm text-muted-foreground">
              value = Σ weight × component. The highest value per minute wins.
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {ROWS.map((row) => {
              const w = PRIORITY_WEIGHTS[row.key];
              const v = components[row.key] ?? 0;
              const c = contributions[row.key] ?? 0;
              return (
                <li key={row.key} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm font-medium">{row.label}</span>
                      <span className="nu-meta truncate text-[11px]">{row.hint}</span>
                    </span>
                    <span className="nu-meta shrink-0 tabular-nums text-foreground">
                      {w.toFixed(2)} × {f2(v)} = <span className="font-semibold">{f2(c)}</span>
                    </span>
                  </div>
                  <DotBar value={c / MAX_WEIGHT} segments={16} label={`${row.label} contribution ${f2(c)}`} />
                </li>
              );
            })}
          </ul>

          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <Label>Value</Label>
            <span className="nu-substat tabular-nums">{f2(value)}</span>
          </div>
          <Meta className="text-[11px] leading-relaxed">
            Calculated by the study engine from your mastery, exam weightage and deadline, not by AI
            guesswork.
          </Meta>
        </div>
      )}
    </div>
  );
}
