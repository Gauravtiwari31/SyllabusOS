// Guest accounts + the seeded DBMS demo goal ("Try the demo").
// Runs inside Next.js server code (auth.ts) AND under tsx (prisma/seed.ts), so it imports
// only lib/db and pure modules — never next/*, "server-only" or lib/rate-limit.
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { serializeExplanation } from "@/lib/services/mistakes-helpers";
import { CONCEPT_PREREQS, QUESTION_BANK, type BankQuestion } from "./bank";
import { DEMO_CONCEPTS, DEMO_FILES, DEMO_NOTES, DEMO_PYQS } from "./course";
import { buildDemoHistory, DEMO_MINUTES_PER_DAY, type DemoHistory } from "./history";

export const DEMO_SUBJECT = "Database Management Systems";

/** Guest accounts (and everything they own, via cascades) are deleted after this many days. */
export const GUEST_TTL_DAYS = 7;
/** Share of guest sign-ins that also prune expired guests (no cron needed). */
const PRUNE_PROBABILITY = 0.05;
const PRUNE_BATCH = 25;
/** Upper bound per prune run, so one unlucky sign-in never deletes an unbounded backlog. */
const PRUNE_MAX_BATCHES = 8;
const DAY_MS = 86_400_000;

type Tx = Prisma.TransactionClient;
/** The demo goal is ~700 rows in ~15 statements; generous limits for a cold serverless DB. */
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

/**
 * Create a guest user. mode "demo" also builds the seeded DBMS goal (concept graph,
 * PYQ weightage, notes chunks, question bank, ~10 days of labelled demo history).
 * mode "fresh" creates an empty account that starts at onboarding.
 */
export async function createGuestUser(
  mode: "demo" | "fresh",
): Promise<{ id: string; name: string; email: string }> {
  // Unique and non-routable: .invalid is reserved (RFC 2606), so no mail can ever go out.
  const data = { name: "Guest", email: `guest-${randomUUID()}@guest.invalid`, isGuest: true };
  const select = { id: true, name: true, email: true } as const;

  const user =
    mode === "demo"
      ? // One transaction: a failed seed never leaves a half-built demo account behind.
        await db.$transaction(async (tx) => {
          const u = await tx.user.create({ data, select });
          await writeDemoGoal(tx, u.id, new Date());
          return u;
        }, TX_OPTIONS)
      : await db.user.create({ data, select });

  if (Math.random() < PRUNE_PROBABILITY) {
    // Opportunistic cleanup; never awaited and never allowed to fail the sign-in.
    void pruneExpiredGuests().catch((err) => console.error("[demo] pruning expired guests failed", err));
  }
  return { id: user.id, name: user.name ?? "Guest", email: user.email };
}

/** Build the full demo goal for an existing user. Returns the goal id. */
export async function createDemoGoal(userId: string): Promise<string> {
  return db.$transaction((tx) => writeDemoGoal(tx, userId, new Date()), TX_OPTIONS);
}

let pruning: Promise<number> | null = null;

/**
 * Delete guest users created more than GUEST_TTL_DAYS ago, in batches (goals, attempts and
 * everything below them go with the user through ON DELETE CASCADE). Concurrent calls share
 * one run. Returns the number of users deleted.
 */
