// Server-side auth + ownership guards used by pages and server actions.
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export type SessionUser = { id: string; name: string | null; email: string | null; isGuest: boolean };

/** Current user or null. */
export async function getUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { id, name, email, isGuest } = session.user;
  return { id, name: name ?? null, email: email ?? null, isGuest };
}

/** Current user, or redirect to /login. Use in pages and server actions. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  // Guard against a JWT whose user row was deleted (e.g. DB reset).
  const exists = await db.user.findUnique({ where: { id: user.id }, select: { id: true } });
  if (!exists) redirect("/login?expired=1");
  return user;
}

/** Goal owned by the current user, or 404. */
export async function requireGoal(goalId: string) {
  const user = await requireUser();
  const goal = await db.goal.findFirst({ where: { id: goalId, userId: user.id } });
  if (!goal) notFound();
  return { user, goal };
}

/** Most recently updated goal of the current user (null if none yet). */
export async function getCurrentGoal(userId: string) {
  return db.goal.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
}
