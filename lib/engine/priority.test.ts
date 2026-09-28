import { describe, expect, it } from "vitest";
import { MAX_LEARN_BLOCK, MIN_LEARN_BLOCK, PREREQ_GATE, PRIORITY_WEIGHTS } from "./constants";
import { logit } from "./mastery";
import {
  buildReason,
  determineMode,
  gateChain,
  minutesNeeded,
  mistakeRateOf,
  rankConcepts,
  recommendNext,
  scoreComponents,
} from "./priority";
import type { ComponentKey, EngineConcept, MasteryState, RankedConcept } from "./types";

const DAY_MS = 86_400_000;
// Local calendar dates: the engine counts days in the caller's local calendar.
const NOW = new Date(2026, 8, 1, 9, 0);
const inDays = (n: number) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n, 9, 0);

/** Assessed mastery at display value `p` (0..1). */
function assessed(p: number, evidenceCount = 3, lastPracticedAt: Date | null = null): MasteryState {
  return { theta: logit(p), evidenceCount, lastPracticedAt };
}

const UNKNOWN: MasteryState = { theta: 0, evidenceCount: 0, lastPracticedAt: null };

function concept(id: string, over: Partial<EngineConcept> = {}): EngineConcept {
  return {
    id,
    name: id,
    unit: "Unit 1",
    weightage: 0.1,
    weightageSource: "pyq",
    estMinutes: 40,
    mastery: UNKNOWN,
    prereqIds: [],
    recentMistakes: 0,
    recurringMisconceptions: 0,
    ...over,
  };
}

const byId = (rows: RankedConcept[]) => new Map(rows.map((r) => [r.conceptId, r]));
const KEYS: ComponentKey[] = ["weightage", "gap", "unlock", "mistakeRate", "decay"];

describe("priority weights", () => {
  it("match idea.md §5.2 and sum to 1", () => {
    expect(PRIORITY_WEIGHTS).toEqual({ weightage: 0.3, gap: 0.3, unlock: 0.2, mistakeRate: 0.1, decay: 0.1 });
    expect(KEYS.reduce((s, k) => s + PRIORITY_WEIGHTS[k], 0)).toBeCloseTo(1, 12);
  });

  it("value = Σ weight·component and contributions carry each term", () => {
    const concepts = [
      concept("A", { weightage: 0.4, mastery: assessed(0.3), recentMistakes: 2 }),
      concept("B", { weightage: 0.2, prereqIds: ["A"] }),
      concept("C", { weightage: 0.1, prereqIds: ["B"] }),
    ];
    for (const r of rankConcepts(concepts, NOW)) {
      for (const k of KEYS) expect(r.contributions[k]).toBeCloseTo(PRIORITY_WEIGHTS[k] * r.components[k], 12);
      expect(r.value).toBeCloseTo(KEYS.reduce((s, k) => s + r.contributions[k], 0), 12);
      const cost = Math.sqrt(Math.max(r.minutesNeeded, MIN_LEARN_BLOCK) / MIN_LEARN_BLOCK);
      expect(r.priority).toBeCloseTo(r.value / cost, 12);
    }
  });
});

describe("scoreComponents", () => {
  const all = [
    concept("root", { weightage: 0.4, mastery: assessed(0.25) }),
    concept("mid", { weightage: 0.2, prereqIds: ["root"] }),
    concept("leaf", { weightage: 0.1, prereqIds: ["mid"] }),
  ];

  it("normalises weightage to the heaviest concept", () => {
    expect(scoreComponents(all[0], all, NOW).weightage).toBeCloseTo(1, 12);
    expect(scoreComponents(all[1], all, NOW).weightage).toBeCloseTo(0.5, 12);
    expect(scoreComponents(all[2], all, NOW).weightage).toBeCloseTo(0.25, 12);
  });

  it("gap = 1 − mastery", () => {
    expect(scoreComponents(all[0], all, NOW).gap).toBeCloseTo(0.75, 10);
    expect(scoreComponents(all[1], all, NOW).gap).toBeCloseTo(0.5, 10);
  });

  it("unlock counts every transitive dependent, normalised to the max", () => {
    expect(scoreComponents(all[0], all, NOW).unlock).toBe(1); // mid + leaf
    expect(scoreComponents(all[1], all, NOW).unlock).toBe(0.5); // leaf
    expect(scoreComponents(all[2], all, NOW).unlock).toBe(0);
  });

  it("decay is 0 for a concept that was never practised", () => {
    expect(scoreComponents(all[0], all, NOW).decay).toBe(0);
  });
});

