import { describe, expect, it, vi } from "vitest";

// Pure helpers only; the DB client is never used here.
vi.mock("@/lib/db", () => ({ db: {} }));
import { chunkPages } from "./chunk";
import { bm25Scores } from "./keyword";
import { toVectorLiteral } from "./index";

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
