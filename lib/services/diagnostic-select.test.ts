import { describe, expect, it } from "vitest";
import {
  buildSelectorConcepts,
  candidateScores,
  DIAGNOSTIC_MAX_QUESTIONS,
  pickNext,
  pickReasonText,
  plannedTotal,
  rankCandidates,
  transitiveDependentCounts,
  type AskedEntry,
  type SelectorState,
} from "./diagnostic-select";
import type { Outcome } from "@/lib/engine/types";

// A small DBMS-like graph (prerequisite → dependent):
//   er → relational → sql → joins
//   relational → fd → nf → bcnf
//   txn → serial → recover            (unit 3)
//   indexing (unit 4, isolated)
const concepts = [
  { id: "er", unit: "U1", weightage: 0.05 },
  { id: "relational", unit: "U1", weightage: 0.08 },
  { id: "sql", unit: "U2", weightage: 0.12 },
  { id: "joins", unit: "U2", weightage: 0.06 },
  { id: "fd", unit: "U2", weightage: 0.1 },
  { id: "nf", unit: "U2", weightage: 0.1 },
  { id: "bcnf", unit: "U2", weightage: 0.04 },
  { id: "txn", unit: "U3", weightage: 0.07 },
  { id: "serial", unit: "U3", weightage: 0.18 },
  { id: "recover", unit: "U3", weightage: 0.05 },
  { id: "indexing", unit: "U4", weightage: 0.15 },
];
const edges = [
  { from: "er", to: "relational" },
  { from: "relational", to: "sql" },
  { from: "sql", to: "joins" },
  { from: "relational", to: "fd" },
  { from: "fd", to: "nf" },
  { from: "nf", to: "bcnf" },
  { from: "txn", to: "serial" },
  { from: "serial", to: "recover" },
];
const graph = buildSelectorConcepts(concepts, edges);
const fullPool = Object.fromEntries(concepts.map((c) => [c.id, 1]));

function state(asked: AskedEntry[], pool: Record<string, number> = fullPool, max?: number): SelectorState {
  return { concepts: graph, asked, poolByConcept: pool, maxQuestions: max };
}

/** Run a whole diagnostic with a fixed answering policy. */
function simulate(answer: (conceptId: string) => Outcome, pool = fullPool, max?: number) {
  const asked: AskedEntry[] = [];
  for (let i = 0; i < 50; i++) {
    const p = pickNext(state(asked, pool, max));
    if (!p) break;
    asked.push({ conceptId: p.conceptId, outcome: answer(p.conceptId) });
  }
  return asked;
}

describe("buildSelectorConcepts", () => {
  it("derives prerequisites and dependents, ignoring self, duplicate and dangling edges", () => {
    const g = buildSelectorConcepts(
      [
        { id: "a", unit: "U", weightage: 0.5 },
        { id: "b", unit: "U", weightage: 0.5 },
      ],
      [
        { from: "a", to: "b" },
        { from: "a", to: "b" },
        { from: "a", to: "a" },
        { from: "a", to: "ghost" },
      ],
    );
    expect(g[0]).toMatchObject({ id: "a", prereqIds: [], dependentIds: ["b"] });
    expect(g[1]).toMatchObject({ id: "b", prereqIds: ["a"], dependentIds: [] });
  });
});