describe("mistakeRateOf", () => {
  it("counts recurring misconceptions as 1.5 extra mistakes and saturates at 4", () => {
    expect(mistakeRateOf({ recentMistakes: 0, recurringMisconceptions: 0 })).toBe(0);
    expect(mistakeRateOf({ recentMistakes: 2, recurringMisconceptions: 0 })).toBe(0.5);
    expect(mistakeRateOf({ recentMistakes: 2, recurringMisconceptions: 1 })).toBeCloseTo(0.875, 12);
    expect(mistakeRateOf({ recentMistakes: 9, recurringMisconceptions: 3 })).toBe(1);
  });

  it("ignores negative counts", () => {
    expect(mistakeRateOf({ recentMistakes: -3, recurringMisconceptions: -1 })).toBe(0);
  });
});

describe("minutesNeeded", () => {
  it("is 0 once a concept reaches the mastered threshold", () => {
    expect(minutesNeeded(60, 0.8)).toBe(0);
    expect(minutesNeeded(60, 0.95)).toBe(0);
  });

  it("scales with the gap, rounds to 5 and never goes below one learn block", () => {
    expect(minutesNeeded(60, 0)).toBe(60);
    expect(minutesNeeded(60, 0.4)).toBe(30);
    expect(minutesNeeded(60, 0.75)).toBe(MIN_LEARN_BLOCK);
    expect(minutesNeeded(0, 0.2)).toBe(MIN_LEARN_BLOCK);
  });
});

describe("rankConcepts", () => {
  it("ranks a heavier concept above an otherwise identical lighter one", () => {
    const ranked = rankConcepts([concept("light", { weightage: 0.05 }), concept("heavy", { weightage: 0.3 })], NOW);
    expect(ranked.map((r) => r.conceptId)).toEqual(["heavy", "light"]);
  });

  it("prefers a cheap concept over an expensive one of equal value", () => {
    const ranked = rankConcepts(
      [concept("long", { estMinutes: 120 }), concept("short", { estMinutes: 20 })],
      NOW,
    );
    expect(ranked[0].conceptId).toBe("short");
    expect(ranked[0].value).toBeCloseTo(ranked[1].value, 12);
  });

  it("puts mastered concepts last even if their value is higher", () => {
    const ranked = rankConcepts(
      [concept("done", { weightage: 0.9, mastery: assessed(0.9) }), concept("todo", { weightage: 0.01 })],
      NOW,
    );
    expect(ranked.map((r) => r.conceptId)).toEqual(["todo", "done"]);
    expect(ranked[1].minutesNeeded).toBe(0);
  });

  it("breaks exact ties by name, independent of input order", () => {
    const a = [concept("b-id", { name: "Beta" }), concept("a-id", { name: "alpha" })];
    const order1 = rankConcepts(a, NOW).map((r) => r.name);
    const order2 = rankConcepts([...a].reverse(), NOW).map((r) => r.name);
    expect(order1).toEqual(["alpha", "Beta"]);
    expect(order2).toEqual(order1);
  });

  it("reports confidence from the evidence count", () => {
    const ranked = byId(
      rankConcepts([concept("none"), concept("low", { mastery: assessed(0.4, 1) }), concept("high", { mastery: assessed(0.4, 6) })], NOW),
    );
    expect(ranked.get("none")?.confidence).toBe("none");
    expect(ranked.get("low")?.confidence).toBe("low");
    expect(ranked.get("high")?.confidence).toBe("high");
  });
});

describe("prerequisite gating", () => {
  it("gates on the weakest prerequisite below the threshold", () => {
    const ranked = byId(
      rankConcepts(
        [
          concept("P1", { mastery: assessed(0.3) }),
          concept("P2", { mastery: assessed(0.15) }),
          concept("OK", { mastery: assessed(0.7) }),
          concept("X", { prereqIds: ["P1", "P2", "OK"] }),
        ],
        NOW,
      ),
    );
    const blocked = ranked.get("X")?.blockedBy;
    expect(blocked?.conceptId).toBe("P2");
    expect(blocked?.mastery).toBeCloseTo(0.15, 10);
  });

  it("does not gate on a prerequisite at or above the threshold, or one never assessed", () => {
    const ranked = byId(
      rankConcepts(
        [
          concept("P", { mastery: assessed(PREREQ_GATE) }),
          concept("U"), // unknown → 50 %, no evidence that it's weak
          concept("X", { prereqIds: ["P", "U"] }),
        ],
        NOW,
      ),
    );
    expect(ranked.get("X")?.blockedBy).toBeNull();
  });

  it("ignores self-loops and prerequisites missing from the graph", () => {
    const ranked = byId(rankConcepts([concept("X", { prereqIds: ["X", "ghost"] })], NOW));
    expect(ranked.get("X")?.blockedBy).toBeNull();
    expect(ranked.get("X")?.components.unlock).toBe(0);
  });

  it("gateChain follows blockers recursively, nearest first", () => {
    const rows = rankConcepts(
      [
        concept("C", { mastery: assessed(0.1) }),
        concept("B", { mastery: assessed(0.2), prereqIds: ["C"] }),
        concept("A", { prereqIds: ["B"] }),
      ],
      NOW,
    );
    const map = byId(rows);
    const a = map.get("A");
    expect(a).toBeDefined();
    expect(gateChain(a as RankedConcept, map).map((r) => r.conceptId)).toEqual(["B", "C"]);
  });

  it("is cycle-safe: ranking and gate chains terminate on cyclic prerequisites", () => {
    const concepts = [
      concept("A", { mastery: assessed(0.2), prereqIds: ["C"] }),
      concept("B", { mastery: assessed(0.2), prereqIds: ["A"] }),
      concept("C", { mastery: assessed(0.2), prereqIds: ["B"] }),
    ];
    const rows = rankConcepts(concepts, NOW);
    const map = byId(rows);
    for (const r of rows) {
      const chain = gateChain(r, map);
      expect(chain.length).toBeLessThanOrEqual(2);
      expect(chain.map((c) => c.conceptId)).not.toContain(r.conceptId);
      expect(new Set(chain.map((c) => c.conceptId)).size).toBe(chain.length);
    }
    // Each concept in a 3-cycle unlocks the other two.
    for (const r of rows) expect(r.components.unlock).toBe(1);
    expect(recommendNext({ concepts, minutesPerDay: 60, examDate: inDays(20), now: NOW, skipDates: [] })).not.toBeNull();
  });
});

