import { describe, expect, it } from "vitest";
import { parseSyllabusText } from "@/lib/ai/offline/syllabus";
import { resolveScript } from "@/lib/ai/offline/scripts";
import { gradeObjective, parseFirstNumber, resolveOptionIndex } from "@/lib/engine/grade";
import {
  CONCEPT_NAMES,
  CONCEPT_PREREQS,
  findBankQuestions,
  findTutorScript,
  QUESTION_BANK,
  TUTOR_SCRIPTS,
} from "./bank";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const canonical = new Set(TUTOR_SCRIPTS.map((s) => s.concept));

describe("question bank", () => {
  it("every MCQ has 4 distinct, non-empty options and a valid answer index", () => {
    for (const q of QUESTION_BANK.filter((x) => x.type === "mcq")) {
      const opts = q.options ?? [];
      expect(opts, q.body).toHaveLength(4);
      expect(opts.every((o) => o.trim().length > 0), q.body).toBe(true);
      expect(new Set(opts.map(norm)).size, q.body).toBe(4);
      expect(["0", "1", "2", "3"], q.body).toContain(q.answer);
      expect(resolveOptionIndex(q.answer, opts), q.body).toBe(Number(q.answer));
    }
  });

  it("every numeric answer parses as a finite number and has no options", () => {
    for (const q of QUESTION_BANK.filter((x) => x.type === "numeric")) {
      expect(q.options, q.body).toBeNull();
      const n = parseFirstNumber(q.answer);
      expect(n, q.body).not.toBeNull();
      expect(Number.isFinite(Number(q.answer)), q.body).toBe(true);
      expect(n, q.body).toBe(Number(q.answer));
    }
  });

  it("every answer key grades as fully correct through the real grader", () => {
    for (const q of QUESTION_BANK) {
      expect(gradeObjective({ type: q.type, answer: q.answer, options: q.options }, q.answer).outcome, q.body).toBe(1);
    }
  });

  it("has sane metadata: difficulty range, purposes, explanation, unique bodies", () => {
    for (const q of QUESTION_BANK) {
      expect(q.difficulty, q.body).toBeGreaterThanOrEqual(-2);
      expect(q.difficulty, q.body).toBeLessThanOrEqual(2);
      expect(q.purposes.length, q.body).toBeGreaterThan(0);
      expect(new Set(q.purposes).size, q.body).toBe(q.purposes.length);
      expect(q.body.trim().length, q.body).toBeGreaterThanOrEqual(8);
      expect(q.explanation.trim().length, q.body).toBeGreaterThan(10);
    }
    expect(new Set(QUESTION_BANK.map((q) => norm(q.body))).size).toBe(QUESTION_BANK.length);
  });

  it("gives every concept ≥ 3 questions: ≥ 1 diagnostic and ≥ 2 practice/check", () => {
    for (const name of canonical) {
      const qs = QUESTION_BANK.filter((q) => q.concept === name);
      expect(qs.length, name).toBeGreaterThanOrEqual(3);
      expect(qs.filter((q) => q.purposes.includes("diagnostic")).length, name).toBeGreaterThanOrEqual(1);
      const usable = qs.filter((q) => q.purposes.includes("practice") || q.purposes.includes("check"));
      expect(usable.length, name).toBeGreaterThanOrEqual(2);
    }
  });

  it("findBankQuestions matches by alias and filters by purpose", () => {
    expect(findBankQuestions("Precedence Graph").every((q) => q.concept === CONCEPT_NAMES.conflict)).toBe(true);
    expect(findBankQuestions("2pl", "diagnostic")).toHaveLength(1);
    expect(findBankQuestions("no such topic")).toEqual([]);
  });
});

describe("tutor scripts", () => {
  it("cover every concept named in the bank and the prerequisite map", () => {
    const named = new Set([
      ...QUESTION_BANK.map((q) => q.concept),
      ...Object.keys(CONCEPT_PREREQS),
      ...Object.values(CONCEPT_PREREQS).flat(),
    ]);
    for (const name of named) expect(findTutorScript(name)?.concept, name).toBe(name);
    expect(new Set(Object.keys(CONCEPT_PREREQS))).toEqual(canonical);
    expect(canonical.size).toBe(TUTOR_SCRIPTS.length);
  });

  it("are complete: aliases, key ideas, ladder texts and 2–3 misconceptions", () => {
    for (const s of TUTOR_SCRIPTS) {
      expect(s.aliases.length, s.concept).toBeGreaterThan(0);
      expect(s.keyIdeas.length, s.concept).toBeGreaterThanOrEqual(3);
      for (const text of [s.probe, s.hint1, s.hint2, s.workedStep, s.checkPrompt]) {
        expect(text.trim().length, s.concept).toBeGreaterThan(20);
      }
      expect(s.misconceptions.length, s.concept).toBeGreaterThanOrEqual(2);
      expect(s.misconceptions.length, s.concept).toBeLessThanOrEqual(3);
      for (const m of s.misconceptions) {
        expect(m.triggers.length, m.label).toBeGreaterThan(0);
        expect(m.label.trim().length, s.concept).toBeGreaterThan(0);
        expect(m.nudge.trim().length, m.label).toBeGreaterThan(0);
      }
      expect(new Set(s.misconceptions.map((m) => norm(m.label))).size, s.concept).toBe(s.misconceptions.length);
    }
  });

  it("never share a name or alias between two scripts (exact lookup is unambiguous)", () => {
    const owner = new Map<string, string>();
    for (const s of TUTOR_SCRIPTS) {
      for (const n of [s.concept, ...s.aliases]) {
        const k = norm(n);
        const prev = owner.get(k);
        if (prev !== undefined && prev !== s.concept) throw new Error(`"${n}" belongs to ${prev} and ${s.concept}`);
        owner.set(k, s.concept);
      }
    }
  });
});

