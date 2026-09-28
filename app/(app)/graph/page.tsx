import type { Metadata } from "next";
import { PageHeader } from "@/components/nu";
import { GraphExplorer } from "@/components/graph/graph-explorer";
import { getGraphData, getRecommendation } from "@/lib/services/core";
import { requireActiveGoal } from "@/lib/services/dashboard";

export const metadata: Metadata = { title: "Concept graph" };

export default async function GraphPage() {
  const { goal } = await requireActiveGoal();
  const now = new Date();
  const [data, rec] = await Promise.all([getGraphData(goal.id, now), getRecommendation(goal, now)]);

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow="Concept graph"
        title={goal.subject}
        description="Prerequisites on the left, what they unlock on the right. Colour is your mastery; a dashed outline means the estimate is still based on very few answers."
      />
      <GraphExplorer data={data} recommendedId={rec?.conceptId ?? null} />
    </div>
  );
}
