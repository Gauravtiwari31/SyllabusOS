import { describe, expect, it } from "vitest";
import type { DraftConcept, DraftGraph } from "@/lib/ai/schemas";
import {
  bestConceptForText,
  blobFileName,
  checkPdfMeta,
  cycleIfAdded,
  daysBetweenIso,
  draftFromConcepts,
  draftReducer,
  draftToGraphData,
  explainCycle,
  findCycle,
  groupByUnit,
  isPdfBytes,
  MAX_INLINE_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  nextUnitName,
  normaliseWeightage,
  planConfirm,
  pyqWeightage,
  resumeStep,
  safeFileName,
  sanitizeDraft,
  splitTextIntoPages,
  uploadLimitMb,
  validateDraft,
} from "@/components/onboarding/model";
import { examDateFromIso, makeGoalSchema } from "@/components/onboarding/goal-schema";

function concept(key: string, over: Partial<DraftConcept> = {}): DraftConcept {
  return {
    key,
    name: key.toUpperCase(),
    description: "",
    unit: "Unit 1",
    estMinutes: 30,
    weightage: 10,
    prereqKeys: [],
    ...over,
  };
}

function graph(concepts: DraftConcept[], source: DraftGraph["source"] = "ai"): DraftGraph {
  return { subject: "DBMS", source, concepts };
}

// a ← b ← c   (a is a prerequisite of b, b of c)
const chain = () =>
  graph([concept("a"), concept("b", { prereqKeys: ["a"] }), concept("c", { prereqKeys: ["b"], unit: "Unit 2" })]);

describe("draftToGraphData", () => {
  it("builds unknown-band nodes, prerequisite edges and unit summaries", () => {
    const data = draftToGraphData(chain());
    expect(data.nodes).toHaveLength(3);
    expect(data.nodes.every((n) => n.band === "unknown" && n.evidenceCount === 0)).toBe(true);
    expect(data.edges).toEqual([
      { id: "a->b", from: "a", to: "b" },
      { id: "b->c", from: "b", to: "c" },
    ]);
    expect(data.units.map((u) => [u.name, u.conceptCount])).toEqual([
      ["Unit 1", 2],
      ["Unit 2", 1],
    ]);
    const total = data.nodes.reduce((s, n) => s + n.weightage, 0);
    expect(total).toBeCloseTo(1);
  });

  it("drops dangling, duplicate and self edges", () => {
    const data = draftToGraphData(graph([concept("a", { prereqKeys: ["a", "zzz"] }), concept("b", { prereqKeys: ["a", "a"] })]));
    expect(data.edges).toEqual([{ id: "a->b", from: "a", to: "b" }]);
  });
});

describe("weightage normalisation", () => {
  it("turns percents into shares summing to 1", () => {
    const shares = normaliseWeightage([
      { key: "a", weightage: 30 },
      { key: "b", weightage: 10 },
    ]);
    expect(shares.get("a")).toBeCloseTo(0.75);
    expect(shares.get("b")).toBeCloseTo(0.25);
  });

  it("splits equally when all weightages are zero", () => {
    const shares = normaliseWeightage([
      { key: "a", weightage: 0 },
      { key: "b", weightage: 0 },
    ]);
    expect(shares.get("a")).toBeCloseTo(0.5);
  });

  it("planConfirm keeps units contiguous and orders rows", () => {
    const draft = graph([
      concept("a", { unit: "U1", weightage: 20 }),
      concept("b", { unit: "U2", weightage: 20, prereqKeys: ["a"] }),
      concept("c", { unit: "U1", weightage: 60, name: "  Spaced   name " }),
    ]);
    const plan = planConfirm(draft);
    expect(plan.concepts.map((c) => [c.key, c.order])).toEqual([
      ["a", 0],
      ["c", 1],
      ["b", 2],
    ]);
    expect(plan.concepts.find((c) => c.key === "c")?.name).toBe("Spaced name");
    expect(plan.concepts.reduce((s, c) => s + c.weightage, 0)).toBeCloseTo(1);
    expect(plan.edges).toEqual([{ fromKey: "a", toKey: "b" }]);
  });
});

