"use client";
// One objective question (MCQ or numeric) with answer + feedback. Used by session check
// questions, the diagnostic and mistake retries. Grading always happens on the server.
import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DotLoader } from "@/components/nu";
import { cn } from "@/lib/utils";
import type { Outcome } from "@/lib/engine/types";
import { RichText } from "./rich-text";
import { OutcomeChip } from "./chips";

export interface ObjectiveResult {
  outcome: Outcome;
  /** raw response: option index "0".."3" for mcq */
  response: string | null;
  correctIndex: number | null;
  correctAnswer: string | null;
  explanation: string | null;
}

const LETTERS = ["A", "B", "C", "D"];

export function ObjectiveQuestion({
  type,
  body,
  options,
  result,
  pending,
  onSubmit,
  submitLabel = "Check answer",
  className,
}: {
  type: "mcq" | "numeric";
  body: string;
  options: string[] | null;
  result: ObjectiveResult | null;
  pending?: boolean;
  onSubmit: (response: string) => void;
  submitLabel?: string;
  className?: string;
}) {
  const [choice, setChoice] = useState<string>("");
  const inputId = useId();
  const answered = result !== null;
  const chosen = answered ? (result.response ?? "") : choice;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <RichText text={body} className="text-[15px] leading-relaxed" />

      {type === "mcq" && options ? (
        <div role="radiogroup" aria-label="Options" className="flex flex-col gap-2">
          {options.map((opt, i) => {
            const selected = chosen === String(i);
            const isCorrect = answered && result.correctIndex === i;
            const isWrongPick = answered && selected && !isCorrect;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={answered || pending}
                onClick={() => setChoice(String(i))}
                className={cn(
                  "flex min-h-11 w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default",
                  !answered && (selected ? "border-foreground bg-accent" : "border-border hover:bg-muted"),
                  isCorrect && "border-[var(--nu-strong)] bg-[color-mix(in_oklab,var(--nu-strong)_10%,transparent)]",
                  isWrongPick && "border-[var(--nu-weak)] bg-[color-mix(in_oklab,var(--nu-weak)_10%,transparent)]",
                  answered && !isCorrect && !isWrongPick && "border-border opacity-70",
                )}
              >
                <span
                  className={cn(
                    "mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    selected && !answered ? "border-foreground bg-foreground text-background" : "border-border",
                  )}
                  aria-hidden
                >
                  {isCorrect ? <Check className="size-3.5" /> : isWrongPick ? <X className="size-3.5" /> : LETTERS[i]}
                </span>
                <span className="min-w-0 flex-1">{opt}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
            Your answer (a number; units are fine)
          </label>
          <Input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            maxLength={60}
            disabled={answered || pending}
            value={answered ? (result.response ?? "") : choice}
            onChange={(e) => setChoice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && choice.trim() && !pending && !answered) onSubmit(choice.trim());
            }}
            className="max-w-xs"
          />
        </div>
      )}

      {!answered ? (
        <Button
          type="button"
          className="self-start"
          disabled={!choice.trim() || pending}
          onClick={() => onSubmit(choice.trim())}
        >
          {pending ? <DotLoader label="Checking" /> : submitLabel}
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm animate-in fade-in duration-150 motion-reduce:animate-none">
          <div className="flex flex-wrap items-center gap-2">
            <OutcomeChip outcome={result.outcome} />
            {result.outcome < 1 && result.correctAnswer && (
              <span className="text-muted-foreground">
                Correct answer: <span className="font-medium text-foreground">{result.correctAnswer}</span>
              </span>
            )}
          </div>
          {result.explanation && <RichText text={result.explanation} className="text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}
