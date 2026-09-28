"use client";
// /learn/[conceptId]: Socratic dialogue → check questions → result. Every reply is graded on
// the server and moves mastery; the ladder rail shows where the student is.
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Lightbulb, Send } from "lucide-react";
import { toast } from "sonner";
import {
  answerCheckAction,
  completeSessionAction,
  requestHintAction,
  sendTutorMessageAction,
  setHinglishAction,
  startChecksAction,
} from "@/app/actions/learn";
import { DotBar, DotLoader, MasteryDelta, MasteryReadout, Tile, TileHeader } from "@/components/nu";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CitationList, EvaluationChip, MisconceptionNote } from "@/components/tutor/chips";
import { LADDER_STAGES, MAX_MESSAGE_CHARS, STAGE_HINT, STAGE_LABEL } from "@/components/tutor/constants";
import { ObjectiveQuestion } from "@/components/tutor/objective-question";
import { RichText } from "@/components/tutor/rich-text";
import { bandFrom } from "@/components/study-now/band";
import { cn } from "@/lib/utils";
import type { TutorMessageView } from "@/lib/types";
import type { CheckItemView, LearnPageData, LearnSessionView, SessionResultView } from "./types";

function LadderRail({ stage }: { stage: LearnSessionView["stage"] }) {
  const at = LADDER_STAGES.indexOf(stage);
  return (
    <div className="flex flex-col gap-2">
      <ol className="grid grid-cols-5 gap-1" aria-label="Hint ladder">
        {LADDER_STAGES.map((s, i) => (
          <li key={s} className="flex flex-col gap-1.5" aria-current={i === at ? "step" : undefined}>
            <span
              className={cn(
                "h-1.5 rounded-full",
                i < at ? "bg-foreground/60" : i === at ? "bg-nu-accent" : "bg-[var(--nu-line)]",
              )}
            />
            <span className={cn("text-[11px] leading-tight", i === at ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {STAGE_LABEL[s]}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground text-pretty">{STAGE_HINT[stage]}</p>
    </div>
  );
}

function Message({ m }: { m: TutorMessageView }) {
  const tutor = m.role === "tutor";
  return (
    <li className={cn("flex flex-col gap-1.5", tutor ? "items-start" : "items-end")}>
      <div
        className={cn(
          "max-w-[92%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed sm:max-w-[80%] animate-in fade-in duration-150 motion-reduce:animate-none",
          tutor ? "rounded-tl-md border border-border bg-card" : "rounded-tr-md bg-accent",
        )}
      >
        <span className="sr-only">{tutor ? "Tutor: " : "You: "}</span>
        {tutor ? <RichText text={m.content} /> : <p className="whitespace-pre-wrap break-words">{m.content}</p>}
      </div>
      {tutor && (m.evaluation || m.sources.length > 0 || m.notInNotes || m.misconception) && (
        <div className="flex max-w-[92%] flex-wrap items-center gap-1.5 sm:max-w-[80%]">
          <EvaluationChip evaluation={m.evaluation} />
          <CitationList sources={m.sources} notInNotes={m.notInNotes} />
        </div>
      )}
      {tutor && m.misconception && <MisconceptionNote label={m.misconception} className="max-w-[92%] sm:max-w-[80%]" />}
    </li>
  );
}

function ResultView({ result, conceptName }: { result: SessionResultView; conceptName: string }) {
  const s = result.summary;
  const next = result.nextRecommendation;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tile>
        <TileHeader label="Session complete" />
        <p className="text-sm text-muted-foreground">Mastery of {conceptName}</p>
        <MasteryDelta before={result.masteryBefore} after={result.masteryAfter} />
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Replies graded", `${s.correctReplies}/${s.gradedReplies} right`],
            ["Check score", `${s.checkScore}/${s.checksTotal}`],
            ["Mistakes logged", String(s.mistakesLogged)],
            ["Time", s.actualMin !== null ? `${s.actualMin} min` : "–"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Tile>
      <Tile accent={Boolean(next)}>
        <TileHeader label="Up next" live={Boolean(next)} />
        {next ? (
          <>
            <p className="text-xl font-semibold leading-snug">{next.conceptName}</p>
            <p className="text-sm text-muted-foreground text-pretty">
              {next.minutes} min · {next.reason}
            </p>
            <Button asChild variant="accent" className="mt-2 self-start">
              <Link href={`/learn/${next.conceptId}`} prefetch={false}>
                Start next session
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Everything is at target mastery. Try Revision mode before the exam.</p>
        )}
        <Button asChild variant="ghost" className="mt-auto self-start">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </Tile>
    </div>
  );
}

export function LearnView({ initial }: { initial: LearnPageData }) {
  const [session, setSession] = useState(initial.session);
  const [result, setResult] = useState<SessionResultView | null>(initial.result);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [checkPending, setCheckPending] = useState<string | null>(null);
  const [hinglish, setHinglish] = useState(initial.session.hinglish);
  const endRef = useRef<HTMLDivElement>(null);

  const band = bandFrom(session.masteryNow, session.confidence);
  const canCheck = session.status === "active" && session.gradedReplies >= 1;
  const allChecked = session.checks.length > 0 && session.checks.every((c) => c.answered);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session.turns.length]);

  const applyReply = (r: {
    messages: TutorMessageView[];
    masteryNow: number;
    confidence: LearnSessionView["confidence"];
    stage: LearnSessionView["stage"];
    status: LearnSessionView["status"];
    checks: CheckItemView[];
    gradedReplies: number;
  }) =>
    setSession((s) => ({
      ...s,
      turns: [...s.turns, ...r.messages],
      masteryNow: r.masteryNow,
      confidence: r.confidence,
      stage: r.stage,
      status: r.status,
      checks: r.checks.length ? r.checks : s.checks,
      gradedReplies: r.gradedReplies,
    }));

  const send = () => {
    const text = draft.trim();
    if (!text || pending) return;
    startTransition(async () => {
      const r = await sendTutorMessageAction(session.id, text);
      if (!r.ok) return void toast.error(r.error);
      setDraft("");
      applyReply(r.data);
    });
  };

  const hint = () =>
    startTransition(async () => {
      const r = await requestHintAction(session.id);
      if (!r.ok) return void toast.error(r.error);
      applyReply(r.data);
    });

  const toChecks = () =>
    startTransition(async () => {
      const r = await startChecksAction(session.id);
      if (!r.ok) return void toast.error(r.error);
      setSession((s) => ({ ...s, status: r.data.status, stage: r.data.stage, checks: r.data.checks }));
    });

  const answer = (questionId: string, response: string) => {
    setCheckPending(questionId);
    startTransition(async () => {
      const r = await answerCheckAction(session.id, questionId, response);
      setCheckPending(null);
      if (!r.ok) return void toast.error(r.error);
      setSession((s) => ({
        ...s,
        masteryNow: r.data.masteryNow,
        confidence: r.data.confidence,
        checks: s.checks.map((c) => (c.id === questionId ? r.data.check : c)),
      }));
    });
  };

  const finish = () =>
    startTransition(async () => {
      const r = await completeSessionAction(session.id);
      if (!r.ok) return void toast.error(r.error);
      setResult(r.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  const toggleHinglish = (on: boolean) => {
    setHinglish(on);
    startTransition(async () => {
      const r = await setHinglishAction(on);
      if (!r.ok) {
        setHinglish(!on);
        toast.error(r.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Dashboard
        </Link>
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            {session.concept.unit} · {session.plannedMin} min planned
          </p>
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.01em] text-balance sm:text-3xl">{session.concept.name}</h1>
          {session.reason && <p className="max-w-2xl text-sm text-muted-foreground text-pretty">Why now: {session.reason}</p>}
        </div>
      </div>

      {result ? (
        <ResultView result={result} conceptName={session.concept.name} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Tile flush className="order-2 min-h-[420px] lg:order-1">
            <ol className="flex flex-col gap-4 p-4 sm:p-6" aria-live="polite" aria-label="Conversation">
              {session.turns.map((m) => (
                <Message key={m.id} m={m} />
              ))}
              {pending && !checkPending && (
                <li className="self-start">
                  <DotLoader label="Tutor is thinking" />
                </li>
              )}
            </ol>
            <div ref={endRef} />

            {session.status === "active" ? (
              <form
                className="mt-auto flex flex-col gap-2 border-t border-border p-3 sm:p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <label htmlFor="reply" className="sr-only">
                  Your reply
                </label>
                <Textarea
                  id="reply"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  maxLength={MAX_MESSAGE_CHARS}
                  rows={2}
                  placeholder="Reason it out in your own words…"
                  disabled={pending}
                  className="min-h-16 resize-none text-base md:text-[15px]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={!draft.trim() || pending}>
                    <Send data-icon="inline-start" />
                    Send
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={hint}
                    disabled={pending || session.stage === "worked_step"}
                  >
                    <Lightbulb data-icon="inline-start" />
                    Hint
                  </Button>
                  <Button type="button" variant="ghost" className="ml-auto" onClick={toChecks} disabled={!canCheck || pending}>
                    I’m ready, check me
                  </Button>
                </div>
              </form>
            ) : session.status === "checking" ? (
              <div className="mt-auto flex flex-col gap-5 border-t border-border p-4 sm:p-6">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold">Check questions</h2>
                  <p className="text-sm text-muted-foreground">Graded instantly. These count more than chat replies.</p>
                </div>
                {session.checks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No check questions are available for this concept. You can finish the session.</p>
                ) : (
                  session.checks.map((c, i) => (
                    <div key={c.id} className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Question {i + 1} of {session.checks.length}
                      </p>
                      <ObjectiveQuestion
                        type={c.type}
                        body={c.body}
                        options={c.options}
                        pending={checkPending === c.id}
                        result={
                          c.answered && c.outcome !== null
                            ? {
                                outcome: c.outcome,
                                response: c.response,
                                correctIndex: c.correctIndex,
                                correctAnswer: c.correctAnswer,
                                explanation: c.explanation,
                              }
                            : null
                        }
                        onSubmit={(resp) => answer(c.id, resp)}
                      />
                    </div>
                  ))
                )}
                <Button
                  variant="accent"
                  className="self-start"
                  onClick={finish}
                  disabled={pending || (session.checks.length > 0 && !allChecked)}
                >
                  Finish session
                </Button>
              </div>
            ) : null}
          </Tile>

          <div className="order-1 flex flex-col gap-4 lg:order-2">
            <Tile>
              <TileHeader label="Mastery" />
              <div className="flex items-center justify-between gap-3">
                <MasteryReadout mastery={session.masteryNow} band={band} confidence={session.confidence} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  started at {Math.round(session.masteryBefore * 100)}%
                </span>
              </div>
              <DotBar value={session.masteryNow} band={band} label="Mastery now" />
            </Tile>
            <Tile>
              <TileHeader label="Hint ladder" />
              <LadderRail stage={session.stage} />
            </Tile>
            <Tile className="hidden sm:flex">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="hinglish" className="text-sm font-medium">
                  Explain in Hinglish
                </label>
                <Switch id="hinglish" checked={hinglish} onCheckedChange={toggleHinglish} />
              </div>
              <p className="text-xs text-muted-foreground">Technical terms stay in English. Applies from the next reply.</p>
            </Tile>
          </div>
        </div>
      )}
    </div>
  );
}
