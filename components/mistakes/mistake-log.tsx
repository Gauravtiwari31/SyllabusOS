"use client";
// Mistake log: wrong answers grouped by concept, recurring misconceptions (which raise that
// concept's priority), Explain My Mistake and a retry question that can resolve the mistake.
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { answerRetryAction, explainMistakeAction } from "@/app/actions/mistakes";
import { DotLoader, EmptyState, Stat, Tile, TileHeader } from "@/components/nu";
import { Button } from "@/components/ui/button";
import { CitationList, MistakeSourceChip } from "@/components/tutor/chips";
import { ObjectiveQuestion } from "@/components/tutor/objective-question";
import { RichText } from "@/components/tutor/rich-text";
import { cn } from "@/lib/utils";
import { formatDay } from "@/components/plan/format";
import type { ExplanationView, MistakeGroupView, MistakeItemView, MistakeLogData } from "./types";


function MistakeItem({ item }: { item: MistakeItemView }) {
  const [explanation, setExplanation] = useState<ExplanationView | null>(item.explanation);
  const [resolved, setResolved] = useState(item.resolved);
  const [pending, start] = useTransition();
  const [retryPending, setRetryPending] = useState(false);

  const explain = (fresh = false) =>
    start(async () => {
      const r = await explainMistakeAction(item.id, fresh);
      if (!r.ok) return void toast.error(r.error);
      setExplanation(r.data);
    });

  const retry = (questionId: string, response: string) => {
    setRetryPending(true);
    start(async () => {
      const r = await answerRetryAction(item.id, questionId, response);
      setRetryPending(false);
      if (!r.ok) return void toast.error(r.error);
      setExplanation((e) => (e ? { ...e, retryResult: r.data } : e));
      if (r.data.resolved) {
        setResolved(true);
        toast.success("Mistake resolved.");
      }
    });
  };

  return (
    <li className={cn("flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0", resolved && "opacity-75")}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <MistakeSourceChip source={item.source} />
        <span>{formatDay(item.createdAt.slice(0, 10))}</span>
        {resolved && <span className="font-medium text-[var(--nu-strong)]">Resolved</span>}
        {!resolved && item.raisesPriority && <span className="font-medium text-foreground">Raises this topic’s priority</span>}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <p className="text-muted-foreground">Question</p>
        <RichText text={item.prompt} className="text-foreground" />
        <p className="mt-1 text-muted-foreground">Your answer</p>
        <p className="whitespace-pre-wrap break-words">{item.response}</p>
        {item.misconception && (
          <p className="mt-1">
            <span className="text-muted-foreground">Misconception: </span>
            {item.misconception}
            {item.recurrence > 1 && <span className="text-muted-foreground"> · seen {item.recurrence}×</span>}
          </p>
        )}
      </div>

      {explanation ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:p-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-muted-foreground">Why it was wrong</p>
            <RichText text={explanation.whyWrong} className="text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-muted-foreground">Correct reasoning</p>
            <RichText text={explanation.correctReasoning} className="text-sm" />
          </div>
          {(explanation.sources.length > 0 || explanation.notInNotes) && (
            <div className="flex flex-wrap gap-1.5">
              <CitationList sources={explanation.sources} notInNotes={explanation.notInNotes} />
            </div>
          )}
          {explanation.retry && !resolved && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Try a similar question</p>
              <ObjectiveQuestion
                key={explanation.retry.id}
                type={explanation.retry.type}
                body={explanation.retry.body}
                options={explanation.retry.options}
                pending={retryPending}
                result={
                  explanation.retryResult
                    ? {
                        outcome: explanation.retryResult.outcome,
                        response: explanation.retryResult.response,
                        correctIndex: explanation.retryResult.correctIndex,
                        correctAnswer: explanation.retryResult.correctAnswer,
                        explanation: explanation.retryResult.explanation,
                      }
                    : null
                }
                onSubmit={(resp) => retry(explanation.retry!.id, resp)}
              />
            </div>
          )}
          {!resolved && (
            <Button variant="ghost" size="sm" className="self-start" disabled={pending} onClick={() => explain(true)}>
              <RotateCcw data-icon="inline-start" />
              Explain differently
            </Button>
          )}
        </div>
      ) : (
        <Button variant="outline" size="sm" className="self-start" disabled={pending} onClick={() => explain(false)}>
          {pending ? <DotLoader label="Explaining" /> : "Explain my mistake"}
        </Button>
      )}
    </li>
  );
}

function Group({ group }: { group: MistakeGroupView }) {
  const [showResolved, setShowResolved] = useState(false);
  const open = group.items.filter((i) => !i.resolved);
  const done = group.items.filter((i) => i.resolved);
  const visible = showResolved ? group.items : open;
  return (
    <Tile as="article">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">{group.unit}</p>
          <h2 className="text-lg font-semibold leading-snug">{group.conceptName}</h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {group.open} open · {group.total} total
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/learn/${group.conceptId}`} prefetch={false}>
            Study
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </div>
      {group.recurring.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-xl border border-border p-3 text-sm">
          {group.recurring.map((r) => (
            <li key={r.label} className="flex items-start justify-between gap-3">
              <span className="min-w-0">{r.label}</span>
              <span className={cn("shrink-0 text-xs tabular-nums", r.raisesPriority ? "font-medium text-foreground" : "text-muted-foreground")}>
                {r.count}×{r.raisesPriority ? " · raises priority" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {visible.length > 0 ? (
        <ul className="flex flex-col">
          {visible.map((item) => (
            <MistakeItem key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">All mistakes here are resolved.</p>
      )}
      {done.length > 0 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowResolved((v) => !v)}>
          {showResolved ? "Hide resolved" : `Show ${done.length} resolved`}
        </Button>
      )}
    </Tile>
  );
}

export function MistakeLog({ data }: { data: MistakeLogData }) {
  const { stats, groups } = data;
  if (stats.total === 0) {
    return (
      <Tile>
        <EmptyState
          title="No mistakes yet"
          description="Wrong answers from the diagnostic, study sessions and check questions will collect here with their misconceptions."
        />
      </Tile>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Tile>
          <TileHeader label="Open" />
          <Stat value={stats.open} size="md" />
        </Tile>
        <Tile>
          <TileHeader label="Resolved" />
          <Stat value={stats.resolved} size="md" />
        </Tile>
        <Tile>
          <TileHeader label="Recurring" />
          <Stat value={stats.recurringLabels} size="md" />
          <p className="text-xs text-muted-foreground">misconceptions raising priority</p>
        </Tile>
        <Tile>
          <TileHeader label="Most affected" />
          <p className="text-sm font-medium leading-snug">{stats.mostAffected?.name ?? "–"}</p>
          {stats.mostAffected && <p className="text-xs text-muted-foreground">{stats.mostAffected.open} open</p>}
        </Tile>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((g) => (
          <Group key={g.conceptId} group={g} />
        ))}
      </div>
    </div>
  );
}
