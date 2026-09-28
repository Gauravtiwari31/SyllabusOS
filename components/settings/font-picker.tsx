"use client";
// Interface font picker: three typefaces that suit the dot-matrix theme. Applies instantly
// and is remembered in this browser (lib/ui-font.ts; applied before paint by app/layout.tsx).
import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyUiFont, readUiFont, subscribeUiFont, UI_FONT_DEFAULT, UI_FONTS, type UiFontId } from "@/lib/ui-font";

const PREVIEW_FAMILY: Record<UiFontId, string> = {
  grotesk: "var(--font-grotesk), system-ui, sans-serif",
  mono: "var(--font-jbmono), ui-monospace, monospace",
  geist: "var(--font-geist), system-ui, sans-serif",
};

export function FontPicker() {
  const font = useSyncExternalStore(subscribeUiFont, readUiFont, () => UI_FONT_DEFAULT);
  const choose = (id: UiFontId) => applyUiFont(id);

  return (
    <div role="radiogroup" aria-label="Interface font" className="grid gap-2">
      {UI_FONTS.map((f) => {
        const on = f.id === font;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => choose(f.id)}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
              on ? "border-foreground bg-accent" : "border-border hover:bg-muted",
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1" style={{ fontFamily: PREVIEW_FAMILY[f.id] }}>
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-base font-semibold">{f.name}</span>
                <span className="font-display text-xl leading-none text-foreground" aria-hidden>
                  43%
                </span>
              </span>
              <span className="text-sm text-muted-foreground">Conflict Serializability · 20 min</span>
              <span className="text-xs text-muted-foreground">{f.note}</span>
            </span>
            <span
              className={cn(
                "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                on ? "border-foreground bg-foreground text-background" : "border-border",
              )}
              aria-hidden
            >
              {on && <Check className="size-3" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
