import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/nu";
import { DiagnosticRunner } from "@/components/diagnostic/diagnostic-runner";
import { requireGoal } from "@/lib/session";

// AI calls (with model fallback) run in this route and its server actions; Vercel default is lower.
export const maxDuration = 60;

export const metadata: Metadata = { title: "Diagnostic" };

export default async function DiagnosticPage({ params }: PageProps<"/goal/[goalId]/diagnostic">) {
  const { goalId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(goalId)) notFound();
  const { goal } = await requireGoal(goalId);
  if (goal.status === "draft") redirect(`/goal/${goal.id}/setup`);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow="Diagnostic"
        title={`What you already know in ${goal.subject}`}
        description="Answer honestly — a guess that happens to be right teaches the planner the wrong thing. It's fine to skip."
      />
      <DiagnosticRunner goalId={goal.id} />
    </div>
  );
}