describe("candidate scoring", () => {
  it("counts transitive dependents", () => {
    const d = transitiveDependentCounts(graph);
    expect(d.get("er")).toBe(6); // relational, sql, joins, fd, nf, bcnf
    expect(d.get("relational")).toBe(5);
    expect(d.get("txn")).toBe(2);
    expect(d.get("joins")).toBe(0);
    expect(d.get("indexing")).toBe(0);
  });

  it("is cycle-safe", () => {
    const g = buildSelectorConcepts(
      [
        { id: "a", unit: "U", weightage: 0.3 },
        { id: "b", unit: "U", weightage: 0.3 },
        { id: "c", unit: "U", weightage: 0.4 },
      ],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ],
    );
    expect(transitiveDependentCounts(g).get("a")).toBe(2);
    const asked = simulateOn(g, () => 0);
    expect(new Set(asked.map((x) => x.conceptId)).size).toBe(3);
  });

  it("scores = 0.6·normWeightage + 0.4·normDependents, in [0, 1]", () => {
    const s = candidateScores(graph);
    // serial: max weightage (0.18) → 0.6; 1 dependent of max 6 → 0.4/6
    expect(s.get("serial")).toBeCloseTo(0.6 + 0.4 / 6, 6);
    // er: 0.05/0.18 weightage, max dependents
    expect(s.get("er")).toBeCloseTo(0.6 * (0.05 / 0.18) + 0.4, 6);
    for (const v of s.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("handles all-zero weightage and no edges", () => {
    const g = buildSelectorConcepts(
      [
        { id: "a", unit: "U", weightage: 0 },
        { id: "b", unit: "U", weightage: 0 },
      ],
      [],
    );
    expect([...candidateScores(g).values()]).toEqual([0, 0]);
    // tie → syllabus order
    expect(rankCandidates(g).map((c) => c.id)).toEqual(["a", "b"]);
    expect(pickNext({ concepts: g, asked: [], poolByConcept: { a: 1, b: 1 } })?.conceptId).toBe("a");
  });

  it("prerequisite roots with high weightage rank near the top", () => {
    const ranked = rankCandidates(graph).map((c) => c.id);
    expect(ranked.slice(0, 3)).toContain("er");
    expect(ranked.slice(0, 3)).toContain("serial");
    expect(ranked.indexOf("bcnf")).toBeGreaterThan(ranked.indexOf("fd"));
  });
});

describe("pickNext", () => {
  it("starts with the best candidate", () => {
    const first = pickNext(state([]));
    const ranked = rankCandidates(graph);
    expect(first).toMatchObject({ conceptId: ranked[0].id, reason: "start", fromId: null });
  });

  it("after a WRONG answer probes down to a prerequisite with pool questions", () => {
    const p = pickNext(state([{ conceptId: "nf", outcome: 0 }]));
    expect(p).toMatchObject({ conceptId: "fd", reason: "probe_down", fromId: "nf" });
  });

  it("probes further down when the direct prerequisite has no questions", () => {
    const pool = { ...fullPool, fd: 0 };
    const p = pickNext(state([{ conceptId: "nf", outcome: 0 }], pool));
    expect(p).toMatchObject({ conceptId: "relational", reason: "probe_down" });
  });

  it("skips prerequisites that were already asked", () => {
    const p = pickNext(
      state([
        { conceptId: "fd", outcome: 1 },
        { conceptId: "nf", outcome: 0 },
      ]),
    );
    expect(p).toMatchObject({ conceptId: "relational", reason: "probe_down" });
  });

  it("after a CORRECT answer probes up to a high-value dependent", () => {
    const p = pickNext(state([{ conceptId: "txn", outcome: 1 }]));
    expect(p).toMatchObject({ conceptId: "serial", reason: "probe_up", fromId: "txn" });
  });

  it("after a CORRECT answer skips low-value dependents and covers a new unit", () => {
    // bcnf is the only dependent of nf and scores low → coverage instead
    const p = pickNext(state([{ conceptId: "nf", outcome: 1 }]));
    expect(p?.reason).toBe("coverage");
    expect(p?.conceptId).not.toBe("bcnf");
    expect(graph.find((c) => c.id === p?.conceptId)?.unit).not.toBe("U2");
  });

  it("partial answers go to coverage (no probe)", () => {
    const p = pickNext(state([{ conceptId: "nf", outcome: 0.5 }]));
    expect(p?.reason).toBe("coverage");
  });

  it("prefers uncovered units, then the best remaining concept", () => {
    const asked: AskedEntry[] = [
      { conceptId: "er", outcome: 0.5 },
      { conceptId: "sql", outcome: 0.5 },
      { conceptId: "serial", outcome: 0.5 },
      { conceptId: "indexing", outcome: 0.5 },
    ];
    const p = pickNext(state(asked));
    expect(p?.reason).toBe("best");
    expect(asked.map((a) => a.conceptId)).not.toContain(p?.conceptId);
  });

  it("never asks the same concept twice and stops at the maximum", () => {
    for (const policy of [() => 0 as Outcome, () => 1 as Outcome, (id: string) => (id.length % 2 ? 1 : 0) as Outcome]) {
      const run = simulate(policy);
      const ids = run.map((a) => a.conceptId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(DIAGNOSTIC_MAX_QUESTIONS);
    }
  });

  it("respects a custom maximum", () => {
    expect(simulate(() => 1, fullPool, 5)).toHaveLength(5);
  });

  it("stops when the pool is exhausted", () => {
    const pool = { er: 1, serial: 2, indexing: 1 };
    const run = simulate(() => 0, pool);
    expect(run.map((a) => a.conceptId).sort()).toEqual(["er", "indexing", "serial"]);
    expect(pickNext(state(run, pool))).toBeNull();
    expect(pickNext(state([], {}))).toBeNull();
  });

  it("caps probes per unit so a wrong streak still covers other units", () => {
    const run = simulate(() => 0);
    const units = new Set(run.map((a) => graph.find((c) => c.id === a.conceptId)!.unit));
    expect(units.size).toBe(4);
  });

  it("is deterministic", () => {
    const policy = (id: string) => (["er", "serial", "fd"].includes(id) ? 0 : 1) as Outcome;
    expect(simulate(policy)).toEqual(simulate(policy));
  });
});

describe("plannedTotal", () => {
  it("is min(max, concepts with pool questions)", () => {
    expect(plannedTotal(state([]))).toBe(10);
    expect(plannedTotal(state([], { er: 1, sql: 3 }))).toBe(2);
    expect(plannedTotal(state([], {}))).toBe(0);
  });

  it("keeps counting asked concepts whose pool is now empty", () => {
    expect(plannedTotal(state([{ conceptId: "er", outcome: 1 }], { er: 0, sql: 1 }))).toBe(2);
  });
});

describe("pickReasonText", () => {
  const names = new Map(concepts.map((c) => [c.id, { name: c.id.toUpperCase(), unit: c.unit }]));
  it("explains each pick", () => {
    expect(pickReasonText({ conceptId: "er", reason: "start", fromId: null, score: 1 }, names, 6)).toMatch(/unlocks 6/);
    expect(pickReasonText({ conceptId: "fd", reason: "probe_down", fromId: "nf", score: 1 }, names, 0)).toMatch(/prerequisite of NF/);
    expect(pickReasonText({ conceptId: "serial", reason: "probe_up", fromId: "txn", score: 1 }, names, 0)).toMatch(/TXN/);
    expect(pickReasonText({ conceptId: "indexing", reason: "coverage", fromId: null, score: 1 }, names, 0)).toMatch(/U4/);
  });
});

function simulateOn(g: ReturnType<typeof buildSelectorConcepts>, answer: (id: string) => Outcome) {
  const pool = Object.fromEntries(g.map((c) => [c.id, 1]));
  const asked: AskedEntry[] = [];
  for (let i = 0; i < 20; i++) {
    const p = pickNext({ concepts: g, asked, poolByConcept: pool });
    if (!p) break;
    asked.push({ conceptId: p.conceptId, outcome: answer(p.conceptId) });
  }
  return asked;
}
