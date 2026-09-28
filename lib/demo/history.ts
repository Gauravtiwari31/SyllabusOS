// Ten days of scripted study history for the demo goal, labelled as demo data in the UI.
// PURE: no DB, no clock — `now` comes from the caller. The script only fixes what the
// student SAYS (diagnostic picks, tutor replies, check answers); everything derived is
// computed by the same code the live app runs: the adaptive diagnostic selector picks the
// questions, gradeObjective grades them, the hint ladder moves the sessions, the engine
// (updateMastery / applyUnitPrior) updates mastery, and recommendNext writes each session's
// reason. So mastery, evidence counts, trend and mistakes stay mutually consistent.
import type { Evaluation, TutorStage } from "@/lib/ai/schemas";
import {
  applyUnitPrior,
  decayedMastery,
  displayMastery,
  gradeObjective,
  initialMastery,
  recommendNext,
  STAGE_DIFFICULTY,
  updateMastery,
  type EngineConcept,
  type Evidence,
  type MasteryState,
  type Outcome,
} from "@/lib/engine";
import { buildSelectorConcepts, DIAGNOSTIC_MAX_QUESTIONS, pickNext, type AskedEntry } from "@/lib/services/diagnostic-select";
import { planForConcept } from "@/lib/services/learn-helpers";
import { initialLadder, nextLadder, type LadderState } from "@/lib/tutor/ladder";
import { CONCEPT_NAMES as C, CONCEPT_PREREQS, findTutorScript, QUESTION_BANK, type BankQuestion } from "./bank";
import { DEMO_CONCEPTS, DEMO_FILES, DEMO_PYQS, pyqWeightage } from "./course";

export const DEMO_MINUTES_PER_DAY = 90;
export const DEMO_EXAM_IN_DAYS = 21;
/** The diagnostic ran this many days ago; the history spans from then until yesterday. */
export const DEMO_HISTORY_DAYS = 10;

/** Must match the engine's recent-mistake window (lib/services/core.ts). */
const MISTAKE_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;
const LETTERS = "ABCD";

// ── The script ──────────────────────────────────────────────────────────────

/**
 * What the student answers if the diagnostic asks about a concept (response to that
 * concept's diagnostic bank question). Solid on Units 1–2, shaky on normalization and
 * transactions — the selector decides which ten are actually asked.
 */
const DIAGNOSTIC_ANSWERS: Record<string, string> = {
  [C.architecture]: "1",
  [C.er]: "1",
  [C.erMapping]: "3",
  [C.relational]: "1",
  [C.keys]: "1",
  [C.algebra]: "1",
  [C.sql]: "1",
  [C.joins]: "7",
  [C.fd]: "2",
  [C.closure]: "5",
  [C.normalForms]: "2",
  [C.bcnf]: "3",
  [C.lossless]: "0",
  [C.depPreservation]: "0",
  [C.acid]: "0",
  [C.schedules]: "6",
  [C.conflict]: "0",
  [C.view]: "3",
  [C.recoverability]: "1",
  [C.twoPL]: "1",
  [C.deadlocks]: "1",
  [C.timestamp]: "2",
  [C.logRecovery]: "1",
  [C.checkpoints]: "0",
  [C.indexing]: "2",
  [C.bplus]: "0",
  [C.hashing]: "1",
};

interface ScriptedReply {
  student: string;
  evaluation: Exclude<Evaluation, "not_applicable">;
  /** misconception label (one of the concept's tutor-script labels) for wrong/partial replies */
  misconception?: string;
  /** ladder stage after this reply — asserted against lib/tutor/ladder */
  stage: TutorStage;
  tutor: string;
  pages: number[];
}

interface ScriptedSession {
  concept: string;
  /** days relative to today (negative = past) */
  day: number;
  start: [number, number];
  minutes: number;
  openingPages: number[];
  replies: ScriptedReply[];
  /** check answers: bank question (body prefix) + response */
  checks: Array<{ body: string; response: string }>;
}

/**
 * "Explain My Mistake" on an open mistake, then its retry question. Correct → the mistake is
 * resolved; wrong → a new quiz mistake with the same label (so the misconception recurs).
 */
interface ScriptedRetry {
  concept: string;
  /** explain the open mistake with this label (default: the oldest open one) */
  label?: string;
  day: number;
  at: [number, number];
  /** bank practice question used as the retry (body prefix) */
  body: string;
  response: string;
  whyWrong: string;
  correctReasoning: string;
  pages: number[];
}