describe("reason strings", () => {
  it("are built from the top two contributions (weightage + gap)", () => {
    const only = concept("Normalisation", { weightage: 0.4, mastery: assessed(0.12) });
    const [r] = rankConcepts([only], NOW);
    expect(buildReason(r, [only])).toBe("High exam weightage (40% of PYQ marks) and you're at 12% mastery.");
  });

  it("say when the weightage is estimated and when confidence is low", () => {
    const only = concept("Joins", { weightage: 0.3, weightageSource: "estimated", mastery: assessed(0.27, 1) });
    const [r] = rankConcepts([only], NOW);
    expect(buildReason(r, [only])).toBe(
      "High exam weightage (~30% of marks, estimated) and you're at 27% mastery (low confidence).",
    );
  });

  it("ask for a diagnosis when there is no evidence", () => {
    const only = concept("Indexing", { weightage: 0.2 });
    const [r] = rankConcepts([only], NOW);
    expect(buildReason(r, [only])).toBe(
      "High exam weightage (20% of PYQ marks) and no evidence yet — worth diagnosing.",
    );
  });

  it("name the heaviest unlocked concept and how many more", () => {
    // A light, well-known root whose unlock term dominates.
    const concepts = [
      concept("ER Model", { weightage: 0.01, mastery: assessed(0.7) }),
      concept("Keys", { weightage: 0.3, prereqIds: ["ER Model"] }),
      concept("SQL", { weightage: 0.5, prereqIds: ["ER Model"] }),
      concept("Joins", { weightage: 0.3, prereqIds: ["SQL"] }),
    ];
    const r = byId(rankConcepts(concepts, NOW)).get("ER Model") as RankedConcept;
    expect(buildReason(r, concepts)).toBe("It unlocks SQL and 2 more and you're at 70% mastery.");
  });

  it("describe recurring misconceptions and fading from the score components", () => {
    const practised = new Date(NOW.getTime() - 30 * DAY_MS);
    const concepts = [
      concept("Heavy", { weightage: 1 }),
      concept("Deadlocks", {
        weightage: 0.001,
        mastery: { theta: 4, evidenceCount: 2, lastPracticedAt: practised },
        recentMistakes: 3,
        recurringMisconceptions: 2,
      }),
    ];
    const r = byId(rankConcepts(concepts, NOW)).get("Deadlocks") as RankedConcept;
    expect(buildReason(r, concepts)).toBe(
      "2 recurring misconceptions keep showing up and not practised for 30 days — it's fading.",
    );
  });

  it("append the prerequisite gate when there is one", () => {
    const concepts = [
      concept("Functional Dependency", { weightage: 0.05, mastery: assessed(0.22) }),
      concept("BCNF", { weightage: 0.3, prereqIds: ["Functional Dependency"] }),
    ];
    const r = byId(rankConcepts(concepts, NOW)).get("BCNF") as RankedConcept;
    expect(buildReason(r, concepts)).toMatch(
      /\. Blocked by Functional Dependency \(22% mastery\) — study that first\.$/,
    );
  });
});

