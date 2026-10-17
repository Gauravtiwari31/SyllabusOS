"use client";
// Mastery legend for the concept graph. Its own module so screens can show it without
// loading React Flow (components/concept-graph/lazy.tsx loads the canvas on demand).
import "./concept-graph.css";
import { cn } from "@/lib/utils";
import { BAND_LABEL, BAND_VAR } from "@/components/nu";

export function GraphLegend({ className }: { className?: string }) {
  return (
    <div className={cn("sos-graph__legend text-xs text-muted-foreground", className)}>
      {(["weak", "developing", "strong", "unknown"] as const).map((band) => (
        <span key={band} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2 rounded-full"
            style={
              band === "unknown"
                ? { border: `1.5px dashed ${BAND_VAR[band]}` }
                : { background: BAND_VAR[band] }
            }
            aria-hidden
          />
          {BAND_LABEL[band]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-4 rounded-[4px] border border-dashed border-muted-foreground"
          aria-hidden
        />
        Low confidence
      </span>
    </div>
  );
}
