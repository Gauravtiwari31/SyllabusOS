// Calendar-day arithmetic in the caller's local calendar (same convention as isoDay and
// lib/services/core daysUntil). Never reads the clock: every Date comes from the caller.

const DAY_MS = 86_400_000;

/** yyyy-mm-dd for a Date in the server's local calendar. */
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Same local clock time, `n` calendar days later (DST-safe: steps calendar days, not 24 h). */
export function addDays(d: Date, n: number): Date {
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + n,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
}

/** Whole calendar days from `now` until the exam day (the exam day itself excluded); ≥ 0. */
export function daysLeftUntil(examDate: Date, now: Date): number {
  const diff = startOfDay(examDate).getTime() - startOfDay(now).getTime();
  return Math.max(0, Math.round(diff / DAY_MS));
}