describe("cycle detection", () => {
  it("finds no cycle in a chain", () => {
    expect(findCycle(chain().concepts)).toBeNull();
  });

  it("finds a cycle", () => {
    const g = graph([concept("a", { prereqKeys: ["c"] }), concept("b", { prereqKeys: ["a"] }), concept("c", { prereqKeys: ["b"] })]);
    const cycle = findCycle(g.concepts);
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });

  it("blocks a prerequisite that would close a loop, with an explanation", () => {
    const g = chain();
    // making c a prerequisite of a closes a → b → c → a
    expect(cycleIfAdded(g.concepts, "a", "c")).toEqual(["c", "b", "a"]);
    expect(explainCycle(g.concepts, "a", "c")).toMatch(/C already builds on A \(via B\)/);
    expect(explainCycle(g.concepts, "a", "a")).toMatch(/own prerequisite/);
    expect(explainCycle(g.concepts, "c", "a")).toBeNull();
  });

  it("reducer ignores a cyclic toggle but allows a valid one", () => {
    const g = chain();
    expect(draftReducer(g, { type: "togglePrereq", key: "a", prereqKey: "c" })).toBe(g);
    const next = draftReducer(g, { type: "togglePrereq", key: "c", prereqKey: "a" });
    expect(next.concepts.find((c) => c.key === "c")?.prereqKeys).toEqual(["b", "a"]);
    const removed = draftReducer(next, { type: "togglePrereq", key: "c", prereqKey: "a" });
    expect(removed.concepts.find((c) => c.key === "c")?.prereqKeys).toEqual(["b"]);
  });
});

describe("sanitizeDraft", () => {
  it("cleans names, keys, refs, duplicates and cycles", () => {
    const messy = graph([
      concept("a", { name: "  Joins ", prereqKeys: ["b", "a", "ghost"] }),
      concept("b", { name: "joins", prereqKeys: ["a"] }),
      concept("a", { name: "Keys", unit: "  ", estMinutes: 999, weightage: -5 }),
      concept("d", { name: "   " }),
    ]);
    const { draft, fixes } = sanitizeDraft(messy);
    expect(draft.concepts).toHaveLength(3);
    expect(new Set(draft.concepts.map((c) => c.key)).size).toBe(3);
    expect(draft.concepts.map((c) => c.name)).toEqual(["Joins", "joins (2)", "Keys"]);
    expect(draft.concepts[2].unit).toBe("General");
    expect(draft.concepts[2].estMinutes).toBe(240);
    expect(draft.concepts[2].weightage).toBe(0);
    expect(findCycle(draft.concepts)).toBeNull();
    expect(draft.concepts[0].prereqKeys.every((k) => k !== "a" && k !== "ghost")).toBe(true);
    expect(fixes.some((f) => f.includes("circular"))).toBe(true);
    expect(fixes.some((f) => f.includes("without a name"))).toBe(true);
    expect(validateDraft(draft)).toEqual([]);
  });

  it("caps the concept count", () => {
    const many = graph(Array.from({ length: 70 }, (_, i) => concept(`k${i}`, { name: `Concept ${i}` })));
    const { draft, fixes } = sanitizeDraft(many);
    expect(draft.concepts).toHaveLength(60);
    expect(fixes[0]).toMatch(/first 60 of 70/);
  });
});

describe("validateDraft", () => {
  it("accepts a clean chain", () => {
    expect(validateDraft(chain())).toEqual([]);
  });

  it("flags empty and duplicate names, bad numbers and too many concepts", () => {
    const g = graph([
      concept("a", { name: "" }),
      concept("b", { name: "Keys" }),
      concept("c", { name: " keys " }),
      concept("d", { estMinutes: 2, weightage: 150 }),
    ]);
    const issues = validateDraft(g);
    expect(issues.filter((i) => i.key === "a" && i.field === "name")).toHaveLength(1);
    expect(issues.filter((i) => i.message.startsWith("Duplicate"))).toHaveLength(2);
    expect(issues.some((i) => i.key === "d" && i.field === "estMinutes")).toBe(true);
    expect(issues.some((i) => i.key === "d" && i.field === "weightage")).toBe(true);

    const big = graph(Array.from({ length: 61 }, (_, i) => concept(`k${i}`, { name: `C${i}` })));
    expect(validateDraft(big).some((i) => i.field === "graph")).toBe(true);
    expect(validateDraft(graph([]))[0].message).toMatch(/at least one/);
  });
});

