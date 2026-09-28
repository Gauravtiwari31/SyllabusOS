// Shared (client + server) validation for goal settings and minutes/day.
import { z } from "zod";

export const MINUTES_PER_DAY = { min: 15, max: 240, step: 5 } as const;

export const minutesPerDaySchema = z
  .number({ error: "Enter minutes per day" })
  .int("Whole minutes only")
  .min(MINUTES_PER_DAY.min, `At least ${MINUTES_PER_DAY.min} minutes`)
  .max(MINUTES_PER_DAY.max, `At most ${MINUTES_PER_DAY.max} minutes`);

export const goalSettingsSchema = z.object({
  subject: z.string().trim().min(2, "At least 2 characters").max(120, "Keep it under 120 characters"),
  /** yyyy-mm-dd from <input type="date"> */
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an exam date"),
  minutesPerDay: minutesPerDaySchema,
});

export type GoalSettingsInput = z.infer<typeof goalSettingsSchema>;
