"use client";
// /goal/[goalId]/setup: syllabus → editable concept graph → confirm; optional past papers
// (real weightage) and notes (tutor grounding); then the diagnostic.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducer, useState, useTransition } from "react";
import { ArrowRight, Check, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  confirmGraphAction,
  deleteNotesAction,
  extractSyllabusAction,
  remapPyqAction,
  uploadNotesAction,
  uploadPyqAction,
} from "@/app/actions/onboarding";
import { skipDiagnostic } from "@/app/actions/diagnostic";
import { ConceptGraph } from "@/components/concept-graph";
import { DotBar, DotLoader, Tile, TileHeader } from "@/components/nu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DraftGraph } from "@/lib/ai/schemas";
import {
  draftReducer,
  draftToGraphData,
  explainCycle,
  groupByUnit,
  newKey,
  nextUnitName,
  unitsOf,
  validateDraft,
} from "./model";
import { UploadField } from "./upload-field";
import type { NotesResourceView, PyqView, SetupState, SetupStep } from "./types";

const STEPS: Array<{ step: SetupStep; label: string }> = [
  { step: 1, label: "Syllabus" },
  { step: 2, label: "Past papers" },
  { step: 3, label: "Notes" },
  { step: 4, label: "Diagnostic" },
];

function Stepper({ step, maxStep, onGo }: { step: SetupStep; maxStep: SetupStep; onGo: (s: SetupStep) => void }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Setup steps">
      {STEPS.map((s) => {
        const done = s.step < step;
        const current = s.step === step;
        const reachable = s.step <= maxStep;
        return (
          <li key={s.step}>
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onGo(s.step)}
              aria-current={current ? "step" : undefined}
              className="flex w-full flex-col gap-1.5 text-left disabled:cursor-default"
            >
              <span className={cn("h-1.5 rounded-full", current ? "bg-nu-accent" : done ? "bg-foreground/60" : "bg-[var(--nu-line)]")} />
              <span className={cn("text-xs", current ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {s.step}. {s.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ── Step 1: draft graph editor ──────────────────────────────────────────────

function PrereqPicker({
  draft,
  conceptKey,
  onToggle,
}: {
  draft: DraftGraph;
  conceptKey: string;
  onToggle: (prereqKey: string) => void;
}) {
  const concept = draft.concepts.find((c) => c.key === conceptKey)!;
  const others = draft.concepts.filter((c) => c.key !== conceptKey);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" aria-label={`Prerequisites of ${concept.name}`}>
          <Link2 data-icon="inline-start" />
          {concept.prereqKeys.length || ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Learn these before “{concept.name}”</p>
        <ul className="max-h-64 overflow-y-auto">
          {others.map((o) => {
            const on = concept.prereqKeys.includes(o.key);
            return (
              <li key={o.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(o.key)}
                  className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted"
                >
                  <span
                    className={cn(
                      "inline-flex size-4 shrink-0 items-center justify-center rounded border",
                      on ? "border-foreground bg-foreground text-background" : "border-border",
                    )}
                    aria-hidden
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function DraftEditor({
  initial,
  locked,
  onConfirmed,
  goalId,
}: {
  initial: DraftGraph;
  locked: boolean;
  goalId: string;
  onConfirmed: (draft: DraftGraph) => void;
}) {
  const [draft, dispatch] = useReducer(draftReducer, initial);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  const issues = validateDraft(draft);
  const units = unitsOf(draft.concepts);
  const grouped = groupByUnit(draft.concepts, units);

  const toggle = (key: string, prereqKey: string) => {
    const on = draft.concepts.find((c) => c.key === key)?.prereqKeys.includes(prereqKey);
    if (!on) {
      const why = explainCycle(draft.concepts, key, prereqKey);
      if (why) return void toast.error(why);
    }
    dispatch({ type: "togglePrereq", key, prereqKey });
  };

  const confirm = () =>
    start(async () => {
      const r = await confirmGraphAction(goalId, draft);
      if (!r.ok) return void toast.error(r.error);
      dispatch({ type: "replace", draft: r.data.draft });
      toast.success("Concept graph saved.");
      onConfirmed(r.data.draft);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {draft.concepts.length} concepts in {units.length} units. Fix names, remove what isn’t examined, and set prerequisites.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => setPreview((v) => !v)}>
          {preview ? "Edit list" : "Preview graph"}
        </Button>
      </div>

      {preview ? (
        <div className="rounded-xl border border-border">
          <ConceptGraph data={draftToGraphData(draft)} height="min(60vh, 520px)" showLegend={false} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(({ unit, concepts }) => (
            <section key={unit} className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Unit name"
                  defaultValue={unit}
                  disabled={locked}
                  maxLength={80}
                  onBlur={(e) => {
                    const to = e.target.value.trim();
                    if (to && to !== unit) dispatch({ type: "renameUnit", from: unit, to });
                  }}
                  className="h-9 font-medium"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete unit ${unit}`}
                  disabled={locked || units.length <= 1}
                  onClick={() => dispatch({ type: "deleteUnit", unit })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {concepts.map((c) => (
                  <li key={c.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <Input
                      aria-label="Concept name"
                      defaultValue={c.name}
                      disabled={locked}
                      maxLength={80}
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (name && name !== c.name) dispatch({ type: "rename", key: c.key, name });
                      }}
                      className="h-9 min-w-0 flex-1 basis-full sm:basis-auto"
                    />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Input
                        aria-label={`Minutes to learn ${c.name}`}
                        type="number"
                        inputMode="numeric"
                        min={5}
                        max={240}
                        defaultValue={c.estMinutes}
                        disabled={locked}
                        onBlur={(e) => {
                          const v = Math.round(Number(e.target.value));
                          if (Number.isFinite(v) && v !== c.estMinutes) dispatch({ type: "update", key: c.key, patch: { estMinutes: v } });
                        }}
                        className="h-9 w-16 text-right tabular-nums"
                      />
                      min
                    </label>
                    {!locked && <PrereqPicker draft={draft} conceptKey={c.key} onToggle={(p) => toggle(c.key, p)} />}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${c.name}`}
                      disabled={locked}
                      onClick={() => dispatch({ type: "delete", key: c.key })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              {!locked && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => dispatch({ type: "add", key: newKey(), unit, name: "New concept" })}
                >
                  <Plus data-icon="inline-start" />
                  Add concept
                </Button>
              )}
            </section>
          ))}
          {!locked && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => dispatch({ type: "add", key: newKey(), unit: nextUnitName(units), name: "New concept" })}
            >
              <Plus data-icon="inline-start" />
              Add unit
            </Button>
          )}
        </div>
      )}

      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-[var(--nu-accent-hover)]" role="alert">
          {issues.slice(0, 4).map((i, n) => (
            <li key={n}>{i.message}</li>
          ))}
        </ul>
      )}
      {!locked && (
        <Button type="button" variant="accent" className="self-start" disabled={pending || issues.length > 0} onClick={confirm}>
          {pending ? <DotLoader label="Saving" /> : "Confirm concept graph"}
        </Button>
      )}
    </div>
  );
}

// ── Step 2: PYQs ────────────────────────────────────────────────────────────

function PyqPanel({ goalId, pyq, onChange }: { goalId: string; pyq: PyqView; onChange: (v: PyqView) => void }) {
  const [pending, start] = useTransition();
  const byWeight = [...pyq.concepts].sort((a, b) => b.weightage - a.weightage);
  const max = byWeight[0]?.weightage || 1;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Weightage from {pyq.questions.length} questions</p>
        <ul className="flex flex-col gap-2">
          {byWeight.slice(0, 12).map((c) => (
            <li key={c.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{Math.round(c.weightage * 100)}%</span>
              </div>
              <DotBar value={c.weightage / max} segments={24} label={`${c.name} weightage`} />
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Check the mapping</p>
        <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
          {pyq.questions.map((q) => (
            <li key={q.id} className="flex flex-col gap-1.5 rounded-xl border border-border p-2.5">
              <p className="text-sm">{q.text}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {q.year && <span>{q.year}</span>}
                {q.marks !== null && <span>{q.marks} marks</span>}
                <select
                  aria-label="Concept for this question"
                  value={q.conceptId ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    start(async () => {
                      const r = await remapPyqAction(goalId, q.id, e.target.value);
                      if (!r.ok) return void toast.error(r.error);
                      onChange(r.data);
                    })
                  }
                  className="ml-auto h-9 max-w-[60%] rounded-lg border border-input bg-background px-2 text-xs text-foreground"
                >
                  {!q.conceptId && <option value="">Unmapped</option>}
                  {pyq.concepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Step 3: notes ───────────────────────────────────────────────────────────

function NotesList({ goalId, notes, onChange }: { goalId: string; notes: NotesResourceView[]; onChange: (n: NotesResourceView[]) => void }) {
  const [pending, start] = useTransition();
  if (notes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {notes.map((n) => (
        <li key={n.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{n.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {n.status === "ready"
                ? `${n.pages ?? "?"} pages · ${n.chunks} passages${n.embedded ? " · semantic search" : " · keyword search"}`
                : n.status === "failed"
                  ? (n.error ?? "Failed")
                  : "Processing…"}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Remove ${n.fileName}`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteNotesAction(goalId, n.id);
                if (!r.ok) return void toast.error(r.error);
                onChange(notes.filter((x) => x.id !== n.id));
              })
            }
          >
            <Trash2 className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ── flow ────────────────────────────────────────────────────────────────────

export function SetupFlow({ state }: { state: SetupState }) {
  const router = useRouter();
  const goalId = state.goal.id;
  const [step, setStep] = useState<SetupStep>(state.initialStep);
  const [maxStep, setMaxStep] = useState<SetupStep>(state.initialStep);
  const [draft, setDraft] = useState<DraftGraph | null>(state.draft);
  const [fixes, setFixes] = useState<string[]>([]);
  const [pyq, setPyq] = useState<PyqView | null>(state.pyq);
  const [notes, setNotes] = useState<NotesResourceView[]>(state.notes);
  const [pending, start] = useTransition();
  const locked = state.goal.status === "active";

  const go = (s: SetupStep) => {
    setStep(s);
    setMaxStep((m) => (s > m ? s : m));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-5">
      <Stepper step={step} maxStep={maxStep} onGo={go} />

      {step === 1 && (
        <Tile>
          <TileHeader label="Syllabus" right={state.aiMode === "offline" ? <span className="text-xs text-muted-foreground">Offline parser</span> : null} />
          {!draft || draft.concepts.length === 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                Upload your university syllabus, or paste the unit-wise topic list. You’ll be able to edit everything before saving.
              </p>
              <UploadField
                label="Drop your syllabus PDF"
                pasteLabel="Paste text"
                placeholder={"UNIT I: Introduction — database system architecture, data independence, ER model…\nUNIT II: …"}
                maxChars={60_000}
                submitLabel="Build concept graph"
                pending={pending}
                pendingLabel="Reading syllabus"
                onSubmit={(form) =>
                  start(async () => {
                    const r = await extractSyllabusAction(goalId, form);
                    if (!r.ok) return void toast.error(r.error);
                    setDraft(r.data.draft);
                    setFixes(r.data.fixes);
                  })
                }
              />
            </>
          ) : (
            <>
              {fixes.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-xl border border-border p-3 text-xs text-muted-foreground">
                  {fixes.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
              <DraftEditor
                key={draft.concepts.map((c) => c.key).join("|")}
                initial={draft}
                locked={locked}
                goalId={goalId}
                onConfirmed={(d) => {
                  setDraft(d);
                  go(2);
                }}
              />
              {state.draft && (
                <Button type="button" variant="ghost" className="self-start" onClick={() => go(2)}>
                  Next: past papers
                  <ArrowRight data-icon="inline-end" />
                </Button>
              )}
            </>
          )}
        </Tile>
      )}

      {step === 2 && (
        <Tile>
          <TileHeader label="Previous-year papers (optional)" />
          <p className="text-sm text-muted-foreground">
            Each question is mapped to a concept and its marks become that concept’s real exam weightage. Without papers the weightage is
            an estimate and is labelled as one.
          </p>
          {pyq && <PyqPanel goalId={goalId} pyq={pyq} onChange={setPyq} />}
          <UploadField
            label={pyq ? "Replace with other papers" : "Drop 1–3 years of question papers"}
            pasteLabel="Paste questions"
            placeholder={"Q1. (a) Explain conflict serializability with an example. [10]\n(b) …"}
            maxChars={60_000}
            submitLabel={pyq ? "Map again" : "Map questions"}
            pending={pending}
            pendingLabel="Mapping questions"
            onSubmit={(form) =>
              start(async () => {
                const r = await uploadPyqAction(goalId, form);
                if (!r.ok) return void toast.error(r.error);
                setPyq(r.data);
              })
            }
          />
          <Button type="button" variant={pyq ? "default" : "ghost"} className="self-start" onClick={() => go(3)}>
            {pyq ? "Continue" : "Skip for now"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </Tile>
      )}

      {step === 3 && (
        <Tile>
          <TileHeader label="Your notes (optional)" />
          <p className="text-sm text-muted-foreground">
            The tutor teaches from your own notes and cites the page. Upload lecture notes or a textbook chapter.
          </p>
          <NotesList goalId={goalId} notes={notes} onChange={setNotes} />
          <UploadField
            label="Drop your notes PDF"
            pasteLabel="Paste notes"
            placeholder="Paste your notes here…"
            maxChars={200_000}
            submitLabel="Add notes"
            pending={pending}
            pendingLabel="Indexing notes"
            onSubmit={(form) =>
              start(async () => {
                const r = await uploadNotesAction(goalId, form);
                if (!r.ok) return void toast.error(r.error);
                setNotes((n) => [r.data, ...n]);
                if (r.data.status === "failed") toast.error(r.data.error ?? "Couldn't index that file.");
              })
            }
          />
          <Button type="button" variant={notes.length ? "default" : "ghost"} className="self-start" onClick={() => go(4)}>
            {notes.length ? "Continue" : "Skip for now"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </Tile>
      )}

      {step === 4 && (
        <Tile accent>
          <TileHeader label="Ready" live />
          <h2 className="text-xl font-semibold">Find out what you already know</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Up to 10 quick questions, starting with the concepts that carry the most marks and unlock the most. Your concept graph turns red,
            amber and green as you answer.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="accent" size="lg">
              <Link href={`/goal/${goalId}/diagnostic`}>
                Start the diagnostic
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={pending || !draft}
              onClick={() =>
                start(async () => {
                  const r = await skipDiagnostic(goalId);
                  if (!r.ok) return void toast.error(r.error);
                  router.push("/dashboard");
                })
              }
            >
              Skip and go to dashboard
            </Button>
          </div>
        </Tile>
      )}
    </div>
  );
}
