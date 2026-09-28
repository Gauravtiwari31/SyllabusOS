// Client-safe view model for the plan screen (returned by app/actions/study.ts).
import type { Recommendation, Schedule } from "@/lib/engine/types";

export interface PlanUpdate {
  schedule: Schedule;
  recommendation: Recommendation | null;
  minutesPerDay: number;
  skippedToday: boolean;
}
