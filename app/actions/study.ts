"use server";
// Study Now / Today's Plan / Revision actions. Every change re-runs the pure
// engine and returns the new plan so the client re-renders without a refetch.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { loadEngineConcepts } from "@/lib/services/core";
import { getPlanState } from "@/lib/services/dashboard";
import { isoDay, revisionSequence } from "@/lib/engine";
import type { Goal } from "@/lib/generated/prisma/client";
import type { ActionResult, RevisionItem } from "@/lib/types";
import type { PlanUpdate } from "@/components/plan/types";
import { minutesPerDaySchema } from "@/components/settings/goal-schema";

const goalIdSchema = z.string().min(1).max(64);

/** Goal owned by the signed-in user (redirects to /login when signed out). */
async function ownedGoal(goalId: string): Promise<Goal | null> {
  const user = await requireUser();
  return db.goal.findFirst({ where: { id: goalId, userId: user.id } });
}

function revalidateStudyScreens() {
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  revalidatePath("/revision");
}

/** Minutes/day changed → persist and re-plan instantly. */
export async function updateMinutesPerDay(goalId: string, minutes: number): Promise<ActionResult<PlanUpdate>> {
  const parsed = z.object({ goalId: goalIdSchema, minutes: minutesPerDaySchema }).safeParse({ goalId, minutes });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid minutes" };

  const goal = await ownedGoal(parsed.data.goalId);
  if (!goal) return { ok: false, error: "Goal not found" };

  try {
    const updated = await db.goal.update({
      where: { id: goal.id },
      data: { minutesPerDay: parsed.data.minutes },
    });
    const result = await getPlanState(updated, new Date());
    revalidateStudyScreens();
    return { ok: true, data: result };
  } catch (err) {
    console.error("updateMinutesPerDay failed", err);
    return { ok: false, error: "Couldn't re-plan. Try again." };
  }
}

/** Skip (or un-skip) today → its work flows to the following days. */
export async function toggleSkipToday(goalId: string, skip: boolean): Promise<ActionResult<PlanUpdate>> {
  const parsed = z.object({ goalId: goalIdSchema, skip: z.boolean() }).safeParse({ goalId, skip });
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const goal = await ownedGoal(parsed.data.goalId);
  if (!goal) return { ok: false, error: "Goal not found" };

  try {
    const now = new Date();
    const today = isoDay(now);
    const others = goal.skipDates.filter((d) => d !== today);
    const updated = await db.goal.update({
      where: { id: goal.id },
      data: { skipDates: parsed.data.skip ? [...others, today].sort() : others },
    });
    const result = await getPlanState(updated, now);
    revalidateStudyScreens();
    return { ok: true, data: result };
  } catch (err) {
    console.error("toggleSkipToday failed", err);
    return { ok: false, error: "Couldn't update today's plan. Try again." };
  }
}

/** Revision Mode (P1): "I have N minutes before the exam" → ordered sequence. Read-only. */
export async function getRevisionPlan(goalId: string, minutes: number): Promise<ActionResult<RevisionItem[]>> {
  const parsed = z
    .object({ goalId: goalIdSchema, minutes: z.number().int().min(10).max(600) })
    .safeParse({ goalId, minutes });
  if (!parsed.success) return { ok: false, error: "Pick between 10 and 600 minutes" };

  const goal = await ownedGoal(parsed.data.goalId);
  if (!goal) return { ok: false, error: "Goal not found" };

  try {
    const now = new Date();
    const concepts = await loadEngineConcepts(goal.id, now);
    return { ok: true, data: revisionSequence(concepts, parsed.data.minutes, now) };
  } catch (err) {
    console.error("getRevisionPlan failed", err);
    return { ok: false, error: "Couldn't build a revision sequence. Try again." };
  }
}