describe("draftReducer", () => {
  it("adds a concept right after its unit's last concept", () => {
    const g = chain();
    const next = draftReducer(g, { type: "add", key: "n", unit: "Unit 1", name: "New" });
    expect(next.concepts.map((c) => c.key)).toEqual(["a", "b", "n", "c"]);
    expect(next.concepts[2].weightage).toBe(10);
  });

  it("deleting a concept strips it from prerequisites", () => {
    const next = draftReducer(chain(), { type: "delete", key: "b" });
    expect(next.concepts.map((c) => c.key)).toEqual(["a", "c"]);
    expect(next.concepts[1].prereqKeys).toEqual([]);
  });

  it("renames, merges and deletes units", () => {
    const renamed = draftReducer(chain(), { type: "renameUnit", from: "Unit 2", to: " Transactions " });
    expect(groupByUnit(renamed.concepts).map((u) => u.unit)).toEqual(["Unit 1", "Transactions"]);
    const merged = draftReducer(chain(), { type: "renameUnit", from: "Unit 2", to: "Unit 1" });
    expect(groupByUnit(merged.concepts)).toHaveLength(1);
    const blank = draftReducer(chain(), { type: "renameUnit", from: "Unit 2", to: "  " });
    expect(blank.concepts[2].unit).toBe("Unit 2");
    const deleted = draftReducer(chain(), { type: "deleteUnit", unit: "Unit 1" });
    expect(deleted.concepts.map((c) => c.key)).toEqual(["c"]);
    expect(deleted.concepts[0].prereqKeys).toEqual([]);
  });

  it("suggests unused unit names", () => {
    expect(nextUnitName(["Unit 1", "Unit 2"])).toBe("Unit 3");
    expect(nextUnitName(["Unit 2"])).toBe("Unit 3");
    expect(nextUnitName(["unit 2", "Unit 3"])).toBe("Unit 4");
  });

  it("round-trips confirmed concepts back into a draft", () => {
    const draft = draftFromConcepts({
      subject: "DBMS",
      concepts: [
        { id: "x", name: "Keys", description: null, unit: "U1", estMinutes: 30, weightage: 0.25 },
        { id: "y", name: "Normal Forms", description: "3NF", unit: "U1", estMinutes: 45, weightage: 0.75 },
      ],
      edges: [{ from: "x", to: "y" }],
    });
    expect(draft.concepts[1]).toMatchObject({ key: "y", weightage: 75, prereqKeys: ["x"], description: "3NF" });
    expect(validateDraft(draft)).toEqual([]);
  });
});

describe("pyqWeightage", () => {
  it("computes marks share per concept", () => {
    const r = pyqWeightage(
      [
        { conceptId: "a", marks: 10 },
        { conceptId: "a", marks: 5 },
        { conceptId: "b", marks: 5 },
        { conceptId: null, marks: 20 },
        { conceptId: "zzz", marks: 7 },
      ],
      ["a", "b", "c"],
    );
    expect(r.basis).toBe("marks");
    expect(r.total).toBe(20);
    expect(r.share.a).toBeCloseTo(0.75);
    expect(r.share.b).toBeCloseTo(0.25);
    expect(r.share.c).toBe(0);
    expect(r.marks.a).toBe(15);
  });

  it("falls back to counting questions when no marks are given", () => {
    const r = pyqWeightage(
      [
        { conceptId: "a", marks: null },
        { conceptId: "b", marks: 0 },
        { conceptId: "b", marks: null },
      ],
      ["a", "b"],
    );
    expect(r.basis).toBe("count");
    expect(r.share.b).toBeCloseTo(2 / 3);
  });
});

describe("splitTextIntoPages", () => {
  it("splits on form feeds and keeps page numbers", () => {
    expect(splitTextIntoPages("one\fTwo\f\fFour")).toEqual([
      { page: 1, text: "one" },
      { page: 2, text: "Two" },
      { page: 4, text: "Four" },
    ]);
  });

  it("honours --- page N --- markers", () => {
    const text = "Intro line\n--- page 3 ---\nThird page\n--- Page 4 ---\nFourth page";
    expect(splitTextIntoPages(text)).toEqual([
      { page: 3, text: "Intro line\n\nThird page" },
      { page: 4, text: "Fourth page" },
    ]);
  });

  it("packs paragraphs into ~maxChars pseudo-pages", () => {
    const para = "Sentence one. Sentence two.";
    const text = Array.from({ length: 10 }, () => para).join("\n\n");
    const pages = splitTextIntoPages(text, 60);
    expect(pages.length).toBe(5);
    expect(pages.every((p) => p.text.length <= 60)).toBe(true);
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3, 4, 5]);
  });

  it("hard-splits a huge paragraph", () => {
    const pages = splitTextIntoPages("x".repeat(250), 100);
    expect(pages.map((p) => p.text.length)).toEqual([100, 100, 50]);
  });
});

describe("bestConceptForText", () => {
  const concepts = [
    { id: "cs", name: "Conflict Serializability" },
    { id: "nf", name: "Third Normal Form", description: "transitive dependency" },
    { id: "idx", name: "B+ Tree Indexing" },
  ];
  it("matches on concept name words", () => {
    expect(bestConceptForText("A schedule is conflict serializable if its precedence graph…", concepts)).toBe("cs");
    expect(bestConceptForText("Removing transitive dependency gives third normal form (3NF).", concepts)).toBe("nf");
  });
  it("returns null when nothing matches", () => {
    expect(bestConceptForText("Operating system scheduling", concepts)).toBeNull();
  });
});

