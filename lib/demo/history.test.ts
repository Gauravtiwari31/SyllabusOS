import { describe, expect, it } from "vitest";
import { displayMastery, isoDay, recommendNext, type EngineConcept } from "@/lib/engine";
import { CONCEPT_NAMES as C, CONCEPT_PREREQS, QUESTION_BANK, TUTOR_SCRIPTS } from "./bank";
import { DEMO_CONCEPTS, DEMO_NOTES, DEMO_PYQS } from "./course";
import { buildDemoHistory, DEMO_EXAM_IN_DAYS, DEMO_MINUTES_PER_DAY, type DemoHistory } from "./history";

const NOW = new Date(2026, 8, 29, 12, 30);
const DAY_MS = 86_400_000;
const h = buildDemoHistory(NOW);

/** EngineConcept[] as lib/services/core loadEngineConcepts builds it from the stored rows. */
function engineConcepts(history: DemoHistory, now: Date): EngineConcept[] {
  const since = now.getTime() - 14 * DAY_MS;
  const open = history.mistakes.filter((m) => !m.resolved && m.at.getTime() >= since);
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
      weightage: history.weightage.get(c.name)?.share ?? 0,
      weightageSource: "pyq",
      estMinutes: c.estMinutes,
      mastery: history.mastery.get(c.name)!,
      prereqIds: CONCEPT_PREREQS[c.name] ?? [],
      recentMistakes: mine.length,
      recurringMisconceptions: [...labels.values()].filter((n) => n >= 2).length,
    };
  });
}

describe("demo course data", () => {
  it("uses bank concept names, one entry per script, with PYQ marks summing to shares of 1", () => {
    expect(DEMO_CONCEPTS.map((c) => c.name).sort()).toEqual(TUTOR_SCRIPTS.map((s) => s.concept).sort());
    const shares = [...h.weightage.values()].reduce((s, w) => s + w.share, 0);
    expect(shares).toBeCloseTo(1);
    const heaviest = [...h.weightage].sort((a, b) => b[1].share - a[1].share)[0][0];
    expect(heaviest).toBe(C.conflict);
    expect(DEMO_PYQS.every((p) => p.year >= 2022 && p.year <= 2024 && p.marks > 0)).toBe(true);
  });

  it("has ~30 note pages, unique page numbers, each tagged with a demo concept", () => {
    expect(DEMO_NOTES.length).toBeGreaterThanOrEqual(28);
    expect(new Set(DEMO_NOTES.map((n) => n.page)).size).toBe(DEMO_NOTES.length);
    const names = new Set(DEMO_CONCEPTS.map((c) => c.name));
    expect(DEMO_NOTES.every((n) => names.has(n.concept) && n.text.length > 200)).toBe(true);
  });
});

