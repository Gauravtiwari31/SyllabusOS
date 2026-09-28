import type { Metadata } from "next";
import { PageHeader } from "@/components/nu";
import { RevisionPlanner } from "@/components/revision/revision-planner";
import { formatExamDate, plural } from "@/components/plan/format";
import { revisionSequence } from "@/lib/engine";
import { loadEngineConcepts, toGoalSummary } from "@/lib/services/core";
import { requireActiveGoal } from "@/lib/services/dashboard";

export const metadata: Metadata = { title: "Revision" };

const DEFAULT_MINUTES = 90;

export default async function RevisionPage() {
  const { goal } = await requireActiveGoal();
  const now = new Date();
  const concepts = await loadEngineConcepts(goal.id, now);
  const items = revisionSequence(concepts, DEFAULT_MINUTES, now);
  const summary = toGoalSummary(goal, now);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Revision mode"
        title="Last-minute revision"
        description={`${goal.subject} · exam ${formatExamDate(summary.examDate)} · ${plural(summary.daysLeft, "day")} left. Tell us how long you have; the engine picks what is weakest, weighs most and has faded most.`}
      />
      <RevisionPlanner goalId={goal.id} initialMinutes={DEFAULT_MINUTES} initialItems={items} />
    </div>
  );
}