const RETRIES: ScriptedRetry[] = [
  {
    concept: C.fd,
    day: -9,
    at: [18, 50],
    body: "From A → B, the augmentation rule",
    response: "1",
    whyWrong:
      "You picked A → AB as trivial. An FD X → Y is trivial only when Y ⊆ X; here B is on the right but not on the left, so A → AB can fail in some relation.",
    correctReasoning:
      "Check the right side against the left: AB → A is trivial because {A} ⊆ {A, B}, so it holds in every relation regardless of the data.",
    pages: [11],
  },
  {
    concept: C.conflict,
    label: "Counts read–read pairs as conflicts",
    day: -2,
    at: [21, 10],
    body: "The precedence graph of a schedule over T1, T2 and T3 has exactly one edge",
    response: "6",
    whyWrong:
      "You listed r1(X) and r2(X) as a conflicting pair. Two operations conflict only when they are in different transactions, touch the same item AND at least one is a write — two reads never conflict, because swapping them can't change what either transaction sees.",
    correctReasoning:
      "In r1(X) r2(X) w1(X) w2(X) the conflicts are r1(X)–w2(X) (T1 → T2), r2(X)–w1(X) (T2 → T1) and w1(X)–w2(X) (T1 → T2). The two opposite edges form a cycle, so the schedule is not conflict serializable.",
    pages: [20, 21],
  },
];

