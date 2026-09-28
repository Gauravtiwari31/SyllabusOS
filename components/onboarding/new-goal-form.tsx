"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { createGoalAction } from "@/app/actions/onboarding";
import { DotLoader } from "@/components/nu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { addDaysIso, GOAL_MINUTES, makeGoalSchema } from "./goal-schema";

export function NewGoalForm() {
  const router = useRouter();
  const minIso = useMemo(() => addDaysIso(new Date(), 1), []);
  const [subject, setSubject] = useState("");
  const [examDate, setExamDate] = useState(() => addDaysIso(new Date(), 30));
  const [minutes, setMinutes] = useState<number>(GOAL_MINUTES.default);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = makeGoalSchema(minIso).safeParse({ subject, examDate, minutesPerDay: minutes });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the fields.");
    setError(null);
    start(async () => {
      const r = await createGoalAction(parsed.data);
      if (!r.ok) return setError(r.error);
      router.push(`/goal/${r.data.goalId}/setup`);
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          placeholder="e.g. Database Management Systems"
          value={subject}
          maxLength={120}
          autoFocus
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exam">Exam date</Label>
        <Input id="exam" type="date" min={minIso} value={examDate} onChange={(e) => setExamDate(e.target.value)} className="sm:max-w-xs" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="minutes">Study time per day</Label>
          <span className="text-sm font-semibold tabular-nums">{minutes} min</span>
        </div>
        <Slider
          id="minutes"
          min={GOAL_MINUTES.min}
          max={GOAL_MINUTES.max}
          step={GOAL_MINUTES.step}
          value={[minutes]}
          onValueChange={(v) => setMinutes(v[0] ?? GOAL_MINUTES.default)}
          aria-label="Study minutes per day"
        />
        <p className="text-xs text-muted-foreground">You can change this any time; the plan rebuilds instantly.</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--nu-accent-hover)]">
          {error}
        </p>
      )}
      <Button type="submit" variant="accent" size="lg" className="self-start" disabled={pending}>
        {pending ? <DotLoader label="Creating" /> : "Continue"}
        {!pending && <ArrowRight data-icon="inline-end" />}
      </Button>
    </form>
  );
}
