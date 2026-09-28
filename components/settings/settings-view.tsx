"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LogOut, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteGoal, makeGoalCurrent, setHinglish, signOutAction, updateGoalSettings } from "@/app/actions/settings";
import { Tile, TileHeader } from "@/components/nu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { examDateInputValue, formatExamDate } from "@/components/plan/format";
import { FontPicker } from "./font-picker";
import { goalSettingsSchema, MINUTES_PER_DAY } from "./goal-schema";
import type { SettingsData } from "./types";

const STATUS_LABEL = { draft: "Setting up", diagnosing: "Diagnostic", active: "Active" } as const;

function GoalForm({ current }: { current: NonNullable<SettingsData["current"]> }) {
  const [subject, setSubject] = useState(current.subject);
  const [examDate, setExamDate] = useState(examDateInputValue(current.examDate));
  const [minutes, setMinutes] = useState(String(current.minutesPerDay));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = goalSettingsSchema.safeParse({ subject, examDate, minutesPerDay: Number(minutes) });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the fields");
    setError(null);
    start(async () => {
      const r = await updateGoalSettings(current.id, parsed.data);
      if (!r.ok) return setError(r.error);
      toast.success("Saved. Your plan has been rebuilt.");
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exam">Exam date</Label>
          <Input id="exam" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minutes">Minutes per day</Label>
          <Input
            id="minutes"
            type="number"
            inputMode="numeric"
            min={MINUTES_PER_DAY.min}
            max={MINUTES_PER_DAY.max}
            step={MINUTES_PER_DAY.step}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--nu-accent-hover)]">
          {error}
        </p>
      )}
      <Button type="submit" className="self-start" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

export function SettingsView({ data }: { data: SettingsData }) {
  const router = useRouter();
  const [hinglish, setHinglishState] = useState(data.user.hinglish);
  const [pending, start] = useTransition();

  const toggleHinglish = (on: boolean) => {
    setHinglishState(on);
    start(async () => {
      const r = await setHinglish(on);
      if (!r.ok) {
        setHinglishState(!on);
        toast.error(r.error);
      }
    });
  };

  const switchTo = (id: string) =>
    start(async () => {
      const r = await makeGoalCurrent(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Switched to ${r.data.subject}`);
      router.push(r.data.home);
    });

  const remove = (id: string) =>
    start(async () => {
      const r = await deleteGoal(id);
      if (r && !r.ok) return void toast.error(r.error);
      toast.success("Subject deleted");
      router.refresh();
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <Tile>
          <TileHeader label="Current subject" />
          {data.current ? (
            <GoalForm key={data.current.id} current={data.current} />
          ) : (
            <p className="text-sm text-muted-foreground">No subject yet.</p>
          )}
        </Tile>

        <Tile>
          <TileHeader
            label="Your subjects"
            right={
              <Button asChild size="sm" variant="outline">
                <Link href="/goal/new">
                  <Plus data-icon="inline-start" />
                  New subject
                </Link>
              </Button>
            }
          />
          <ul className="flex flex-col">
            {data.goals.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 border-t border-border py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {g.subject}
                    {g.isDemo && <span className="ml-2 text-xs font-normal text-muted-foreground">Demo data</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABEL[g.status]} · exam {formatExamDate(g.examDate)} · {g.conceptCount} concepts
                  </p>
                </div>
                {g.isCurrent ? (
                  <span className="text-xs font-medium text-muted-foreground">Current</span>
                ) : (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => switchTo(g.id)}>
                    Switch
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${g.subject}`} disabled={pending}>
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {g.subject}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes its concept graph, uploads, sessions, mastery history and mistakes. It can’t be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => remove(g.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        </Tile>
      </div>

      <div className="flex flex-col gap-4">
        <Tile>
          <TileHeader label="Interface font" />
          <FontPicker />
          <p className="text-xs text-muted-foreground">Saved in this browser. Numbers keep the dot-matrix face.</p>
        </Tile>
        <Tile>
          <TileHeader label="Tutor language" />
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="hinglish-setting" className="text-sm font-medium">
              Explain in Hinglish
            </Label>
            <Switch id="hinglish-setting" checked={hinglish} onCheckedChange={toggleHinglish} disabled={pending} />
          </div>
          <p className="text-xs text-muted-foreground">Technical terms stay in English.</p>
        </Tile>
        <Tile>
          <TileHeader label="Account" />
          <p className="font-medium">{data.user.name ?? "Student"}</p>
          <p className="text-sm text-muted-foreground">
            {data.user.isGuest
              ? "Guest account. It is deleted automatically 7 days after it was created, and can't be reopened after you sign out."
              : data.user.email}
          </p>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm" className="mt-1">
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </Tile>
      </div>
    </div>
  );
}