describe("buildDemoHistory", () => {
  it("is deterministic and entirely in the past, spanning ~10 days", () => {
    const again = buildDemoHistory(NOW);
    expect(again.events.map((e) => [e.concept, e.thetaAfter, e.at.getTime()])).toEqual(
      h.events.map((e) => [e.concept, e.thetaAfter, e.at.getTime()]),
    );
    const times = [
      ...h.events.map((e) => e.at),
      ...h.attempts.map((a) => a.at),
      ...h.mistakes.map((m) => m.at),
      ...h.sessions.map((s) => s.completedAt),
    ].map((d) => d.getTime());
    expect(Math.max(...times)).toBeLessThan(NOW.getTime());
    expect(Math.min(...times)).toBeGreaterThan(NOW.getTime() - 11 * DAY_MS);
    expect(h.examDate.getTime() - NOW.getTime()).toBeGreaterThan((DEMO_EXAM_IN_DAYS - 1) * DAY_MS);
  });

  it("keeps stored mastery consistent with the replayed events", () => {
    const last = new Map<string, number>();
    for (const e of [...h.events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
      if (last.has(e.concept)) expect(e.thetaBefore).toBeCloseTo(last.get(e.concept)!, 12);
      last.set(e.concept, e.thetaAfter);
    }
    for (const c of DEMO_CONCEPTS) {
      const m = h.mastery.get(c.name)!;
      expect(m.theta, c.name).toBeCloseTo(last.get(c.name) ?? 0, 12);
      // Direct evidence (answers + Socratic replies) sets lastPracticedAt; unit priors never do.
      const direct = [
        ...h.attempts.filter((a) => a.concept === c.name).map((a) => a.at.getTime()),
        ...h.events.filter((e) => e.concept === c.name && e.source === "socratic").map((e) => e.at.getTime()),
      ];
      expect(m.lastPracticedAt?.getTime() ?? null, c.name).toBe(direct.length ? Math.max(...direct) : null);
      expect(m.evidenceCount, c.name).toBeGreaterThan(0);
    }
  });

  it("runs a ≤ 10-question diagnostic and sessions that reach the check stage", () => {
    const diagnostic = h.attempts.filter((a) => a.session === null && QUESTION_BANK.find((q) => q.body === a.questionBody)?.purposes.includes("diagnostic"));
    expect(diagnostic.length).toBeGreaterThan(5);
    expect(diagnostic.length).toBeLessThanOrEqual(10);
    expect(new Set(diagnostic.map((a) => a.concept)).size).toBe(diagnostic.length);
    expect(diagnostic[0].concept).toBe(C.conflict);

    expect(h.sessions.length).toBeGreaterThanOrEqual(3);
    for (const [i, s] of h.sessions.entries()) {
      expect(s.ladder.stage, s.concept).toBe("check");
      expect(s.turns[0].role).toBe("tutor");
      expect(s.turns.every((t) => t.role === "tutor" || t.stage !== "check")).toBe(true);
      const checks = h.attempts.filter((a) => a.session === i);
      expect(checks.length, s.concept).toBeGreaterThanOrEqual(2);
      expect(checks.every((a) => a.concept === s.concept)).toBe(true);
      expect(s.masteryBefore).toBeGreaterThan(0);
      expect(s.masteryAfter).toBeLessThan(1);
    }
    // every referenced question exists in the bank
    const bodies = new Set(QUESTION_BANK.map((q) => q.body));
    expect(h.attempts.every((a) => bodies.has(a.questionBody))).toBe(true);
  });

  it("labels misconceptions with the concept's script labels, one recurring in the last 14 days", () => {
    const labels = new Map(TUTOR_SCRIPTS.map((s) => [s.concept, new Set(s.misconceptions.map((m) => m.label))]));
    for (const m of h.mistakes) {
      if (m.misconception) expect(labels.get(m.concept)?.has(m.misconception), m.misconception).toBe(true);
    }
    const recurring = engineConcepts(h, NOW).filter((c) => c.recurringMisconceptions > 0);
    expect(recurring.map((c) => c.name)).toContain(C.conflict);
    expect(h.mistakes.some((m) => m.resolved && m.explanation)).toBe(true);
  });

  it("leaves Conflict Serializability as a sensible, ungated Study Now pick", () => {
    const rec = recommendNext({
      concepts: engineConcepts(h, NOW),
      minutesPerDay: DEMO_MINUTES_PER_DAY,
      examDate: h.examDate,
      now: NOW,
      skipDates: [],
    });
    expect(rec?.conceptName).toBe(C.conflict);
    expect(rec?.gatedFor).toBeNull();
    expect(rec?.mode).toBe("learn");
    expect(rec?.reason).toMatch(/exam weightage \(\d+% of PYQ marks\)/);
    expect(rec?.mastery).toBeLessThan(0.5);
  });

  it("has a mixed graph and a modestly rising mastery trend", () => {
    const shown = DEMO_CONCEPTS.map((c) => displayMastery(h.mastery.get(c.name)!.theta));
    expect(shown.some((m) => m >= 0.7)).toBe(true);
    expect(shown.some((m) => m < 0.4)).toBe(true);

    const totalW = DEMO_CONCEPTS.reduce((s, c) => s + (h.weightage.get(c.name)?.share ?? 0), 0);
    const theta = new Map(DEMO_CONCEPTS.map((c) => [c.name, 0]));
    const byDay = new Map<string, number>();
    for (const e of [...h.events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
      theta.set(e.concept, e.thetaAfter);
      const avg = DEMO_CONCEPTS.reduce(
        (s, c) => s + (h.weightage.get(c.name)?.share ?? 0) * displayMastery(theta.get(c.name) ?? 0),
        0,
      );
      byDay.set(isoDay(e.at), avg / totalW);
    }
    const trend = [...byDay.values()];
    expect(trend.length).toBeGreaterThanOrEqual(7);
    expect(trend[trend.length - 1] - trend[0]).toBeGreaterThan(0.02);
    expect(trend[trend.length - 1] - trend[0]).toBeLessThan(0.2);
  });
});
