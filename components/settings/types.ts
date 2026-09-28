// Client-safe view models for /settings (built by lib/services/dashboard.ts).
import type { GoalStatus, GoalSummary } from "@/lib/types";

export interface SettingsGoalRow {
  id: string;
  subject: string;
  examDate: string;
  status: GoalStatus;
  isDemo: boolean;
  isCurrent: boolean;
  conceptCount: number;
}

export interface SettingsData {
  user: {
    id: string;
    name: string | null;
    email: string;
    isGuest: boolean;
    hinglish: boolean;
    image: string | null;
  };
  current: GoalSummary | null;
  goals: SettingsGoalRow[];
}
