import { describe, expect, it } from "vitest";
import {
  BAND_STRONG_FROM,
  BAND_WEAK_BELOW,
  DECAY_MAX_DROP,
  EVIDENCE_WEIGHT,
  K_MAX,
  K_MIN,
  THETA_MAX,
  THETA_MIN,
} from "./constants";
import {
  applyUnitPrior,
  bandOf,
  confidenceOf,
  daysFromDecay,
  decayAmount,
  decayedMastery,
  displayMastery,
  halfLifeDays,
  initialMastery,
  kFactor,
  logit,
  sigmoid,
  unitMastery,
  updateMastery,
} from "./mastery";
import type { Evidence, EvidenceKind, MasteryState, Outcome } from "./types";

const DAY_MS = 86_400_000;
const T0 = new Date(Date.UTC(2026, 8, 1, 9, 0));
const daysAfter = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

function state(theta: number, evidenceCount: number, lastPracticedAt: Date | null = null): MasteryState {
  return { theta, evidenceCount, lastPracticedAt };
}

function ev(outcome: Outcome, difficulty = 0, kind: EvidenceKind = "quiz", at: Date = T0): Evidence {
  return { outcome, difficulty, kind, at };
}

describe("sigmoid / logit", () => {
  it("are inverses and centred on 50%", () => {
    expect(sigmoid(0)).toBe(0.5);
    for (const p of [0.1, 0.35, 0.5, 0.8, 0.95]) expect(sigmoid(logit(p))).toBeCloseTo(p, 10);
  });

  it("logit stays finite at 0 and 1", () => {
    expect(Number.isFinite(logit(0))).toBe(true);
    expect(Number.isFinite(logit(1))).toBe(true);
  });
});

describe("updateMastery (Elo-lite)", () => {
  it("a correct answer raises theta and a wrong one lowers it", () => {
    const s = initialMastery();
    expect(updateMastery(s, ev(1)).theta).toBeGreaterThan(s.theta);
    expect(updateMastery(s, ev(0)).theta).toBeLessThan(s.theta);
  });

  it("partial credit at exactly the expected level leaves theta unchanged", () => {
    // p = σ(0 − 0) = 0.5, outcome 0.5 → no surprise, no update.
    expect(updateMastery(initialMastery(), ev(0.5)).theta).toBeCloseTo(0, 12);
  });

  it("solving a harder question moves theta more than solving an easy one", () => {
    const s = initialMastery();
    const easy = updateMastery(s, ev(1, -2)).theta;
    const hard = updateMastery(s, ev(1, 2)).theta;
    expect(hard).toBeGreaterThan(easy);
  });

  it("missing an easy question costs more than missing a hard one", () => {
    const s = initialMastery();
    const easy = updateMastery(s, ev(0, -2)).theta;
    const hard = updateMastery(s, ev(0, 2)).theta;
    expect(easy).toBeLessThan(hard);
  });

  it("adds the evidence weight of each kind to the evidence count", () => {
    const s = state(0, 1);
    for (const kind of ["quiz", "diagnostic", "check", "socratic"] as const) {
      expect(updateMastery(s, ev(1, 0, kind)).evidenceCount).toBeCloseTo(1 + EVIDENCE_WEIGHT[kind], 12);
    }
  });

  it("a Socratic reply moves theta half as much as a quiz answer", () => {
    const s = state(0.3, 2);
    const quiz = updateMastery(s, ev(1, 0, "quiz")).theta - s.theta;
    const socratic = updateMastery(s, ev(1, 0, "socratic")).theta - s.theta;
    expect(socratic / quiz).toBeCloseTo(EVIDENCE_WEIGHT.socratic / EVIDENCE_WEIGHT.quiz, 10);
  });

  it("the same answer moves theta less once there is more evidence (K shrinks)", () => {
    const fresh = updateMastery(state(0, 0), ev(1)).theta;
    const seasoned = updateMastery(state(0, 12), ev(1)).theta;
    expect(fresh).toBeGreaterThan(seasoned);
    expect(seasoned).toBeGreaterThan(0);
  });

  it("clamps theta to [THETA_MIN, THETA_MAX] on long streaks", () => {
    let up = initialMastery();
    let down = initialMastery();
    for (let i = 0; i < 200; i++) {
      up = updateMastery(up, ev(1, 2));
      down = updateMastery(down, ev(0, -2));
    }
    expect(up.theta).toBeLessThanOrEqual(THETA_MAX);
    expect(down.theta).toBeGreaterThanOrEqual(THETA_MIN);
    expect(up.theta).toBeGreaterThan(THETA_MAX - 1);
    expect(down.theta).toBeLessThan(THETA_MIN + 1);
  });

  it("records practice time for real evidence and never mutates the input", () => {
    const s = state(0, 1, T0);
    const at = daysAfter(T0, 3);
    const next = updateMastery(s, ev(1, 0, "quiz", at));
    expect(next.lastPracticedAt).toEqual(at);
    expect(s).toEqual(state(0, 1, T0));
  });

  it("a unit_prior piece of evidence does not count as practice", () => {
    const never = updateMastery(initialMastery(), ev(1, 0, "unit_prior", daysAfter(T0, 2)));
    expect(never.lastPracticedAt).toBeNull();
    const before = updateMastery(state(0, 1, T0), ev(1, 0, "unit_prior", daysAfter(T0, 2)));
    expect(before.lastPracticedAt).toEqual(T0);
  });
});