describe("determineMode", () => {
  it("is revision with ≤ 3 days left, whatever the workload", () => {
    expect(determineMode({ daysLeft: 3, totalNeededMin: 9999, totalAvailableMin: 0 })).toEqual({
      mode: "revision",
      reason: "3 days left — revision mode: weakest high-weightage topics first.",
    });
    expect(determineMode({ daysLeft: 1, totalNeededMin: 0, totalAvailableMin: 100 }).reason).toBe(
      "1 day left — revision mode: weakest high-weightage topics first.",
    );
    expect(determineMode({ daysLeft: 0, totalNeededMin: 0, totalAvailableMin: 0 }).reason).toMatch(/^Exam day/);
  });

  it("is triage when more minutes are needed than are available", () => {
    expect(determineMode({ daysLeft: 10, totalNeededMin: 601, totalAvailableMin: 600 })).toEqual({
      mode: "triage",
      reason: "Not enough time: 601 min needed, 600 min available — dropping low-weightage topics.",
    });
  });

  it("is learn when the work fits", () => {
    expect(determineMode({ daysLeft: 12, totalNeededMin: 600, totalAvailableMin: 600 })).toEqual({
      mode: "learn",
      reason: "12 days left — learning new concepts.",
    });
  });
});

describe("recommendNext", () => {
  const base = { minutesPerDay: 60, examDate: inDays(20), now: NOW, skipDates: [] };

  it("returns null with no concepts or when everything is mastered", () => {
    expect(recommendNext({ ...base, concepts: [] })).toBeNull();
    expect(recommendNext({ ...base, concepts: [concept("A", { mastery: assessed(0.9) })] })).toBeNull();
  });

  it("recommends the top-ranked concept with a reason and a bounded block", () => {
    const concepts = [
      concept("SQL", { weightage: 0.4, mastery: assessed(0.3) }),
      concept("ER Model", { weightage: 0.1 }),
      concept("Indexing", { weightage: 0.2 }),
    ];
    const rec = recommendNext({ ...base, concepts });
    expect(rec?.conceptId).toBe(rankConcepts(concepts, NOW)[0].conceptId);
    expect(rec?.mode).toBe("learn");
    expect(rec?.reason.length).toBeGreaterThan(10);
    expect(rec?.gatedFor).toBeNull();
    expect(rec?.minutes).toBeGreaterThanOrEqual(MIN_LEARN_BLOCK);
    expect(rec?.minutes).toBeLessThanOrEqual(MAX_LEARN_BLOCK);
    expect(rec?.minutes ? rec.minutes % 5 : -1).toBe(0);
    expect(rec?.alternatives.map((a) => a.conceptId)).not.toContain(rec?.conceptId);
    expect(rec?.alternatives.length).toBeLessThanOrEqual(3);
  });

  it("recommends the deepest weak prerequisite of a gated top concept", () => {
    const concepts = [
      concept("C", { name: "Relational Model", weightage: 0.02, estMinutes: 120, mastery: assessed(0.12) }),
      concept("B", { name: "Functional Dependency", weightage: 0.02, estMinutes: 120, mastery: assessed(0.2), prereqIds: ["C"] }),
      concept("A", { name: "BCNF", weightage: 0.6, estMinutes: 10, prereqIds: ["B"] }),
    ];
    expect(rankConcepts(concepts, NOW)[0].conceptId).toBe("A");
    const rec = recommendNext({ ...base, concepts });
    expect(rec?.conceptId).toBe("C");
    expect(rec?.gatedFor).toEqual({ conceptId: "A", name: "BCNF" });
    expect(rec?.reason).toBe(
      "Blocked by Relational Model (12% mastery) — it's a prerequisite for Functional Dependency, which BCNF needs.",
    );
  });

  it("never asks for more than the day's learn minutes (min one block)", () => {
    const concepts = [concept("Big", { estMinutes: 240 })];
    expect(recommendNext({ ...base, minutesPerDay: 60, concepts })?.minutes).toBe(35); // 60 − 25 reserved
    expect(recommendNext({ ...base, minutesPerDay: 20, concepts })?.minutes).toBe(20);
    expect(recommendNext({ ...base, minutesPerDay: 5, concepts })?.minutes).toBe(MIN_LEARN_BLOCK);
  });

  it("switches to a revision pick close to the exam", () => {
    const concepts = [
      concept("Weak heavy", { weightage: 0.5, mastery: assessed(0.2) }),
      concept("Strong", { weightage: 0.5, mastery: assessed(0.75) }),
    ];
    const rec = recommendNext({ ...base, examDate: inDays(2), concepts });
    expect(rec?.mode).toBe("revision");
    expect(rec?.conceptId).toBe("Weak heavy");
    expect(rec?.reason).toMatch(/^Revision: /);
  });

  it("is deterministic", () => {
    const concepts = [
      concept("A", { weightage: 0.3, mastery: assessed(0.4) }),
      concept("B", { weightage: 0.3, prereqIds: ["A"] }),
      concept("C", { weightage: 0.2, recentMistakes: 2 }),
    ];
    const first = recommendNext({ ...base, concepts });
    expect(recommendNext({ ...base, concepts: [...concepts].reverse() })).toEqual(first);
  });
});
