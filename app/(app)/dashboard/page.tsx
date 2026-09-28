import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardData, requireActiveGoal } from "@/lib/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { goal } = await requireActiveGoal();
  const data = await getDashboardData(goal);
  return <DashboardView data={data} />;
}