const SESSIONS: ScriptedSession[] = [
  {
    concept: C.architecture,
    day: -8,
    start: [19, 40],
    minutes: 14,
    openingPages: [1],
    replies: [
      {
        student:
          "External level is the user views, conceptual level is the whole logical schema with tables and constraints, and internal level is how the data is stored — files and indexes.",
        evaluation: "correct",
        stage: "probe",
        tutor:
          "All three are right. Now apply it: the DBA adds an index on Student.roll_no. Which level changes, and which kind of data independence keeps every application working?",
        pages: [1],
      },
      {
        student: "Only the internal level changes. That's physical data independence — the conceptual schema and the views stay the same.",
        evaluation: "correct",
        stage: "check",
        tutor:
          "Exactly. Physical independence is the easier one; logical independence — hiding conceptual changes from views — is harder. Two quick checks.",
        pages: [1],
      },
    ],
    checks: [
      { body: "In the three-schema architecture, which level describes the whole database", response: "1" },
      { body: "Which statement about data independence is correct?", response: "1" },
    ],
  },
  {
    concept: C.relational,
    day: -7,
    start: [19, 20],
    minutes: 13,
    openingPages: [5],
    replies: [
      {
        student:
          "A relation is a set of tuples, so row order doesn't matter and there can't be duplicate rows. Each cell holds one atomic value from the attribute's domain.",
        evaluation: "correct",
        stage: "probe",
        tutor:
          "All correct. Now constraints: one row has a NULL primary key, and another row's foreign key matches no key in the referenced table. Which constraint does each break?",
        pages: [5],
      },
      {
        student: "The NULL primary key breaks entity integrity, and the foreign key that matches nothing breaks referential integrity.",
        evaluation: "correct",
        stage: "check",
        tutor: "Exactly right. Two quick checks to lock it in.",
        pages: [5],
      },
    ],
    checks: [
      { body: "Which of the following is NOT a property of a relation", response: "2" },
      { body: "Employee(dept_id) references Department(dept_id)", response: "2" },
    ],
  },
  {
    concept: C.fd,
    day: -4,
    start: [19, 45],
    minutes: 17,
    openingPages: [11],
    replies: [
      {
        student: "If two rows have the same value of A, they must have the same value of B. So A decides B.",
        evaluation: "correct",
        stage: "probe",
        tutor:
          "Exactly — any two tuples that agree on A must agree on B, in every legal instance, not just today's rows. Next: is {StudentID, CourseID} → StudentID trivial? Why or why not?",
        pages: [11],
      },
      {
        student: "Yes, it's trivial because StudentID is already on the left side. The right side is a subset of the left.",
        evaluation: "correct",
        stage: "check",
        tutor:
          "Right: X → Y is trivial when Y ⊆ X, so it holds in every relation. You've got the core idea — let's confirm it with a couple of check questions.",
        pages: [11],
      },
    ],
    checks: [
      { body: "Given A → B and B → C, which Armstrong axiom", response: "2" },
      { body: "Relation R(A, B, C) contains exactly the tuples", response: "1" },
    ],
  },
  {
    concept: C.closure,
    day: -6,
    start: [20, 5],
    minutes: 24,
    openingPages: [12],
    replies: [
      {
        student: "A+ = {A, B, C}. And A is a key because it determines B and C.",
        evaluation: "partial",
        misconception: "Calls X a key without checking X⁺ = R",
        stage: "probe",
        tutor:
          "Your closure is right: A⁺ = {A, B, C}. Now line it up against R(A, B, C, D, E). Is every attribute of R in A⁺ — including D and E? What does that say about A being a key?",
        pages: [12],
      },
      {
        student: "No, D and E are missing, so A is not a key. If I add D, AD+ = {A, B, C, D, E}, so AD is the key.",
        evaluation: "correct",
        stage: "probe",
        tutor: "Exactly — (AD)⁺ = R. One more: why must D be part of every candidate key of this R?",
        pages: [12],
      },
      {
        student: "Because D never appears on the right side of any FD, so nothing else can give us D. It has to be in the key itself.",
        evaluation: "correct",
        stage: "check",
        tutor:
          "Spot on — an attribute that never appears on a right-hand side must be in every key. That's the fastest way to start a key search. Let's check it.",
        pages: [12],
      },
    ],
    checks: [
      { body: "R(A, B, C, D, E) with F = {A → BC, CD → E, B → D}", response: "2" },
      { body: "R(A, B, C, D) with F = {AB → C, C → D, D → A}", response: "2" },
    ],
  },
  {
    concept: C.normalForms,
    day: -5,
    start: [19, 30],
    minutes: 26,
    openingPages: [13],
    replies: [
      {
        student: "It violates 3NF because StudentID → StudentName is a transitive dependency.",
        evaluation: "wrong",
        misconception: "Confuses partial and transitive dependencies",
        stage: "probe",
        tutor:
          "Look at StudentID again: is it a non-key attribute, or is it part of the key {StudentID, CourseID}? Which kind of dependency starts from part of a key?",
        pages: [13],
      },
      {
        student: "It's part of the key. So StudentName depends on only part of the key — that's a partial dependency, which breaks 2NF.",
        evaluation: "correct",
        stage: "probe",
        tutor: "Yes — a non-prime attribute depending on part of the key breaks 2NF. How would you decompose R to fix it?",
        pages: [13],
      },
      {
        student: "Student(StudentID, StudentName) and Enrollment(StudentID, CourseID, Grade).",
        evaluation: "correct",
        stage: "check",
        tutor:
          "That's the standard 2NF decomposition, and it's lossless because StudentID is a key of Student. Now let's see if the 2NF/3NF distinction sticks.",
        pages: [13, 14],
      },
    ],
    checks: [
      { body: "R(A, B, C) has key A and FDs A → B and B → C", response: "1" },
      { body: "A relation is in 2NF if it is in 1NF and", response: "2" },
    ],
  },
  {
    concept: C.conflict,
    day: -9,
    start: [19, 10],
    minutes: 31,
    openingPages: [20],
    replies: [
      {
        student: "r1(X) and r2(X) conflict because they both access X, and so do w1(X) and w2(X).",
        evaluation: "wrong",
        misconception: "Counts read–read pairs as conflicts",
        stage: "probe",
        tutor:
          "You're right about w1(X) and w2(X). But does the order of two reads ever change what either transaction sees? Check r1(X), r2(X) against all three conditions for a conflict.",
        pages: [20],
      },
      {
        student: "I think every pair on X conflicts since it's the same item: r1-r2, r1-w2, r2-w1 and w1-w2.",
        evaluation: "wrong",
        misconception: "Counts read–read pairs as conflicts",
        stage: "hint1",
        tutor:
          "Let's slow down. Two operations conflict only if all three hold: different transactions, the same data item, and at least one of them is a write. Apply the third condition to r1(X), r2(X).",
        pages: [20],
      },
      {
        student:
          "Two reads don't conflict. So the conflicts are r1(X)–w2(X), r2(X)–w1(X) and w1(X)–w2(X). Edges T1→T2, T2→T1, T1→T2, so it's serializable as T1 then T2?",
        evaluation: "partial",
        stage: "hint1",
        tutor:
          "Your conflicting pairs and edges are right. Now look at the edges together: T1 → T2 and T2 → T1. What do those two edges form, and can any serial order put T1 both before and after T2?",
        pages: [21],
      },
      {
        student: "They form a cycle. No serial order can have T1 before T2 and T2 before T1, so S is not conflict serializable.",
        evaluation: "correct",
        stage: "check",
        tutor:
          "Exactly: a cycle in the precedence graph means no equivalent serial schedule exists. You got there — let's see whether it holds up on fresh schedules.",
        pages: [21],
      },
    ],
    checks: [
      { body: "Schedule S: r1(A) w1(A) r2(A) w2(A) r1(B) w1(B)", response: "0" },
      { body: "Schedule S: r1(X) r2(Y) w2(X) w1(Y)", response: "0" },
    ],
  },
  {
    concept: C.indexing,
    day: -3,
    start: [19, 0],
    minutes: 15,
    openingPages: [29],
    replies: [
      {
        student: "A dense index has an entry for every search key value; a sparse one only for some, like one per block.",
        evaluation: "correct",
        stage: "probe",
        tutor: "Right. So when can you use a sparse index — does the data file need any particular property?",
        pages: [29],
      },
      {
        student: "The file must be sorted on the search key, because we find the largest entry ≤ the key and scan forward from there.",
        evaluation: "correct",
        stage: "check",
        tutor:
          "Exactly — and that's why a sparse index can only be a primary (clustering) index; a secondary index must be dense. Check questions next.",
        pages: [29],
      },
    ],
    checks: [
      { body: "A data file has 30,000 records, 10 records per block, sorted on the key", response: "30" },
      { body: "A secondary index on a non-ordering attribute must be", response: "1" },
    ],
  },
  {
    concept: C.sql,
    day: -3,
    start: [20, 10],
    minutes: 18,
    openingPages: [9],
    replies: [
      {
        student: "HAVING, because WHERE runs on individual rows before grouping, and AVG(salary) only exists once the rows are grouped by dept.",
        evaluation: "correct",
        stage: "probe",
        tutor:
          "Right. Now NULLs: some commission values in Emp are NULL. Do COUNT(*) and COUNT(commission) return the same number?",
        pages: [9],
      },
      {
        student: "No. COUNT(*) counts every row, but COUNT(commission) skips the NULLs, so it's smaller.",
        evaluation: "correct",
        stage: "check",
        tutor: "Exactly — aggregates ignore NULLs, and only COUNT(*) counts rows. Check questions next.",
        pages: [9],
      },
    ],
    checks: [
      { body: "Which query lists each department that has more than 5 employees?", response: "1" },
      { body: "Table Emp has 6 rows, and the salary column is NULL in 2 of them", response: "4" },
    ],
  },
  {
    concept: C.acid,
    day: -2,
    start: [20, 15],
    minutes: 15,
    openingPages: [18],
    replies: [
      {
        student: "Atomicity. The debit happened but the credit didn't, so on restart the DBMS must undo the debit using the log.",
        evaluation: "correct",
        stage: "probe",
        tutor:
          "Exactly. Now the other side: the transfer COMMITS and the system crashes a second later, before the pages reach disk. Which property is at stake now, and what does recovery do?",
        pages: [18, 27],
      },
      {
        student: "Durability — it was committed, so recovery has to redo it from the log.",
        evaluation: "correct",
        stage: "check",
        tutor: "Right: atomicity means undoing uncommitted work, durability means redoing committed work. Check questions next.",
        pages: [18],
      },
    ],
    checks: [
      { body: "Which DBMS component is primarily responsible for ensuring isolation?", response: "1" },
      { body: "After executing its final statement but before it commits", response: "1" },
    ],
  },
  {
    concept: C.bplus,
    day: -1,
    start: [20, 0],
    minutes: 28,
    openingPages: [30],
    replies: [
      {
        student: "In all the nodes, like a B-tree. The leaves are linked to make search faster.",
        evaluation: "wrong",
        misconception: "Thinks internal nodes store record pointers",
        stage: "probe",
        tutor:
          "If internal nodes also held record pointers, how many separator keys would still fit in one block? Look again at what a B+ tree keeps in its internal nodes.",
        pages: [30],
      },
      {
        student: "Only the leaves have record pointers; internal nodes just hold keys to guide the search. Leaves are linked so range queries can scan in order.",
        evaluation: "correct",
        stage: "probe",
        tutor: "Good. Now height: with a fan-out of about 100, roughly how many levels would you need for a million keys?",
        pages: [31],
      },
      {
        student: "100 × 100 × 100 is a million, so about 3 levels.",
        evaluation: "correct",
        stage: "check",
        tutor: "Yes — three levels, so any key is at most about three block reads away. Let's do the check questions.",
        pages: [31],
      },
    ],
    checks: [
      { body: "A B+ tree node is one 4096-byte block", response: "409" },
      { body: "Every B+ tree node, root included, has fan-out 100", response: "3" },
    ],
  },
];

