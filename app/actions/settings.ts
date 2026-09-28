"use server";
// Settings: goal fields, Hinglish toggle, goal switching/deletion, sign out.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signOut } from "@/auth";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { blobEnabled } from "@/lib/env";
import { getCurrentGoal, requireUser } from "@/lib/session";
import { isoDay } from "@/lib/engine";
import { goalHome } from "@/lib/services/dashboard";
import { toGoalSummary } from "@/lib/services/core";
import type { ActionResult, GoalSummary } from "@/lib/types";
import { goalSettingsSchema } from "@/components/settings/goal-schema";

const goalIdSchema = z.string().min(1).max(64);

/** Everything on screen depends on the current goal, so refresh the whole app shell. */
function revalidateApp() {
  revalidatePath("/", "layout");
}

/** yyyy-mm-dd → Date at 12:00 UTC, so the calendar day survives any server timezone. */
function examDateFromDay(day: string): Date | null {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export async function updateGoalSettings(
  goalId: string,
  input: { subject: string; examDate: string; minutesPerDay: number },
): Promise<ActionResult<GoalSummary>> {
  const id = goalIdSchema.safeParse(goalId);
  const parsed = goalSettingsSchema.safeParse(input);
  if (!id.success || !parsed.success) {
    return { ok: false, error: parsed.success ? "Invalid goal" : (parsed.error.issues[0]?.message ?? "Invalid input") };
  }

  const examDate = examDateFromDay(parsed.data.examDate);
  if (!examDate) return { ok: false, error: "Pick a valid exam date" };
  if (parsed.data.examDate < isoDay(new Date())) return { ok: false, error: "Exam date must be today or later" };

  const user = await requireUser();
  const goal = await db.goal.findFirst({ where: { id: id.data, userId: user.id }, select: { id: true } });
  if (!goal) return { ok: false, error: "Goal not found" };

  try {
    const updated = await db.goal.update({
      where: { id: goal.id },
      data: { subject: parsed.data.subject, examDate, minutesPerDay: parsed.data.minutesPerDay },
    });
    revalidateApp();
    return { ok: true, data: toGoalSummary(updated) };
  } catch (err) {
    console.error("updateGoalSettings failed", err);
    return { ok: false, error: "Couldn't save the goal. Try again." };
  }
}

/** Tutor explanations in Hinglish (technical terms stay in English). */
export async function setHinglish(enabled: boolean): Promise<ActionResult<{ hinglish: boolean }>> {
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) return { ok: false, error: "Invalid value" };
  const user = await requireUser();
  try {
    const updated = await db.user.update({
      where: { id: user.id },
      data: { hinglish: parsed.data },
      select: { hinglish: true },
    });
    revalidatePath("/settings");
    return { ok: true, data: updated };
  } catch (err) {
    console.error("setHinglish failed", err);
    return { ok: false, error: "Couldn't save the language setting." };
  }
}

/** The current goal is the most recently updated one — touching updatedAt switches to it. */
export async function makeGoalCurrent(goalId: string): Promise<ActionResult<{ home: string; subject: string }>> {
  const id = goalIdSchema.safeParse(goalId);
  if (!id.success) return { ok: false, error: "Invalid goal" };
  const user = await requireUser();
  const goal = await db.goal.findFirst({ where: { id: id.data, userId: user.id }, select: { id: true } });
  if (!goal) return { ok: false, error: "Goal not found" };

  try {
    const updated = await db.goal.update({
      where: { id: goal.id },
      data: { updatedAt: new Date() },
      select: { id: true, status: true, subject: true },
    });
    revalidateApp();
    return { ok: true, data: { home: goalHome(updated), subject: updated.subject } };
  } catch (err) {
    console.error("makeGoalCurrent failed", err);
    return { ok: false, error: "Couldn't switch goals. Try again." };
  }
}

/**
 * Delete a goal and everything under it (cascade). Deleting the current goal
 * redirects to /dashboard (which routes to the next goal's step, or /goal/new).
 */
export async function deleteGoal(goalId: string): Promise<ActionResult> {
  const id = goalIdSchema.safeParse(goalId);
  if (!id.success) return { ok: false, error: "Invalid goal" };
  const user = await requireUser();
  const [goal, current] = await Promise.all([
    db.goal.findFirst({ where: { id: id.data, userId: user.id }, select: { id: true } }),
    getCurrentGoal(user.id),
  ]);
  if (!goal) return { ok: false, error: "Goal not found" };

  // Uploaded PDFs (if archived to Blob) are deleted with the goal, not left orphaned.
  const blobs = await db.resource.findMany({
    where: { goalId: goal.id, blobUrl: { not: null } },
    select: { blobUrl: true },
  });
  try {
    await db.goal.delete({ where: { id: goal.id } });
  } catch (err) {
    console.error("deleteGoal failed", err);
    return { ok: false, error: "Couldn't delete the goal. Try again." };
  }

  const urls = blobs.map((b) => b.blobUrl).filter((u): u is string => Boolean(u));
  if (urls.length > 0 && blobEnabled()) {
    await del(urls).catch((e) => console.warn("[settings] blob delete failed", e));
  }

  revalidateApp();
  // redirect() throws, so it must stay outside the try/catch above.
  if (current?.id === goal.id) redirect("/dashboard");
  return { ok: true, data: undefined };
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
