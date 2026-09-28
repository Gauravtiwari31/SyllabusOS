import type { Metadata } from "next";
import { PageHeader } from "@/components/nu";
import { PlanView } from "@/components/plan/plan-view";
import { formatExamDate, plural } from "@/components/plan/format";
import { toGoalSummary } from "@/lib/services/core";
import { getPlanState, requireActiveGoal } from "@/lib/services/dashboard";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage() {
  const { goal } = await requireActiveGoal();
  const now = new Date();
  const initial = await getPlanState(goal, now);
  const summary = toGoalSummary(goal, now);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Plan"
        title={goal.subject}
        description={`Exam ${formatExamDate(summary.examDate)} · ${plural(summary.daysLeft, "day")} left. Change your minutes or skip a day — the plan rebuilds instantly.`}
      />
      <PlanView goalId={goal.id} initial={initial} />
    </div>
  );
}