// ── Output ──────────────────────────────────────────────────────────────────

export type DemoEventSource = "diagnostic" | "quiz" | "socratic" | "check";

export interface DemoEvent {
  concept: string;
  thetaBefore: number;
  thetaAfter: number;
  source: DemoEventSource;
  at: Date;
}

export interface DemoAttempt {
  concept: string;
  /** body of the bank question (unique across the bank) */
  questionBody: string;
  response: string;
  outcome: Outcome;
  /** index into DemoHistory.sessions, or null */
  session: number | null;
  at: Date;
}

export interface DemoMistake {
  concept: string;
  source: "diagnostic" | "quiz" | "socratic" | "check";
  prompt: string;
  response: string;
  misconception: string | null;
  /** Mistake.explanation (StoredExplanation JSON) — needs the retry question's id, filled by the writer */
  explanation: { whyWrong: string; correctReasoning: string; retryBody: string; pages: number[] } | null;
  resolved: boolean;
  at: Date;
}

export interface DemoTurn {
  role: "tutor" | "student";
  content: string;
  stage: TutorStage;
  evaluation: Evaluation | null;
  misconception: string | null;
  sources: Array<{ file: string; page: number }>;
  at: Date;
}

export interface DemoSession {
  concept: string;
  plannedMin: number;
  actualMin: number;
  masteryBefore: number;
  masteryAfter: number;
  reason: string;
  ladder: LadderState;
  turns: DemoTurn[];
  createdAt: Date;
  completedAt: Date;
}

