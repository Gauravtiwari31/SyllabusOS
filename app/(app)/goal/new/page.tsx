import type { Metadata } from "next";
import { PageHeader, Tile } from "@/components/nu";
import { NewGoalForm } from "@/components/onboarding/new-goal-form";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "New subject" };

export default async function NewGoalPage() {
  await requireUser();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 sm:gap-6">
      <PageHeader
        eyebrow="Step 1 of 4"
        title="What are you preparing for?"
        description="Next you'll add your syllabus. Previous-year papers and notes are optional but make the plan and the tutor much better."
      />
      <Tile>
        <NewGoalForm />
      </Tile>
    </div>
  );
}
