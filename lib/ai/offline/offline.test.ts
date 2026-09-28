import { describe, expect, it } from "vitest";
import { initialLadder } from "@/lib/tutor/ladder";
import { findTutorScript, TUTOR_SCRIPTS } from "@/lib/demo/bank";
import { gradeReply, offlineTutorTurn, scriptFor } from "./tutor";
import { mapParsedPyqs, parsePyqText, weightageFrom } from "./pyq";
import { offlineQuestions } from "./questions";

const cs = { id: "cs", name: "Conflict Serializability", unit: "Unit 4" };

describe("offline tutor", () => {
  it("opens at the probe with the script's question", () => {
    const r = offlineTutorTurn({ concept: cs, ladder: initialLadder(), studentMessage: null, chunks: [] });
    expect(r.turn.stage).toBe("probe");
    expect(r.turn.evaluation).toBe("not_applicable");
    expect(r.turn.conceptId).toBe("cs");
    expect(r.turn.notInNotes).toBe(true);
  });

  it("grades by key ideas and follows the ladder", () => {
    const script = findTutorScript(cs.name)!;
    const good = script.keyIdeas.join(", ") + " explained in my own words";
    expect(gradeReply(script, good).evaluation).toBe("correct");
    expect(gradeReply(script, "no idea").evaluation).toBe("wrong");
    const wrong1 = offlineTutorTurn({ concept: cs, ladder: initialLadder(), studentMessage: "no idea at all", chunks: [] });
    expect(wrong1.ladder.failCount).toBe(1);
    const wrong2 = offlineTutorTurn({ concept: cs, ladder: wrong1.ladder, studentMessage: "still no idea", chunks: [] });
    expect(wrong2.ladder.stage).toBe("hint1");
  });

  it("answers an answer request with a guiding question and no ladder change", () => {
    const r = offlineTutorTurn({ concept: cs, ladder: initialLadder(), studentMessage: "just tell me the answer", chunks: [] });
    expect(r.turn.evaluation).toBe("not_applicable");
    expect(r.ladder).toEqual(initialLadder());
  });

  it("keeps Hinglish framing on every turn when enabled", () => {
    const t1 = offlineTutorTurn({ concept: cs, ladder: initialLadder(), studentMessage: null, chunks: [], hinglish: true });
    expect(t1.turn.message).toMatch(/Chalo/);
    const t2 = offlineTutorTurn({ concept: cs, ladder: t1.ladder, studentMessage: "no idea", chunks: [], hinglish: true });
    const t3 = offlineTutorTurn({ concept: cs, ladder: t2.ladder, studentMessage: "still no idea", chunks: [], hinglish: true });
    for (const r of [t2, t3]) expect(r.turn.message).toMatch(/Abhi|Phir se|Hint|strong hint/);
    const en = offlineTutorTurn({ concept: cs, ladder: initialLadder(), studentMessage: null, chunks: [] });
    expect(en.turn.message).toMatch(/^Let's work on/);
  });

  it("builds a generic script for concepts without built-in content", () => {
    const s = scriptFor({ id: "x", name: "Quantum Tunnelling Basics", description: "Probability of crossing a barrier" }, []);
    expect(s.keyIdeas.length).toBeGreaterThan(0);
    expect(s.probe).toContain("Quantum Tunnelling Basics");
  });

  it("every built-in script has a probe, hints and a worked step", () => {
    for (const s of TUTOR_SCRIPTS) {
      expect(s.probe && s.hint1 && s.hint2 && s.workedStep && s.checkPrompt).toBeTruthy();
    }
  });
});

describe("offline PYQ parser", () => {
  const text = `Dec 2023 End Semester Examination
Q1. (a) Explain conflict serializability with a precedence graph example. [10]
(b) Define a B+ tree and explain insertion. (5 marks)
May 2022
Q2. Explain log based recovery with checkpoints. 8M`;

  it("splits questions and reads marks and years", () => {
    const qs = parsePyqText(text);
    expect(qs.length).toBe(3);
    expect(qs[0]).toMatchObject({ marks: 10, year: 2023 });
    expect(qs[1].marks).toBe(5);
    expect(qs[2]).toMatchObject({ marks: 8, year: 2022 });
  });

  it("maps to concepts and computes weightage shares", () => {
    const concepts = [
      { id: "cs", name: "Conflict Serializability" },
      { id: "bt", name: "B+ Tree" },
      { id: "lr", name: "Log Based Recovery" },
    ];
    const mapped = mapParsedPyqs(parsePyqText(text), concepts);
    expect(mapped.map((q) => q.conceptId)).toEqual(["cs", "bt", "lr"]);
    const w = weightageFrom(mapped, concepts.map((c) => c.id));
    expect(w.totalMarks).toBe(23);
    expect(w.weightage.cs).toBeCloseTo(10 / 23);
  });

  it("stays fast on adversarial input", () => {
    const t = Date.now();
    parsePyqText("Q1. " + "(".repeat(50_000) + " 5 marks " + " ".repeat(50_000));
    expect(Date.now() - t).toBeLessThan(500);
  });
});

describe("offline questions", () => {
  it("spreads bank questions across concepts, verified", () => {
    const qs = offlineQuestions([cs, { id: "bt", name: "B+ Trees", unit: "Unit 5" }], 4, "check");
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.verified && (q.conceptId === "cs" || q.conceptId === "bt"))).toBe(true);
  });
  it("returns nothing for concepts the bank doesn't cover", () => {
    expect(offlineQuestions([{ id: "z", name: "Photosynthesis", unit: "Bio" }], 3, "diagnostic")).toEqual([]);
  });
});