export interface DemoHistory {
  goalCreatedAt: Date;
  /** when resources, concepts and cached questions were created (onboarding) */
  setupAt: Date;
  examDate: Date;
  weightage: Map<string, { marks: number; share: number }>;
  events: DemoEvent[];
  attempts: DemoAttempt[];
  mistakes: DemoMistake[];
  sessions: DemoSession[];
  /** final mastery per concept name (every concept has an entry) */
  mastery: Map<string, MasteryState>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * The student studies in the evening, Indian Standard Time: scripted clock times are IST
 * (UTC+5:30) whatever the server's zone, so a UTC deployment doesn't show 1 a.m. sessions.
 * The calendar day comes from `now` in the server's zone (as isoDay does); every scripted
 * time lies between 10:00 and 22:00 IST, which is the same calendar day in UTC and IST.
 */
const IST_OFFSET_MS = 330 * 60_000;

/** `h:m:s` IST on the calendar day `day` days from `now`'s (server-local) date. */
function localAt(now: Date, day: number, h: number, m: number, s = 0): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + day, h, m, s) - IST_OFFSET_MS);
}

function addSeconds(d: Date, s: number): Date {
  return new Date(d.getTime() + s * 1000);
}

/** The bank question whose body starts with `prefix` (throws if missing: the script is broken). */
export function bankQuestionByBody(prefix: string): BankQuestion {
  const q = QUESTION_BANK.find((x) => x.body.startsWith(prefix));
  if (!q) throw new Error(`demo history: no bank question starts with "${prefix}"`);
  return q;
}

function diagnosticQuestion(concept: string): BankQuestion {
  const q = QUESTION_BANK.find((x) => x.concept === concept && x.purposes.includes("diagnostic"));
  if (!q) throw new Error(`demo history: no diagnostic question for ${concept}`);
  return q;
}

function grade(q: BankQuestion, response: string): Outcome {
  return gradeObjective({ type: q.type, answer: q.answer, options: q.options }, response).outcome;
}

