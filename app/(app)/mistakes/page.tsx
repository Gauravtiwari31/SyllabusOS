import type { Metadata } from "next";
import { PageHeader } from "@/components/nu";
import { MistakeLog } from "@/components/mistakes/mistake-log";
import { requireActiveGoal } from "@/lib/services/dashboard";
import { getMistakeLog } from "@/lib/services/mistakes";

// AI calls (with model fallback) run in this route and its server actions; Vercel default is lower.
export const maxDuration = 60;

export const metadata: Metadata = { title: "Mistakes" };

export default async function MistakesPage() {
  const { user, goal } = await requireActiveGoal();
  const data = await getMistakeLog(user.id, goal.id);
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow="Mistake log"
        title="Your mistakes"
        description="Every wrong answer is kept with the misconception behind it. A misconception that keeps coming back raises that topic's priority until you resolve it."
      />
      <MistakeLog data={data} />
    </div>
  );
}
