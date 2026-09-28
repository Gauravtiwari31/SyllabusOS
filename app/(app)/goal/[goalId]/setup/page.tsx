import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/nu";
import { SetupFlow } from "@/components/onboarding/setup-flow";
import { getSetupState } from "@/lib/services/onboarding";
import { requireGoal } from "@/lib/session";

// AI calls (with model fallback) run in this route and its server actions; Vercel default is lower.
export const maxDuration = 60;

export const metadata: Metadata = { title: "Set up your subject" };

export default async function SetupPage({ params }: PageProps<"/goal/[goalId]/setup">) {
  const { goalId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(goalId)) notFound();
  const { goal } = await requireGoal(goalId);
  if (goal.status === "active") redirect("/dashboard");
  const state = await getSetupState(goal);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 sm:gap-6">
      <PageHeader eyebrow="Set up" title={goal.subject} description="A few minutes now, and every study session after this is planned for you." />
      <SetupFlow state={state} />
    </div>
  );
}
