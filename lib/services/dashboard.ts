// Server-side data for the dashboard, plan, revision and settings screens.
// Built on lib/services/core.ts; never imported by client components.
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import type { Goal } from "@/lib/generated/prisma/client";
import { aiMode } from "@/lib/ai";
import { getCurrentGoal, requireUser, type SessionUser } from "@/lib/session";
import { buildSchedule, isoDay, recommendNext, unitMastery } from "@/lib/engine";
import {
  getGraphData,
  loadEngineConcepts,
  getMasteryTrend,
  toGoalSummary,
  weakestTopics,
} from "@/lib/services/core";
import type { DashboardData, DashboardStats, GoalStatus } from "@/lib/types";
import type { PlanUpdate } from "@/components/plan/types";
import type { SettingsData } from "@/components/settings/types";

/** Same window core.ts uses for the MistakeRate component. */
const RECENT_MISTAKE_DAYS = 14;
const DAY_MS = 86_400_000;

/** Where a goal in each status should send the student. */
export function goalHome(goal: { id: string; status: GoalStatus }): string {
  if (goal.status === "draft") return `/goal/${goal.id}/setup`;
  if (goal.status === "diagnosing") return `/goal/${goal.id}/diagnostic`;
  return "/dashboard";
}

/**
 * Routing guard for /dashboard, /plan and /revision: the current goal must have
 * finished onboarding. Otherwise send the student to the step they are on.
 */
export async function requireActiveGoal(): Promise<{ user: SessionUser; goal: Goal }> {
  const user = await requireUser();
  const goal = await getCurrentGoal(user.id);
  if (!goal) redirect("/goal/new");
  if (goal.status !== "active") redirect(goalHome(goal));
  return { user, goal };
}

/** Unresolved mistakes per concept in the recent window (for "weakest 3"). */
async function recentMistakeCounts(goalId: string, now: Date): Promise<Map<string, number>> {
  const since = new Date(now.getTime() - RECENT_MISTAKE_DAYS * DAY_MS);
  const rows = await db.mistake.groupBy({
    by: ["conceptId"],
    where: { goalId, resolved: false, createdAt: { gte: since } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.conceptId, r._count._all]));
}

async function sessionAggregates(goalId: string) {
  const [completed, minutes] = await Promise.all([
    db.session.count({ where: { goalId, status: "completed" } }),
    db.session.findMany({
      where: { goalId, status: "completed" },
      select: { actualMin: true, plannedMin: true },
    }),
  ]);
  // A completed session without a measured duration counts its planned minutes.
  const minutesStudied = minutes.reduce((s, x) => s + (x.actualMin ?? x.plannedMin), 0);
  return { completed, minutesStudied };
}

/** Everything the dashboard renders, in one round of parallel queries. */
export async function getDashboardData(goal: Goal, now: Date = new Date()): Promise<DashboardData> {
  const [plan, graph, trend, mistakesByConcept, sessions, openMistakes] = await Promise.all([
    getPlanState(goal, now),
    getGraphData(goal.id, now),
    getMasteryTrend(goal.id, 14, now),
    recentMistakeCounts(goal.id, now),
    sessionAggregates(goal.id),
    db.mistake.count({ where: { goalId: goal.id, resolved: false } }),
  ]);

  const stats: DashboardStats = {
    overallMastery:
      graph.nodes.length > 0
        ? unitMastery(graph.nodes.map((n) => ({ mastery: n.mastery, weightage: n.weightage })))
        : 0,
    conceptsTotal: graph.nodes.length,
    conceptsStrong: graph.nodes.filter((n) => n.band === "strong").length,
    conceptsUnknown: graph.nodes.filter((n) => n.band === "unknown").length,
    sessionsCompleted: sessions.completed,
    minutesStudied: sessions.minutesStudied,
    openMistakes,
  };

  return {
    goal: toGoalSummary(goal, now),
    recommendation: plan.recommendation,
    schedule: plan.schedule,
    graph,
    weakest: weakestTopics(graph, mistakesByConcept, 3),
    trend,
    stats,
    aiMode: aiMode(),
  };
}

/** Schedule + Study Now from ONE concept load (plan page and re-plan actions). */
export async function getPlanState(goal: Goal, now: Date = new Date()): Promise<PlanUpdate> {
  const concepts = await loadEngineConcepts(goal.id, now);
  const input = {
    concepts,
    minutesPerDay: goal.minutesPerDay,
    examDate: goal.examDate,
    now,
    skipDates: goal.skipDates,
  };
  return {
    schedule: buildSchedule(input),
    recommendation: recommendNext(input),
    minutesPerDay: goal.minutesPerDay,
    skippedToday: goal.skipDates.includes(isoDay(now)),
  };
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function getSettingsData(userId: string, now: Date = new Date()): Promise<SettingsData> {
  const [user, goals] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, isGuest: true, hinglish: true, image: true },
    }),
    db.goal.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { concepts: true } } },
    }),
  ]);
  // Newest updatedAt = current goal (same rule as getCurrentGoal).
  const current = goals[0] ?? null;
  return {
    user,
    current: current ? toGoalSummary(current, now) : null,
    goals: goals.map((g) => ({
      id: g.id,
      subject: g.subject,
      examDate: g.examDate.toISOString(),
      status: g.status,
      isDemo: g.isDemo,
      isCurrent: g.id === current?.id,
      conceptCount: g._count.concepts,
    })),
  };
}
