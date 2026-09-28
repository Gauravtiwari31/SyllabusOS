// Small status chips used under tutor messages, on check questions and in the mistake log.
// Colour is never the only signal: every chip carries a word and (where useful) an icon.
import { Check, CircleDashed, FileText, Info, X } from "lucide-react";
import { Chip } from "@/components/nu";
import { cn } from "@/lib/utils";
import type { Evaluation, SourceRef, TutorStage } from "@/lib/ai/schemas";
import type { Outcome } from "@/lib/engine/types";
import { STAGE_LABEL } from "./constants";

export function StageChip({ stage, className }: { stage: TutorStage; className?: string }) {
  return (
    <Chip tone="neutral" className={className}>
      {STAGE_LABEL[stage]}
    </Chip>
  );
}

const EVAL: Record<Exclude<Evaluation, "not_applicable">, { tone: "strong" | "developing" | "weak"; label: string }> = {
  correct: { tone: "strong", label: "Correct" },
  partial: { tone: "developing", label: "Partial" },
  wrong: { tone: "weak", label: "Not quite" },
};

/** Grade of the student's previous reply. */
export function EvaluationChip({ evaluation }: { evaluation: Evaluation | null }) {
  if (!evaluation || evaluation === "not_applicable") return null;
  const e = EVAL[evaluation];
  const Icon = evaluation === "correct" ? Check : evaluation === "partial" ? CircleDashed : X;
  return (
    <Chip tone={e.tone}>
      <Icon className="size-3" strokeWidth={2} aria-hidden />
      <span className="sr-only">Your reply: </span>
      {e.label}
    </Chip>
  );
}

/** Deterministic grade of an objective answer (check question / retry). */
export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  if (outcome === 1) return <EvaluationChip evaluation="correct" />;
  if (outcome === 0.5) return <EvaluationChip evaluation="partial" />;
  return <EvaluationChip evaluation="wrong" />;
}

export function MisconceptionChip({ label, logged = true }: { label: string; logged?: boolean }) {
  return (
    <Chip tone="accent" className="whitespace-normal text-left">
      {logged ? "Misconception logged: " : "Misconception: "}
      {label}
    </Chip>
  );
}

/** Misconception as a small callout under a tutor message (a chip is too cramped for a sentence). */
export function MisconceptionNote({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-nu-accent/40 bg-nu-accent-muted px-3 py-2 text-sm", className)}>
      <p className="text-xs font-semibold text-[var(--nu-accent-hover)]">Misconception logged</p>
      <p className="text-foreground">{label}</p>
    </div>
  );
}

export function CitationChip({ source }: { source: SourceRef }) {
  return (
    <Chip tone="neutral" className="max-w-full" title={`${source.file}, page ${source.page}`}>
      <FileText className="size-3 shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="sr-only">Source: </span>
      <span className="truncate">{source.file}</span>
      <span className="shrink-0">· p.{source.page}</span>
    </Chip>
  );
}

export function CitationList({ sources, notInNotes }: { sources: SourceRef[]; notInNotes: boolean }) {
  if (sources.length === 0 && !notInNotes) return null;
  return (
    <>
      {sources.map((s) => (
        <CitationChip key={`${s.file}#${s.page}`} source={s} />
      ))}
      {notInNotes && <NotInNotes />}
    </>
  );
}

export function NotInNotes() {
  return (
    <span className="nu-meta inline-flex items-center gap-1.5">
      <Info className="size-3" strokeWidth={1.5} aria-hidden />
      Not in your notes — general knowledge
    </span>
  );
}

const SOURCE_LABEL = {
  diagnostic: "Diagnostic",
  quiz: "Quiz",
  socratic: "Socratic",
  check: "Check",
} as const;

export function MistakeSourceChip({ source }: { source: keyof typeof SOURCE_LABEL }) {
  return (
    <Chip tone="neutral">
      <span className="sr-only">Source: </span>
      {SOURCE_LABEL[source]}
    </Chip>
  );
}
