// NThing UI primitives. Presentational only — every screen composes these.
// Rules: Inter for all UI text, one hero Ndot numeral per tile (only where the number is the
// point), one uppercase tile title, red accent used sparingly and never for good news.
import * as React from "react";
import { cn } from "@/lib/utils";
import type { Confidence, MasteryBand } from "@/lib/engine/types";

// ── helpers ─────────────────────────────────────────────────────────────────
export function pct(x: number, digits = 0): string {
  if (!Number.isFinite(x)) return "–";
  return `${(x * 100).toFixed(digits)}`;
}

export const BAND_VAR: Record<MasteryBand, string> = {
  unknown: "var(--nu-unknown)",
  weak: "var(--nu-weak)",
  developing: "var(--nu-mid)",
  strong: "var(--nu-strong)",
};

export const BAND_LABEL: Record<MasteryBand, string> = {
  unknown: "No data",
  weak: "Weak",
  developing: "Developing",
  strong: "Strong",
};

// ── Tile ────────────────────────────────────────────────────────────────────
export function Tile({
  className,
  accent,
  flush,
  as: Comp = "section",
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  accent?: boolean;
  flush?: boolean;
  as?: "section" | "div" | "article" | "aside" | "li";
}) {
  return (
    <Comp
      className={cn("nu-tile", accent && "nu-tile--accent", flush && "nu-tile--flush", className)}
      {...props}
    />
  );
}

export function TileHeader({
  label,
  right,
  live,
  className,
}: {
  label: React.ReactNode;
  right?: React.ReactNode;
  /** red marker dot before the label — marks the one thing to act on */
  live?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-2 min-w-0">
        {live && <span className="nu-dot size-1.5" aria-hidden />}
        <h2 className="nu-label truncate">{label}</h2>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}

// ── Numerals ────────────────────────────────────────────────────────────────
export function Stat({
  value,
  unit,
  accent,
  size = "lg",
  className,
}: {
  value: React.ReactNode;
  unit?: React.ReactNode;
  accent?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = { sm: "text-[28px]", md: "text-[40px]", lg: "text-[56px]", xl: "text-[80px] sm:text-[96px]" };
  return (
    <div className={cn("flex items-baseline gap-1.5", className)}>
      <span className={cn("nu-stat", sizes[size], accent && "nu-stat--accent")}>{value}</span>
      {unit && <span className="text-[13px] font-medium text-[var(--nu-dim)]">{unit}</span>}
    </div>
  );
}

export function SubStat({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("nu-substat", className)} {...props} />;
}

export function Meta({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("nu-meta", className)} {...props} />;
}

export function Label({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("nu-label", className)} {...props} />;
}

// ── Chips & dots ────────────────────────────────────────────────────────────
export function Chip({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "accent" | "neutral" | "weak" | "developing" | "strong" | "unknown";
}) {
  if (tone === "accent") return <span className={cn("nu-chip", className)} {...props} />;
  if (tone === "neutral") return <span className={cn("nu-chip nu-chip--neutral", className)} {...props} />;
  const color = BAND_VAR[tone];
  return (
    <span
      className={cn("nu-chip", className)}
      style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
      {...props}
    />
  );
}

export function Dot({
  band,
  live,
  size = 8,
  dashed,
  className,
}: {
  band?: MasteryBand;
  live?: boolean;
  size?: number;
  /** low-confidence estimate → hollow dashed ring */
  dashed?: boolean;
  className?: string;
}) {
  const color = band ? BAND_VAR[band] : "var(--nu-accent)";
  return (
    <span
      aria-hidden
      className={cn("inline-block rounded-full shrink-0", live && "nu-dot--live", className)}
      style={{
        width: size,
        height: size,
        background: dashed ? "transparent" : color,
        border: dashed ? `1.5px dashed ${color}` : undefined,
      }}
    />
  );
}

/**
 * Segmented dot-matrix progress bar — the signature Nothing meter.
 * `value` 0..1. Filled segments use the tone colour, empty ones a faint dot.
 */
export function DotBar({
  value,
  segments = 20,
  tone = "paper",
  band,
  className,
  label,
}: {
  value: number;
  segments?: number;
  tone?: "paper" | "accent";
  band?: MasteryBand;
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const filled = Math.round(v * segments);
  const color = band ? BAND_VAR[band] : tone === "accent" ? "var(--nu-accent)" : "var(--foreground)";
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
      className={cn("flex items-center gap-[3px]", className)}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="h-[6px] flex-1 rounded-full transition-colors"
          style={{ background: i < filled ? color : "var(--nu-line)" }}
        />
      ))}
    </div>
  );
}