/** What the student picked, as the services log it ("B · option" for checks, raw option for diagnostics). */
function chosenText(q: BankQuestion, response: string, lettered: boolean): string {
  if (q.type !== "mcq" || !q.options) return response;
  const i = Number(response);
  const opt = q.options[i];
  if (opt === undefined) return response;
  return lettered ? `${LETTERS[i]} · ${opt}` : opt;
}

function outcomeOf(e: ScriptedReply["evaluation"]): Outcome {
  return e === "correct" ? 1 : e === "partial" ? 0.5 : 0;
}

function sources(pages: number[]): Array<{ file: string; page: number }> {
  return pages.map((page) => ({ file: DEMO_FILES.notes, page }));
}

// ── Replay ──────────────────────────────────────────────────────────────────

class Replay {
  readonly state = new Map<string, MasteryState>();
  readonly events: DemoEvent[] = [];
  readonly mistakes: Array<DemoMistake & { resolvedAt: Date | null }> = [];
  readonly unitOf = new Map<string, string>();

  constructor() {
    for (const c of DEMO_CONCEPTS) {
      this.state.set(c.name, initialMastery());
      this.unitOf.set(c.name, c.unit);
    }
  }

  private get(concept: string): MasteryState {
    const s = this.state.get(concept);
    if (!s) throw new Error(`demo history: unknown concept ${concept}`);
    return s;
  }

  /** Direct evidence on one concept (recordEvidence). */
  evidence(concept: string, ev: Evidence, source: DemoEventSource): void {
    const before = this.get(concept);
    const after = updateMastery(before, ev);
    this.state.set(concept, after);
    this.events.push({ concept, thetaBefore: before.theta, thetaAfter: after.theta, source, at: ev.at });
  }

  /** Unit-level prior on every concept of the unit (recordUnitPrior). */
  unitPrior(unit: string, ev: Omit<Evidence, "kind">): void {
    const names = DEMO_CONCEPTS.filter((c) => c.unit === unit).map((c) => c.name);
    const before = names.map((n) => this.get(n));
    const after = applyUnitPrior(before, ev);
    names.forEach((n, i) => {
      this.state.set(n, after[i]);
      this.events.push({ concept: n, thetaBefore: before[i].theta, thetaAfter: after[i].theta, source: "diagnostic", at: ev.at });
    });
  }

  /** Display mastery as the services show it (decayed once there is evidence). */
  masteryAt(concept: string, at: Date): number {
    const s = this.get(concept);
    return s.evidenceCount > 0 ? decayedMastery(s, at) : displayMastery(s.theta);
  }

  /** EngineConcept[] exactly as loadEngineConcepts would build it at time `at`. */
  engineConcepts(at: Date, weightage: DemoHistory["weightage"]): EngineConcept[] {
    const since = at.getTime() - MISTAKE_WINDOW_DAYS * DAY_MS;
    const open = this.mistakes.filter(
      (m) => m.at.getTime() >= since && m.at <= at && !(m.resolvedAt && m.resolvedAt <= at),
    );
    return DEMO_CONCEPTS.map((c) => {
      const mine = open.filter((m) => m.concept === c.name);
      const labels = new Map<string, number>();
      for (const m of mine) {
        const k = m.misconception?.trim().toLowerCase();
        if (k) labels.set(k, (labels.get(k) ?? 0) + 1);
      }
      return {
        id: c.name,
        name: c.name,
        unit: c.unit,
        weightage: weightage.get(c.name)?.share ?? 0,
        weightageSource: "pyq" as const,
        estMinutes: c.estMinutes,
        mastery: this.get(c.name),
        prereqIds: CONCEPT_PREREQS[c.name] ?? [],
        recentMistakes: mine.length,
        recurringMisconceptions: [...labels.values()].filter((n) => n >= 2).length,
      };
    });
  }
}

/**
 * Build the full demo history relative to `now`. Deterministic for a given `now` (and the
 * server's local time zone, which decides calendar days exactly as the app's isoDay does).
 */
