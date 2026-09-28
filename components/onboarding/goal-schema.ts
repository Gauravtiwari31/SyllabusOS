// Shared (client + server) validation for the "new goal" screen.
import { z } from "zod";

export const GOAL_MINUTES = { min: 15, max: 240, step: 5, default: 60 } as const;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** yyyy-mm-dd → Date at 12:00 UTC, so the calendar day survives any server timezone. Null if invalid. */
export function examDateFromIso(day: string): Date | null {
  if (!ISO_DAY.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/**
 * @param minIso first allowed exam day (yyyy-mm-dd). The client passes its local tomorrow;
 * the server passes a timezone-lenient lower bound.
 */
export function makeGoalSchema(minIso: string) {
  return z.object({
    subject: z
      .string()
      .trim()
      .min(2, "Name the subject (at least 2 characters)")
      .max(120, "Keep it under 120 characters"),
    examDate: z
      .string()
      .regex(ISO_DAY, "Pick your exam date")
      .refine((d) => examDateFromIso(d) !== null, "Pick a valid date")
      .refine((d) => d >= minIso, "The exam date must be in the future")
      .refine((d) => d.slice(0, 4) <= String(Number(minIso.slice(0, 4)) + 3), "That's more than 3 years away"),
    minutesPerDay: z
      .number({ error: "Choose minutes per day" })
      .int("Whole minutes only")
      .min(GOAL_MINUTES.min, `At least ${GOAL_MINUTES.min} minutes`)
      .max(GOAL_MINUTES.max, `At most ${GOAL_MINUTES.max} minutes`),
  });
}

export type GoalFormValues = z.infer<ReturnType<typeof makeGoalSchema>>;

/** yyyy-mm-dd of a Date in the runtime's local timezone. */
export function localIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local yyyy-mm-dd `days` after `d`. */
export function addDaysIso(d: Date, days: number): string {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return localIsoDay(next);
}