/** Mastery % with band dot; dashed + "low confidence" when evidence is thin. */
export function MasteryReadout({
  mastery,
  band,
  confidence,
  className,
}: {
  mastery: number;
  band: MasteryBand;
  confidence: Confidence;
  className?: string;
}) {
  const unsure = confidence === "none" || confidence === "low";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={`Confidence: ${confidence}`}>
      <Dot band={band} dashed={unsure} />
      <span className="nu-substat text-[15px]">{band === "unknown" ? "--" : `${pct(mastery)}%`}</span>
      {unsure && band !== "unknown" && <span className="nu-meta">low conf.</span>}
    </span>
  );
}

// ── Page scaffolding ────────────────────────────────────────────────────────
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex flex-col gap-2 min-w-0">
        {eyebrow && <span className="nu-label">{eyebrow}</span>}
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.01em] text-balance sm:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-10 text-center", className)}>
      <DotMatrixGlyph />
      <p className="text-base font-semibold">{title}</p>
      {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action}
    </div>
  );
}

/** 5×5 dot glyph used for empty states and loaders. */
export function DotMatrixGlyph({ animate, className }: { animate?: boolean; className?: string }) {
  // a small "diamond" pattern
  const on = new Set([2, 6, 8, 10, 14, 16, 18, 22, 12]);
  return (
    <div className={cn("grid grid-cols-5 gap-[5px]", className)} aria-hidden>
      {Array.from({ length: 25 }, (_, i) => (
        <span
          key={i}
          className={cn("size-[6px] rounded-full", animate && on.has(i) && "nu-dot--live")}
          style={{
            background: i === 12 ? "var(--nu-accent)" : on.has(i) ? "var(--foreground)" : "var(--nu-line)",
            animationDelay: animate ? `${(i % 5) * 120}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}

/** Inline loading indicator: three pulsing dots + optional label. */
export function DotLoader({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} role="status" aria-live="polite">
      <span className="inline-flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-[6px] rounded-full bg-foreground nu-dot--live"
            style={{ animationDelay: `${i * 180}ms` }}
          />
        ))}
      </span>
      {label && <span className="nu-meta">{label}</span>}
    </span>
  );
}

/** "42 % → 61 %" with the delta chip (improvement in the strong colour, never red). */
export function MasteryDelta({ before, after, className }: { before: number; after: number; className?: string }) {
  const d = after - before;
  return (
    <div className={cn("flex items-baseline gap-3", className)}>
      <span className="nu-stat text-[40px] text-[var(--nu-dim)]">{pct(before)}</span>
      <span className="nu-substat text-[var(--nu-dim)]">→</span>
      <span className="nu-stat text-[56px]">{pct(after)}</span>
      <span className="nu-substat">%</span>
      <span
        className="nu-chip"
        style={
          d >= 0
            ? { background: "color-mix(in oklab, var(--nu-strong) 14%, transparent)", color: "var(--nu-strong)" }
            : { background: "transparent", border: "1px solid var(--nu-line)", color: "var(--nu-dim)" }
        }
      >
        {d >= 0 ? "+" : ""}
        {pct(d)} pts
      </span>
    </div>
  );
}