describe("files & flow", () => {
  it("validates PDF metadata", () => {
    expect(checkPdfMeta({ name: "a.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(checkPdfMeta({ name: "a.PDF", type: "", size: 1000 })).toBeNull();
    expect(checkPdfMeta({ name: "a.docx", type: "application/msword", size: 1000 })).toMatch(/isn't a PDF/);
    expect(checkPdfMeta({ name: "a.pdf", type: "application/pdf", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/20 MB/);
    expect(checkPdfMeta({ name: "a.pdf", type: "application/pdf", size: 0 })).toMatch(/empty/);
  });

  it("caps PDFs by upload path (direct to Blob vs in the action body)", () => {
    expect(uploadLimitMb(true)).toBe(20);
    expect(uploadLimitMb(false)).toBe(4);
    const big = { name: "a.pdf", type: "application/pdf", size: MAX_INLINE_UPLOAD_BYTES + 1 };
    expect(checkPdfMeta(big, uploadLimitMb(true))).toBeNull();
    expect(checkPdfMeta(big, uploadLimitMb(false))).toMatch(/4 MB/);
  });

  it("makes URL-safe Blob file names", () => {
    expect(blobFileName("Unit 1 – Notes (final).PDF", "notes.pdf")).toBe("Unit-1-Notes-final.pdf");
    expect(blobFileName("../../etc/passwd", "notes.pdf")).toBe("passwd.pdf");
    expect(blobFileName("a?b#c%2F.pdf", "notes.pdf")).toBe("a-b-c-2F.pdf");
    expect(blobFileName("नोट्स.pdf", "syllabus.pdf")).toBe("syllabus.pdf");
    expect(blobFileName("", "pyq.pdf")).toBe("pyq.pdf");
  });

  it("sniffs the PDF header", () => {
    const enc = new TextEncoder();
    expect(isPdfBytes(enc.encode("%PDF-1.7\n..."))).toBe(true);
    expect(isPdfBytes(enc.encode("\n\n%PDF-1.4"))).toBe(true);
    expect(isPdfBytes(enc.encode("PK\u0003\u0004 not a pdf"))).toBe(false);
    expect(isPdfBytes(new Uint8Array())).toBe(false);
  });

  it("sanitises file names", () => {
    expect(safeFileName("C:\\fakepath\\DBMS Unit 2.pdf", "x")).toBe("DBMS Unit 2.pdf");
    expect(safeFileName("../../etc/passwd", "x")).toBe("passwd");
    expect(safeFileName("", "fallback.pdf")).toBe("fallback.pdf");
  });

  it("resumes at a sensible step", () => {
    expect(resumeStep({ status: "draft", conceptCount: 0, hasPyq: false, notesCount: 0 })).toBe(1);
    expect(resumeStep({ status: "diagnosing", conceptCount: 30, hasPyq: false, notesCount: 0 })).toBe(2);
    expect(resumeStep({ status: "diagnosing", conceptCount: 30, hasPyq: true, notesCount: 0 })).toBe(3);
    expect(resumeStep({ status: "diagnosing", conceptCount: 30, hasPyq: true, notesCount: 2 })).toBe(4);
  });

  it("counts calendar days between ISO dates", () => {
    expect(daysBetweenIso("2026-09-28", "2026-10-05")).toBe(7);
    expect(daysBetweenIso("2026-09-28", "bad")).toBeNull();
  });
});

describe("goal schema", () => {
  const schema = makeGoalSchema("2026-09-29");
  it("accepts a future exam", () => {
    expect(schema.safeParse({ subject: "DBMS", examDate: "2026-12-01", minutesPerDay: 60 }).success).toBe(true);
  });
  it("rejects past dates, bad minutes and short subjects", () => {
    expect(schema.safeParse({ subject: "DBMS", examDate: "2026-09-28", minutesPerDay: 60 }).success).toBe(false);
    expect(schema.safeParse({ subject: "DBMS", examDate: "2026-02-30", minutesPerDay: 60 }).success).toBe(false);
    expect(schema.safeParse({ subject: "DBMS", examDate: "2026-12-01", minutesPerDay: 10 }).success).toBe(false);
    expect(schema.safeParse({ subject: "D", examDate: "2026-12-01", minutesPerDay: 60 }).success).toBe(false);
  });
  it("stores the exam day at noon UTC", () => {
    expect(examDateFromIso("2026-12-01")?.toISOString()).toBe("2026-12-01T12:00:00.000Z");
    expect(examDateFromIso("2026-13-01")).toBeNull();
  });
});