describe("kFactor", () => {
  it("starts at K_MAX, shrinks monotonically and floors at K_MIN", () => {
    expect(kFactor(0)).toBe(K_MAX);
    let prev = kFactor(0);
    for (let n = 1; n <= 40; n++) {
      const k = kFactor(n);
      expect(k).toBeLessThanOrEqual(prev);
      expect(k).toBeGreaterThanOrEqual(K_MIN);
      prev = k;
    }
    expect(kFactor(1000)).toBe(K_MIN);
  });

  it("halves after K_HALF_N pieces of evidence", () => {
    expect(kFactor(4)).toBeCloseTo(K_MAX / 2, 12);
  });

  it("treats a negative evidence count as zero", () => {
    expect(kFactor(-3)).toBe(K_MAX);
  });
});

describe("applyUnitPrior", () => {
  it("never touches lastPracticedAt (a prior is not practice)", () => {
    const children = [state(0, 0, null), state(0.5, 2, T0)];
    const out = applyUnitPrior(children, { outcome: 1, difficulty: 0, at: daysAfter(T0, 5) });
    expect(out.map((c) => c.lastPracticedAt)).toEqual([null, T0]);
  });

  it("moves a child with its own evidence much less than a fresh one", () => {
    const [fresh, known] = applyUnitPrior([state(0, 0), state(0, 3)], { outcome: 0, difficulty: 0, at: T0 });
    expect(fresh.theta).toBeLessThan(0);
    expect(known.theta).toBeLessThan(0);
    expect(Math.abs(fresh.theta)).toBeGreaterThan(3 * Math.abs(known.theta));
  });

  it("adds a low-confidence weight of unit_prior / (1 + n)", () => {
    const [a, b] = applyUnitPrior([state(0, 0), state(0, 2)], { outcome: 1, difficulty: 0, at: T0 });
    expect(a.evidenceCount).toBeCloseTo(EVIDENCE_WEIGHT.unit_prior, 12);
    expect(b.evidenceCount).toBeCloseTo(2 + EVIDENCE_WEIGHT.unit_prior / 3, 12);
  });
});