export function buildDemoHistory(now: Date): DemoHistory {
  const weightage = pyqWeightage(DEMO_CONCEPTS, DEMO_PYQS);
  const examDate = localAt(now, DEMO_EXAM_IN_DAYS, 10, 0);
  const goalCreatedAt = localAt(now, -DEMO_HISTORY_DAYS, 18, 12);
  const setupAt = localAt(now, -DEMO_HISTORY_DAYS, 18, 24);
  const replay = new Replay();
  const attempts: DemoAttempt[] = [];

  // 1) Adaptive diagnostic, driven by the real selector.
  const selector = buildSelectorConcepts(
    DEMO_CONCEPTS.map((c) => ({ id: c.name, unit: c.unit, weightage: weightage.get(c.name)?.share ?? 0 })),
    DEMO_CONCEPTS.flatMap((c) => (CONCEPT_PREREQS[c.name] ?? []).map((p) => ({ from: p, to: c.name }))),
  );
  const poolByConcept = Object.fromEntries(DEMO_CONCEPTS.map((c) => [c.name, 1]));
  const asked: AskedEntry[] = [];
  let t = localAt(now, -DEMO_HISTORY_DAYS, 18, 40);
  for (let i = 0; i < DIAGNOSTIC_MAX_QUESTIONS; i++) {
    const pick = pickNext({ concepts: selector, asked, poolByConcept, maxQuestions: DIAGNOSTIC_MAX_QUESTIONS });
    if (!pick) break;
    const concept = pick.conceptId;
    const q = diagnosticQuestion(concept);
    const response = DIAGNOSTIC_ANSWERS[concept] ?? "0";
    const outcome = grade(q, response);
    asked.push({ conceptId: concept, outcome });
    attempts.push({ concept, questionBody: q.body, response, outcome, session: null, at: t });
    replay.evidence(concept, { outcome, difficulty: q.difficulty, kind: "diagnostic", at: t }, "diagnostic");
    replay.unitPrior(replay.unitOf.get(concept) as string, { outcome, difficulty: q.difficulty, at: t });
    if (outcome < 1) {
      replay.mistakes.push({
        concept,
        source: "diagnostic",
        prompt: q.body,
        response: chosenText(q, response, false),
        misconception: null,
        explanation: null,
        resolved: false,
        resolvedAt: null,
        at: t,
      });
    }
    t = addSeconds(t, 70 + 17 * asked.length);
  }

  // 2) Later activity in time order: mistake retries and tutor sessions.
  type Item = { at: Date; retry?: ScriptedRetry; session?: ScriptedSession };
  const items: Item[] = [
    ...RETRIES.map((r) => ({ at: localAt(now, r.day, r.at[0], r.at[1]), retry: r })),
    ...SESSIONS.map((s) => ({ at: localAt(now, s.day, s.start[0], s.start[1]), session: s })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const sessions: DemoSession[] = [];
  for (const item of items) {
    if (item.retry) applyRetry(item.retry, item.at, replay, attempts);
    if (item.session) sessions.push(runSession(item.session, item.at, replay, attempts, sessions.length, { weightage, examDate }));
  }

  return {
    goalCreatedAt,
    setupAt,
    examDate,
    weightage,
    events: replay.events,
    attempts,
    mistakes: replay.mistakes.map(({ resolvedAt, ...m }) => ({ ...m, resolved: resolvedAt !== null })),
    sessions,
    mastery: new Map(replay.state),
  };
}

/**
 * Explain My Mistake on an open mistake, then its retry (quiz evidence), mirroring
 * answerMistakeRetry: correct resolves the mistake, wrong logs a new quiz mistake with the
 * same misconception label so the recurrence counts.
 */
function applyRetry(r: ScriptedRetry, at: Date, replay: Replay, attempts: DemoAttempt[]): void {
  const mistake = replay.mistakes.find(
    (m) => m.concept === r.concept && !m.resolvedAt && m.at < at && (!r.label || m.misconception === r.label),
  );
  if (!mistake) throw new Error(`demo history: no open mistake to retry for ${r.concept}`);
  const q = bankQuestionByBody(r.body);
  if (q.concept !== r.concept) throw new Error(`demo history: retry "${r.body}" is not about ${r.concept}`);
  const answeredAt = addSeconds(at, 150);
  const outcome = grade(q, r.response);
  attempts.push({ concept: r.concept, questionBody: q.body, response: r.response, outcome, session: null, at: answeredAt });
  replay.evidence(r.concept, { outcome, difficulty: q.difficulty, kind: "quiz", at: answeredAt }, "quiz");
  mistake.explanation = { whyWrong: r.whyWrong, correctReasoning: r.correctReasoning, retryBody: q.body, pages: r.pages };
  if (outcome === 1) {
    mistake.resolvedAt = answeredAt;
    return;
  }
  replay.mistakes.push({
    concept: r.concept,
    source: "quiz",
    prompt: q.body,
    response: chosenText(q, r.response, true),
    misconception: mistake.misconception,
    explanation: null,
    resolved: false,
    resolvedAt: null,
    at: answeredAt,
  });
}

function runSession(
  s: ScriptedSession,
  start: Date,
  replay: Replay,
  attempts: DemoAttempt[],
  index: number,
  goal: { weightage: DemoHistory["weightage"]; examDate: Date },
): DemoSession {
  const script = findTutorScript(s.concept);
  if (!script) throw new Error(`demo history: no tutor script for ${s.concept}`);

  // Planned minutes + reason from Study Now at that moment, as the learn service does.
  const rec = recommendNext({
    concepts: replay.engineConcepts(start, goal.weightage),
    minutesPerDay: DEMO_MINUTES_PER_DAY,
    examDate: goal.examDate,
    now: start,
    skipDates: [],
  });
  const plan = planForConcept(rec, {
    id: s.concept,
    estMinutes: DEMO_CONCEPTS.find((c) => c.name === s.concept)?.estMinutes ?? 30,
  });

  const masteryBefore = replay.masteryAt(s.concept, start);
  const turns: DemoTurn[] = [];
  let at = addSeconds(start, 5);
  turns.push({
    role: "tutor",
    content: script.probe,
    stage: "probe",
    evaluation: "not_applicable",
    misconception: null,
    sources: sources(s.openingPages),
    at,
  });

  let ladder = initialLadder();
  let lastTutor = script.probe;
  for (const r of s.replies) {
    // Reading the tutor turn + typing the reply (~85 characters a minute).
    at = addSeconds(at, Math.round(70 + 0.7 * r.student.length));
    const before = ladder;
    ladder = nextLadder(before, r.evaluation);
    if (ladder.stage !== r.stage) {
      throw new Error(`demo history: ${s.concept} reply expected stage ${r.stage}, ladder says ${ladder.stage}`);
    }
    const outcome = outcomeOf(r.evaluation);
    const misconception = outcome < 1 ? (r.misconception ?? null) : null;
    turns.push({ role: "student", content: r.student, stage: before.stage, evaluation: null, misconception: null, sources: [], at });
    turns.push({
      role: "tutor",
      content: r.tutor,
      stage: ladder.stage,
      evaluation: r.evaluation,
      misconception,
      sources: sources(r.pages),
      at: addSeconds(at, 1),
    });
    replay.evidence(
      s.concept,
      { outcome, difficulty: STAGE_DIFFICULTY[before.stage], kind: "socratic", at },
      "socratic",
    );
    if (outcome < 1) {
      replay.mistakes.push({
        concept: s.concept,
        source: "socratic",
        prompt: lastTutor,
        response: r.student,
        misconception,
        explanation: null,
        resolved: false,
        resolvedAt: null,
        at,
      });
    }
    lastTutor = r.tutor;
  }
  if (ladder.stage !== "check") throw new Error(`demo history: ${s.concept} session never reached the check stage`);

  for (const c of s.checks) {
    const q = bankQuestionByBody(c.body);
    if (q.concept !== s.concept) throw new Error(`demo history: check "${c.body}" is not about ${s.concept}`);
    at = addSeconds(at, 75);
    const outcome = grade(q, c.response);
    attempts.push({ concept: s.concept, questionBody: q.body, response: c.response, outcome, session: index, at });
    replay.evidence(s.concept, { outcome, difficulty: q.difficulty, kind: "check", at }, "check");
    if (outcome < 1) {
      replay.mistakes.push({
        concept: s.concept,
        source: "check",
        prompt: q.body,
        response: chosenText(q, c.response, true),
        misconception: null,
        explanation: null,
        resolved: false,
        resolvedAt: null,
        at,
      });
    }
  }

  const completedAt = new Date(start.getTime() + s.minutes * 60_000);
  if (completedAt <= at) throw new Error(`demo history: ${s.concept} session is too short for its turns`);
  return {
    concept: s.concept,
    plannedMin: plan.plannedMin,
    actualMin: s.minutes,
    masteryBefore,
    masteryAfter: replay.masteryAt(s.concept, completedAt),
    reason: plan.reason,
    ladder,
    turns,
    createdAt: start,
    completedAt,
  };
}