describe("prerequisite map", () => {
  it("has no self-loops and no cycles", () => {
    const state = new Map<string, "visiting" | "done">();
    const visit = (name: string, path: string[]): void => {
      if (state.get(name) === "done") return;
      if (state.get(name) === "visiting") throw new Error(`cycle: ${[...path, name].join(" → ")}`);
      state.set(name, "visiting");
      for (const p of CONCEPT_PREREQS[name] ?? []) {
        expect(p, name).not.toBe(name);
        visit(p, [...path, name]);
      }
      state.set(name, "done");
    };
    for (const name of Object.keys(CONCEPT_PREREQS)) visit(name, []);
  });
});

describe("offline syllabus parsing with the bank", () => {
  const ANNA = `UNIT I RELATIONAL DATABASES 10
Purpose of Database System – Views of data – Data Models – Database System Architecture – Introduction to relational databases – Relational Model – Keys – Relational Algebra – SQL fundamentals – Advanced SQL features – Embedded SQL– Dynamic SQL
UNIT II DATABASE DESIGN 8
Entity-Relationship model – E-R Diagrams – Enhanced-ER Model – ER-to-Relational Mapping – Functional Dependencies – Non-loss Decomposition – First, Second, Third Normal Forms, Dependency Preservation – Boyce/Codd Normal Form – Multi-valued Dependencies and Fourth Normal Form – Join Dependencies and Fifth Normal Form
UNIT III TRANSACTIONS 9
Transaction Concepts – ACID Properties – Schedules – Serializability – Transaction support in SQL – Need for Concurrency – Concurrency control –Two Phase Locking- Timestamp – Multiversion – Validation and Snapshot isolation– Multiple Granularity locking – Deadlock Handling – Recovery Concepts – Recovery based on deferred and immediate update – Shadow paging – ARIES Algorithm
UNIT IV IMPLEMENTATION TECHNIQUES 9
RAID – File Organization – Organization of Records in Files – Data dictionary Storage – Column Oriented Storage– Indexing and Hashing –Ordered Indices – B+ tree Index Files – B tree Index Files – Static Hashing – Dynamic Hashing – Query Processing Overview – Algorithms for Selection, Sorting and join operations – Query optimization using Heuristics - Cost Estimation.`;

  it("maps a pasted DBMS syllabus onto bank concepts and infers prerequisite edges", () => {
    const g = parseSyllabusText("Database Management Systems", ANNA);
    const resolved = new Set(g.concepts.map((c) => resolveScript(c.name)?.concept).filter(Boolean));
    expect(resolved.size).toBeGreaterThanOrEqual(15);
    for (const name of [CONCEPT_NAMES.relational, CONCEPT_NAMES.acid, CONCEPT_NAMES.conflict, CONCEPT_NAMES.twoPL, CONCEPT_NAMES.bplus]) {
      expect(resolved.has(name), name).toBe(true);
    }

    const byKey = new Map(g.concepts.map((c) => [c.key, c]));
    const edges = g.concepts.flatMap((c) =>
      c.prereqKeys.map((k) => [resolveScript(byKey.get(k)?.name ?? "")?.concept, resolveScript(c.name)?.concept]),
    );
    expect(edges.length).toBeGreaterThanOrEqual(10);
    // every inferred edge is a CONCEPT_PREREQS pair
    for (const [from, to] of edges) {
      expect(to && from && (CONCEPT_PREREQS[to] ?? []).includes(from), `${from} → ${to}`).toBe(true);
    }
    expect(edges).toContainEqual([CONCEPT_NAMES.conflict, CONCEPT_NAMES.twoPL]);
  });

  it("resolves common syllabus phrasings to the right script", () => {
    const cases: Array<[string, string | null]> = [
      ["Normal Forms", CONCEPT_NAMES.normalForms],
      ["Multi-valued Dependencies and Fourth Normal Form", null],
      ["Loss less join decompositions", CONCEPT_NAMES.lossless],
      ["Conflict & View Serializable Schedule", CONCEPT_NAMES.conflict],
      ["Recovery Concepts", CONCEPT_NAMES.logRecovery],
      ["Recoverable Schedules", CONCEPT_NAMES.recoverability],
      ["Time Stamping Protocols for Concurrency Control", CONCEPT_NAMES.timestamp],
      ["Reduction of an ER Diagrams to Tables", CONCEPT_NAMES.erMapping],
      ["B+ tree Index Files", CONCEPT_NAMES.bplus],
    ];
    for (const [phrase, expected] of cases) expect(resolveScript(phrase)?.concept ?? null, phrase).toBe(expected);
  });
});
