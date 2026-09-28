// Small pure helpers shared by the engine modules (numbers + copy formatting).

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Nearest multiple of 5 (half up). */
export function round5(x: number): number {
  return Math.round(x / 5) * 5;
}

/** Largest multiple of 5 ≤ x. */
export function floor5(x: number): number {
  return Math.floor(x / 5) * 5;
}

/** Non-negative whole minutes; NaN/Infinity → 0. */
export function wholeMinutes(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
}

/** "32%" — no space, as used in every engine reason string. */
export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** Weightage share as a percentage; tiny non-zero shares read "<1%" instead of "0%". */
export function sharePct(x: number): string {
  return x > 0 && x < 0.005 ? "<1%" : pct(x);
}

/** "1 day" / "3 days". */
export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** Locale-independent, case-insensitive name order (engine output must not depend on ICU). */
export function compareNames(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  if (a !== b) return a < b ? -1 : 1;
  return 0;
}

/** "12% of PYQ marks" (pyq) or "~12% of marks, estimated" — estimated numbers always say so. */
export function weightageShare(weightage: number, source: "pyq" | "estimated"): string {
  return source === "pyq"
    ? `${sharePct(weightage)} of PYQ marks`
    : `~${sharePct(weightage)} of marks, estimated`;
}
