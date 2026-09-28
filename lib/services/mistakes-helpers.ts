// Pure helpers for the mistake log (lib/services/mistakes.ts). No DB, no LLM, no clock.
import { z } from "zod";
import { SourceRefSchema } from "@/lib/ai/schemas";
import type { ExplanationView, MistakeGroupView, MistakeItemView, MistakeLogData } from "@/components/mistakes/types";

/**
 * Must match MISTAKE_WINDOW_DAYS in lib/services/core.ts: only open mistakes from this window
 * feed the engine's MistakeRate, so only they may claim to "raise this topic's priority".
 */
export const MISTAKE_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

/** Same normalisation loadEngineConcepts uses when counting recurring labels. */
export function normalizeLabel(label: string | null | undefined): string | null {
  const k = label?.trim().toLowerCase();
  return k ? k : null;
}

// ── stored explanation (Mistake.explanation is a string column) ─────────────

export const StoredExplanationSchema = z.object({
  v: z.literal(1),
  whyWrong: z.string(),
  correctReasoning: z.string(),
  retryQuestionId: z.string().nullable(),
  sources: z.array(SourceRefSchema).default([]),
  notInNotes: z.boolean().default(false),
});
export type StoredExplanation = z.infer<typeof StoredExplanationSchema>;

export function serializeExplanation(e: StoredExplanation): string {
  return JSON.stringify(e);
}

/** JSON written by explainUserMistake, or plain text (e.g. seeded) treated as "why wrong". */
export function parseStoredExplanation(raw: string | null | undefined): StoredExplanation | null {
  const text = raw?.trim();
  if (!text) return null;
  if (text.startsWith("{")) {
    try {
      const r = StoredExplanationSchema.safeParse(JSON.parse(text));
      if (r.success) return r.data;
    } catch {
      // not JSON — fall through to plain text
    }
  }
  return { v: 1, whyWrong: text, correctReasoning: "", retryQuestionId: null, sources: [], notInNotes: false };
}

// ── grouping ────────────────────────────────────────────────────────────────

export interface MistakeRow {
  id: string;
  conceptId: string;
  conceptName: string;
  unit: string;
  source: "diagnostic" | "quiz" | "socratic" | "check";
  prompt: string;
  response: string;
  misconception: string | null;
  explanation: string | null;
  resolved: boolean;
  createdAt: Date;
}

/**
 * Group mistakes by concept (most open first), count recurring misconception labels, and flag
 * the ones the priority engine actually counts (open, inside the 14-day window, ≥ 2 times).
 */
export function buildMistakeLog(
  rows: MistakeRow[],
  explanations: Map<string, ExplanationView>,
  now: Date,
): MistakeLogData {
  const since = now.getTime() - MISTAKE_WINDOW_DAYS * DAY_MS;
  const byConcept = new Map<string, MistakeRow[]>();
  for (const r of rows) {
    const list = byConcept.get(r.conceptId) ?? [];
    list.push(r);
    byConcept.set(r.conceptId, list);
  }

  const groups: MistakeGroupView[] = [];
  let recurringLabels = 0;
  for (const [conceptId, list] of byConcept) {
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const all = new Map<string, number>();
    const engine = new Map<string, number>();
    const display = new Map<string, string>();
    for (const r of list) {
      const k = normalizeLabel(r.misconception);
      if (!k) continue;
      all.set(k, (all.get(k) ?? 0) + 1);
      if (!display.has(k)) display.set(k, r.misconception!.trim());
      if (!r.resolved && r.createdAt.getTime() >= since) engine.set(k, (engine.get(k) ?? 0) + 1);
    }
    const raises = (k: string | null) => k !== null && (engine.get(k) ?? 0) >= 2;

    const items: MistakeItemView[] = list.map((r) => {
      const k = normalizeLabel(r.misconception);
      return {
        id: r.id,
        conceptId,
        conceptName: r.conceptName,
        unit: r.unit,
        source: r.source,
        prompt: r.prompt,
        response: r.response,
        misconception: r.misconception,
        explanation: explanations.get(r.id) ?? null,
        resolved: r.resolved,
        createdAt: r.createdAt.toISOString(),
        recurrence: k ? (all.get(k) ?? 1) : 0,
        raisesPriority: raises(k),
      };
    });

    const recurring = [...all.entries()]
      .filter(([, n]) => n >= 2)
      .map(([k, n]) => ({ label: display.get(k) ?? k, count: n, raisesPriority: raises(k) }))
      .sort((a, b) => Number(b.raisesPriority) - Number(a.raisesPriority) || b.count - a.count);
    recurringLabels += recurring.filter((x) => x.raisesPriority).length;

    groups.push({
      conceptId,
      conceptName: list[0].conceptName,
      unit: list[0].unit,
      open: list.filter((r) => !r.resolved).length,
      total: list.length,
      items,
      recurring,
    });
  }

  groups.sort((a, b) => b.open - a.open || b.total - a.total || a.conceptName.localeCompare(b.conceptName));
  const open = groups.reduce((s, g) => s + g.open, 0);
  const top = groups.find((g) => g.open > 0) ?? null;
  return {
    groups,
    stats: {
      total: rows.length,
      open,
      resolved: rows.length - open,
      mostAffected: top ? { conceptId: top.conceptId, name: top.conceptName, open: top.open } : null,
      recurringLabels,
    },
  };
}

/** Citations for an explanation: unique file/page pairs of the retrieved chunks, best first. */
export function chunkSources(chunks: Array<{ fileName: string; page: number }>, max = 3) {
  const out: Array<{ file: string; page: number }> = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    const key = `${c.fileName}#${c.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file: c.fileName, page: c.page });
    if (out.length >= max) break;
  }
  return out;
}