export function pruneExpiredGuests(now: Date = new Date()): Promise<number> {
  if (pruning) return pruning;
  const run = (async () => {
    const cutoff = new Date(now.getTime() - GUEST_TTL_DAYS * DAY_MS);
    let deleted = 0;
    for (let i = 0; i < PRUNE_MAX_BATCHES; i++) {
      const batch = await db.user.findMany({
        where: { isGuest: true, createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: PRUNE_BATCH,
      });
      if (batch.length === 0) break;
      // isGuest is re-checked in the delete itself: only guest rows can ever match.
      const { count } = await db.user.deleteMany({
        where: { id: { in: batch.map((u) => u.id) }, isGuest: true, createdAt: { lt: cutoff } },
      });
      deleted += count;
      if (batch.length < PRUNE_BATCH) break;
    }
    return deleted;
  })();
  pruning = run.finally(() => {
    pruning = null;
  });
  return pruning;
}

// ── Demo goal writer ────────────────────────────────────────────────────────

/** A bank item is stored once: diagnostic items feed the (finished) diagnostic, the rest the check pool. */
function sourceOf(q: BankQuestion): "diagnostic" | "check" | "practice" {
  if (q.purposes.includes("diagnostic")) return "diagnostic";
  return q.purposes.includes("check") ? "check" : "practice";
}

function lookup<T>(map: Map<string, T>, key: string, what: string): T {
  const v = map.get(key);
  if (v === undefined) throw new Error(`demo goal: unknown ${what} "${key}"`);
  return v;
}

async function writeDemoGoal(tx: Tx, userId: string, now: Date): Promise<string> {
  const h: DemoHistory = buildDemoHistory(now);
  const unitOf = new Map(DEMO_CONCEPTS.map((c) => [c.name, c.unit]));

  const { id: goalId } = await tx.goal.create({
    data: {
      userId,
      subject: DEMO_SUBJECT,
      examDate: h.examDate,
      minutesPerDay: DEMO_MINUTES_PER_DAY,
      status: "active",
      isDemo: true,
      createdAt: h.goalCreatedAt,
    },
    select: { id: true },
  });

  const resources = await tx.resource.createManyAndReturn({
    data: [
      { goalId, kind: "syllabus" as const, fileName: DEMO_FILES.syllabus, status: "ready" as const, pages: 2, createdAt: h.setupAt },
      { goalId, kind: "pyq" as const, fileName: DEMO_FILES.pyq, status: "ready" as const, pages: 6, createdAt: h.setupAt },
      {
        goalId,
        kind: "notes" as const,
        fileName: DEMO_FILES.notes,
        status: "ready" as const,
        pages: Math.max(...DEMO_NOTES.map((n) => n.page)),
        createdAt: h.setupAt,
      },
    ],
    select: { id: true, kind: true },
  });
  const notesId = resources.find((r) => r.kind === "notes")?.id;
  if (!notesId) throw new Error("demo goal: notes resource was not created");

  const concepts = await tx.concept.createManyAndReturn({
    data: DEMO_CONCEPTS.map((c, order) => {
      const w = h.weightage.get(c.name);
      return {
        goalId,
        name: c.name,
        description: c.description,
        unit: c.unit,
        order,
        weightage: w?.share ?? 0,
        weightageSource: "pyq" as const,
        pyqMarks: w?.marks ?? 0,
        estMinutes: c.estMinutes,
        createdAt: h.setupAt,
      };
    }),
    select: { id: true, name: true },
  });
  const conceptIds = new Map(concepts.map((c) => [c.name, c.id]));
  const cid = (name: string) => lookup(conceptIds, name, "concept");

  await tx.conceptEdge.createMany({
    data: DEMO_CONCEPTS.flatMap((c) =>
      (CONCEPT_PREREQS[c.name] ?? []).map((p) => ({ goalId, fromConceptId: cid(p), toConceptId: cid(c.name) })),
    ),
    skipDuplicates: true,
  });

  const questions = await tx.question.createManyAndReturn({
    data: [
      ...QUESTION_BANK.filter((q) => conceptIds.has(q.concept)).map((q) => ({
        goalId,
        conceptId: cid(q.concept),
        unit: unitOf.get(q.concept) ?? null,
        type: q.type,
        body: q.body,
        options: q.options ?? undefined,
        answer: q.answer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        source: sourceOf(q),
        verified: true,
        createdAt: h.setupAt,
      })),
      ...DEMO_PYQS.map((p) => ({
        goalId,
        conceptId: cid(p.concept),
        type: "short" as const,
        body: p.text,
        answer: "",
        source: "pyq" as const,
        marks: p.marks,
        year: p.year,
        createdAt: h.setupAt,
      })),
    ],
    select: { id: true, body: true },
  });
  const questionIds = new Map(questions.map((q) => [q.body, q.id]));
  const qid = (body: string) => lookup(questionIds, body, "question");

  // Notes pages as retrieval chunks; embedding stays NULL → keyword retrieval with page citations.
  await tx.chunk.createMany({
    data: DEMO_NOTES.map((n) => ({
      resourceId: notesId,
      goalId,
      conceptId: cid(n.concept),
      page: n.page,
      text: n.text,
      createdAt: h.setupAt,
    })),
  });

  await tx.mastery.createMany({
    data: DEMO_CONCEPTS.map((c) => {
      const m = lookup(h.mastery, c.name, "mastery");
      return { conceptId: cid(c.name), theta: m.theta, evidenceCount: m.evidenceCount, lastPracticedAt: m.lastPracticedAt };
    }),
  });

  await tx.masteryEvent.createMany({
    data: h.events.map((e) => ({
      goalId,
      conceptId: cid(e.concept),
      thetaBefore: e.thetaBefore,
      thetaAfter: e.thetaAfter,
      source: e.source,
      isDemo: true,
      createdAt: e.at,
    })),
  });

  const sessions = await tx.session.createManyAndReturn({
    data: h.sessions.map((s) => ({
      goalId,
      conceptId: cid(s.concept),
      plannedMin: s.plannedMin,
      actualMin: s.actualMin,
      masteryBefore: s.masteryBefore,
      masteryAfter: s.masteryAfter,
      status: "completed" as const,
      stage: "check",
      failCount: s.ladder.failCount,
      correctStreak: s.ladder.correctStreak,
      reason: s.reason,
      createdAt: s.createdAt,
      completedAt: s.completedAt,
    })),
    select: { id: true, conceptId: true, createdAt: true },
  });
  // RETURNING order isn't guaranteed: match rows back by (concept, start time), unique per script.
  const sessionKey = (conceptId: string, at: Date) => `${conceptId}@${at.getTime()}`;
  const sessionIdByKey = new Map(sessions.map((s) => [sessionKey(s.conceptId, s.createdAt), s.id]));
  const sessionIds = h.sessions.map((s) => lookup(sessionIdByKey, sessionKey(cid(s.concept), s.createdAt), "session"));

  await tx.tutorTurn.createMany({
    data: h.sessions.flatMap((s, i) =>
      s.turns.map((t) => ({
        sessionId: sessionIds[i],
        role: t.role,
        content: t.content,
        stage: t.stage,
        evaluation: t.evaluation,
        misconception: t.misconception,
        sources: t.sources,
        notInNotes: false,
        createdAt: t.at,
      })),
    ),
  });

  await tx.attempt.createMany({
    data: h.attempts.map((a) => ({
      questionId: qid(a.questionBody),
      userId,
      sessionId: a.session === null ? null : sessionIds[a.session],
      response: a.response,
      outcome: a.outcome,
      evidenceWeight: 1,
      createdAt: a.at,
    })),
  });

  await tx.mistake.createMany({
    data: h.mistakes.map((m) => ({
      goalId,
      conceptId: cid(m.concept),
      source: m.source,
      prompt: m.prompt,
      response: m.response,
      misconception: m.misconception,
      explanation: m.explanation
        ? serializeExplanation({
            v: 1,
            whyWrong: m.explanation.whyWrong,
            correctReasoning: m.explanation.correctReasoning,
            retryQuestionId: qid(m.explanation.retryBody),
            sources: m.explanation.pages.map((page) => ({ file: DEMO_FILES.notes, page })),
            notInNotes: false,
          })
        : null,
      resolved: m.resolved,
      createdAt: m.at,
    })),
  });

  return goalId;
}