describe("decay", () => {
  const strong = state(2, 2, T0); // ≈ 88 %

  it("never-practised concepts do not decay", () => {
    const s = state(2, 2, null);
    expect(decayedMastery(s, daysAfter(T0, 60))).toBeCloseTo(displayMastery(2), 12);
    expect(decayAmount(s, daysAfter(T0, 60))).toBe(0);
  });

  it("mastery at or below 50% does not decay (forgetting never invents weakness)", () => {
    for (const theta of [0, -1, -3]) {
      const s = state(theta, 3, T0);
      expect(decayedMastery(s, daysAfter(T0, 90))).toBeCloseTo(displayMastery(theta), 12);
      expect(decayAmount(s, daysAfter(T0, 90))).toBe(0);
    }
  });

  it("nothing is lost at the moment of practice", () => {
    expect(decayedMastery(strong, T0)).toBeCloseTo(displayMastery(2), 12);
    expect(decayAmount(strong, T0)).toBe(0);
  });

  it("mastery above 50% fades monotonically over time", () => {
    let prev = decayedMastery(strong, T0);
    for (const d of [1, 3, 7, 14, 30, 90]) {
      const m = decayedMastery(strong, daysAfter(T0, d));
      expect(m).toBeLessThan(prev);
      expect(m).toBeGreaterThan(0.5);
      prev = m;
    }
  });

  it("is capped: never drops more than DECAY_MAX_DROP of the part above 50%", () => {
    const m = displayMastery(2);
    const floor = 0.5 + (m - 0.5) * (1 - DECAY_MAX_DROP);
    const muchLater = decayedMastery(strong, daysAfter(T0, 3650));
    expect(muchLater).toBeGreaterThanOrEqual(floor - 1e-12);
    expect(muchLater).toBeCloseTo(floor, 6);
  });

  it("forgets half of it after one half-life", () => {
    const hl = halfLifeDays(strong.evidenceCount);
    expect(decayAmount(strong, daysAfter(T0, hl))).toBeCloseTo(0.5, 10);
  });

  it("more evidence means slower forgetting", () => {
    expect(halfLifeDays(8)).toBeGreaterThan(halfLifeDays(1));
    const later = daysAfter(T0, 6);
    expect(decayedMastery(state(2, 8, T0), later)).toBeGreaterThan(decayedMastery(state(2, 1, T0), later));
  });

  it("daysFromDecay inverts decayAmount", () => {
    for (const d of [1, 4, 10, 25]) {
      const decay = decayAmount(strong, daysAfter(T0, d));
      expect(daysFromDecay(decay, strong.evidenceCount)).toBeCloseTo(d, 8);
    }
    expect(daysFromDecay(0, 2)).toBe(0);
    expect(daysFromDecay(1, 2)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("confidenceOf", () => {
  it.each([
    [0, "none"],
    [0.3, "low"],
    [1.99, "low"],
    [2, "medium"],
    [4.9, "medium"],
    [5, "high"],
    [40, "high"],
  ] as const)("evidence %s → %s", (n, expected) => {
    expect(confidenceOf(n)).toBe(expected);
  });
});

describe("bandOf", () => {
  it("is unknown without evidence, whatever the mastery", () => {
    expect(bandOf(0.9, 0)).toBe("unknown");
    expect(bandOf(0.1, 0)).toBe("unknown");
  });

  it("uses the weak / strong thresholds", () => {
    expect(bandOf(BAND_WEAK_BELOW - 0.01, 1)).toBe("weak");
    expect(bandOf(BAND_WEAK_BELOW, 1)).toBe("developing");
    expect(bandOf(BAND_STRONG_FROM - 0.01, 1)).toBe("developing");
    expect(bandOf(BAND_STRONG_FROM, 1)).toBe("strong");
  });
});

describe("unitMastery", () => {
  it("is the weightage-weighted average of children", () => {
    expect(
      unitMastery([
        { mastery: 0.2, weightage: 3 },
        { mastery: 0.8, weightage: 1 },
      ]),
    ).toBeCloseTo(0.35, 12);
  });

  it("falls back to a plain mean when every weightage is 0, and 50% when empty", () => {
    expect(
      unitMastery([
        { mastery: 0.2, weightage: 0 },
        { mastery: 0.6, weightage: 0 },
      ]),
    ).toBeCloseTo(0.4, 12);
    expect(unitMastery([])).toBe(0.5);
  });
});
