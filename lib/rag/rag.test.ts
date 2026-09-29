import { describe, expect, it, vi } from "vitest";

// Pure helpers only; the DB client is never used here.
vi.mock("@/lib/db", () => ({ db: {} }));
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readPdfPages } from "@/components/onboarding/pdf-text";
import { capPageTexts, chunkPages, MAX_PDF_CHARS } from "./chunk";
import { bm25Scores } from "./keyword";
import { extractPdfPages, toVectorLiteral } from "./index";

describe("chunkPages", () => {
  it("never crosses a page boundary and keeps page numbers", () => {
    const long = "Conflict serializability is tested with a precedence graph. ".repeat(120);
    const out = chunkPages(
      [
        { page: 3, text: long },
        { page: 4, text: "Short page about B+ trees." },
      ],
      { targetTokens: 200, overlapTokens: 20 },
    );
    expect(out.length).toBeGreaterThan(2);
    expect(out.filter((c) => c.page === 4)).toHaveLength(1);
    for (const c of out) expect(c.text.length).toBeLessThanOrEqual(200 * 4 + 20 * 4 + 1);
  });

  it("drops empty and number-only pages", () => {
    expect(chunkPages([{ page: 1, text: "  12  " }, { page: 2, text: "" }])).toEqual([]);
  });
});

describe("bm25Scores", () => {
  it("ranks the relevant passage first", () => {
    const docs = [
      { id: "a", text: "B+ trees keep leaves linked for range queries." },
      { id: "b", text: "A precedence graph with a cycle means the schedule is not conflict serializable." },
      { id: "c", text: "Hashing suits equality lookups." },
    ];
    const s = bm25Scores("precedence graph cycle", docs);
    expect(s.indexOf(Math.max(...s))).toBe(1);
    expect(s[2]).toBe(0);
  });
});

describe("toVectorLiteral", () => {
  it("accepts exactly 768 finite numbers only", () => {
    expect(toVectorLiteral(Array(768).fill(0.5))).toMatch(/^\[0\.5,/);
    expect(toVectorLiteral(Array(767).fill(0))).toBeNull();
    expect(toVectorLiteral([...Array(767).fill(0), Number.NaN])).toBeNull();
    expect(toVectorLiteral(null)).toBeNull();
  });
});

describe("PDF page text", () => {
  it("normalises pages, drops empty ones and stops at MAX_PDF_CHARS", () => {
    expect(
      capPageTexts([
        { page: 1, text: "  a \t b \n\n\n\n c\u0000 " },
        { page: 2, text: " \n " },
        { page: 3, text: "d" },
      ]),
    ).toEqual([
      { page: 1, text: "a b\n\nc" },
      { page: 3, text: "d" },
    ]);
    const long = "x".repeat(MAX_PDF_CHARS - 10);
    const capped = capPageTexts([
      { page: 1, text: long },
      { page: 2, text: "y".repeat(50) },
      { page: 3, text: "z" },
    ]);
    expect(capped.map((p) => p.page)).toEqual([1, 2]);
    expect(capped.reduce((n, p) => n + p.text.length, 0)).toBe(MAX_PDF_CHARS);
  });

  it("reads the same pages on the device as on the server", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage().drawText("Unit 1: Relational model\nKeys and constraints", { x: 50, y: 700, font, size: 12, lineHeight: 14 });
    doc.addPage(); // blank page: dropped, numbering kept
    doc.addPage().drawText("Unit 2: Normalisation (1NF, 2NF, 3NF)", { x: 50, y: 700, font, size: 12 });
    const bytes = await doc.save();

    const seen: number[] = [];
    const file = new File([new Uint8Array(bytes)], "notes.pdf", { type: "application/pdf" });
    const device = await readPdfPages(file, (page) => seen.push(page));
    const server = await extractPdfPages(bytes);
    expect(device).toEqual(server);
    expect(device.map((p) => p.page)).toEqual([1, 3]);
    expect(device[0].text).toContain("Relational model");
    expect(seen).toEqual([1, 2, 3]);
  });
});

