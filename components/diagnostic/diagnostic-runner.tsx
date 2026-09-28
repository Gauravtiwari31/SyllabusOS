"use client";
// Adaptive diagnostic: ≤ 10 questions picked one at a time (wrong → probe a prerequisite,
// right → probe what it unlocks), then the concept graph recolours.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { answerDiagnostic, finishDiagnostic, skipDiagnostic, startDiagnostic } from "@/app/actions/diagnostic";
import { ConceptGraph, GraphLegend } from "@/components/concept-graph";
import { DotBar, DotLoader, Tile, TileHeader } from "@/components/nu";
import { Button } from "@/components/ui/button";
import { ObjectiveQuestion, type ObjectiveResult } from "@/components/tutor/objective-question";
import type { ConceptGraphData } from "@/lib/types";
import type { DiagnosticAnswer, DiagnosticQuestion } from "./types";

/** "B · text" → 1 (the server returns the MCQ answer with its letter). */
function indexFromAnswer(answer: string): number | null {
  const m = /^([A-D])\s·/.exec(answer.trim());
  return m ? m[1].charCodeAt(0) - 65 : null;
}

export function DiagnosticRunner({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState<DiagnosticQuestion | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 10 });
  const [feedback, setFeedback] = useState<{ answer: DiagnosticAnswer; response: string } | null>(null);
  const [graph, setGraph] = useState<ConceptGraphData | null>(null);
  const [status, setStatus] = useState<"loading" | "asking" | "empty" | "done" | "error">("loading");
  const [pending, start] = useTransition();
  const started = useRef(false);

  const finish = () =>
    start(async () => {
      const r = await finishDiagnostic(goalId);
      if (!r.ok) return void toast.error(r.error);
      setGraph(r.data);
      setStatus("done");
    });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start(async () => {
      const r = await startDiagnostic(goalId);
      if (!r.ok) {
        toast.error(r.error);
        return setStatus("error");
      }
      setProgress({ answered: r.data.answered, total: r.data.total });
      if (r.data.poolEmpty) return setStatus("empty");
      if (!r.data.question) {
        const f = await finishDiagnostic(goalId);
        if (f.ok) {
          setGraph(f.data);
          return setStatus("done");
        }
      }
      setQuestion(r.data.question);
      setStatus("asking");
    });
  }, [goalId]);

  const submit = (response: string) => {
    if (!question) return;
    start(async () => {
      const r = await answerDiagnostic(goalId, question.id, response);
      if (!r.ok) return void toast.error(r.error);
      setFeedback({ answer: r.data, response });
      setProgress({ answered: r.data.answered, total: r.data.total });
    });
  };

  const next = () => {
    if (!feedback) return;
    if (feedback.answer.done || !feedback.answer.next) return finish();
    setQuestion(feedback.answer.next);
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const skip = () =>
    start(async () => {
      const r = await skipDiagnostic(goalId);
      if (!r.ok) return void toast.error(r.error);
      router.push("/dashboard");
    });

  if (status === "done" && graph) {
    return (
      <div className="flex flex-col gap-4">
        <Tile accent>
          <TileHeader label="Diagnostic complete" live />
          <h2 className="text-xl font-semibold">Here’s where you stand</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            Concepts you answered directly have evidence; the rest of each unit got a low-confidence estimate (dashed). Every study
            session from here updates these colours.
          </p>
          <Button asChild variant="accent" className="self-start">
            <Link href="/dashboard">
              See what to study first
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </Tile>
        <Tile flush>
          <ConceptGraph data={graph} height="min(65vh, 560px)" />
          <GraphLegend className="m-4" />
        </Tile>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <Tile className="items-center py-12">
        <DotLoader label="Preparing your questions (this can take a moment the first time)" />
      </Tile>
    );
  }

  if (status === "empty" || status === "error") {
    return (
      <Tile>
        <TileHeader label="Diagnostic" />
        <p className="text-sm text-muted-foreground">
          {status === "empty"
            ? "We couldn't prepare questions for this syllabus right now. You can skip the diagnostic — your first study sessions will measure where you are instead."
            : "Something went wrong preparing the diagnostic."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" onClick={skip} disabled={pending}>
            Skip to dashboard
          </Button>
          {status === "error" && (
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Try again
            </Button>
          )}
        </div>
      </Tile>
    );
  }

  const result: ObjectiveResult | null = feedback
    ? {
        outcome: feedback.answer.outcome,
        response: feedback.response,
        correctIndex: question?.type === "mcq" ? indexFromAnswer(feedback.answer.correctAnswer) : null,
        correctAnswer: feedback.answer.correctAnswer,
        explanation: feedback.answer.explanation,
      }
    : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Tile>
        {question && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                Question {Math.min(progress.answered + (feedback ? 0 : 1), progress.total)} of {progress.total}
                {question.conceptName ? ` · ${question.conceptName}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">{question.whyText}</p>
            </div>
            <ObjectiveQuestion
              key={question.id}
              type={question.type}
              body={question.body}
              options={question.options}
              pending={pending}
              result={result}
              onSubmit={submit}
            />
            {feedback && (
              <div className="flex flex-col gap-2">
                {feedback.answer.updated.unit && (
                  <p className="text-xs text-muted-foreground">
                    Updated {feedback.answer.updated.conceptName ?? "this concept"} directly, and the rest of {feedback.answer.updated.unit} as a
                    low-confidence estimate.
                  </p>
                )}
                <Button type="button" className="self-start" onClick={next} disabled={pending}>
                  {feedback.answer.done || !feedback.answer.next ? "See my results" : "Next question"}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            )}
          </>
        )}
      </Tile>
      <Tile>
        <TileHeader label="Progress" />
        <DotBar value={progress.total ? progress.answered / progress.total : 0} segments={progress.total || 10} label="Diagnostic progress" />
        <p className="text-sm text-muted-foreground tabular-nums">
          {progress.answered} of {progress.total} answered
        </p>
        <p className="text-xs text-muted-foreground text-pretty">
          The next question depends on this answer: a miss checks a prerequisite, a hit checks what it unlocks.
        </p>
        <Button variant="ghost" size="sm" className="mt-2 self-start" onClick={skip} disabled={pending}>
          Skip the rest
        </Button>
      </Tile>
    </div>
  );
}
