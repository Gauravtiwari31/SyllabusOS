// Grounding (RAG): notes PDF → pages → ~800-token chunks → Gemini embeddings (768d)
// in pgvector → top-k retrieval filtered by concept. Keyword (BM25) fallback when offline.
// Server-only. SQL: Prisma tagged templates only (parameterised); every query is scoped by
// goalId; vectors are built from validated numbers.
import { randomUUID } from "node:crypto";
import { embedMany } from "ai";
import { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { bestConceptForText } from "@/components/onboarding/model";
import { chunkPages as chunkPagesImpl, normalizePageText, type PageText } from "./chunk";
import { bm25Scores } from "./keyword";

export type { PageText } from "./chunk";

export const EMBED_DIM = 768;
export const MAX_PDF_PAGES = 300;
export const MAX_PDF_CHARS = 400_000;
export const MAX_CHUNKS_PER_RESOURCE = 600;
/** Rows scanned by the keyword fallback. */
const KEYWORD_SCAN = 400;

export interface RetrievedChunk {
  id: string;
  page: number;
  text: string;
  fileName: string;
  conceptId: string | null;
  /** similarity (cosine) or keyword score, higher is better */
  score: number;
}

/** Text per page via unpdf. Rejects PDFs over MAX_PDF_PAGES; stops at MAX_PDF_CHARS. */
export async function extractPdfPages(bytes: Uint8Array): Promise<PageText[]> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error(`That PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}.`);
  }
  const { text } = await extractText(pdf, { mergePages: false });
  const pages: PageText[] = [];
  let total = 0;
  for (let i = 0; i < text.length && total < MAX_PDF_CHARS; i++) {
    const clean = normalizePageText(text[i] ?? "").slice(0, MAX_PDF_CHARS - total);
    total += clean.length;
    if (clean) pages.push({ page: i + 1, text: clean });
  }
  return pages;
}

/** Split pages into ~targetTokens chunks, never crossing a page boundary (keeps citations exact). */
export function chunkPages(
  pages: PageText[],
  opts?: { targetTokens?: number; overlapTokens?: number },
): PageText[] {
  return chunkPagesImpl(pages, opts);
}

/** Embedding as a pgvector literal; null unless it is exactly EMBED_DIM finite numbers. */
export function toVectorLiteral(v: number[] | null | undefined): string | null {
  if (!v || v.length !== EMBED_DIM || !v.every((x) => Number.isFinite(x))) return null;
  return `[${v.join(",")}]`;
}

/** Gemini embeddings (outputDimensionality 768). Returns null offline or on failure. */
export async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
): Promise<number[][] | null> {
  if (!env.geminiKey || texts.length === 0) return null;
  try {
    const { google, withinBudget } = await import("@/lib/ai/gemini");
    if (!(await withinBudget())) return null;
    const model = google().embeddingModel(env.embedModel);
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 100) {
      const { embeddings } = await embedMany({
        model,
        values: texts.slice(i, i + 100).map((t) => t.slice(0, 8000)),
        providerOptions: { google: { outputDimensionality: EMBED_DIM, taskType } },
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(60_000),
      });
      out.push(...embeddings);
    }
    return out.every((e) => toVectorLiteral(e) !== null) ? out : null;
  } catch (err) {
    console.error("[rag] embedding failed; using keyword retrieval", (err as Error)?.message?.slice(0, 200));
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Chunk + (optionally) embed + assign each chunk to its best-matching concept, then insert
 * Chunk rows (embedding via $executeRaw ... ::vector). Idempotent per resource.
 */
export async function indexNotes(input: {
  goalId: string;
  resourceId: string;
  pages: PageText[];
  concepts: Array<{ id: string; name: string; description: string | null }>;
}): Promise<{ chunks: number; embedded: boolean }> {
  const chunks = chunkPages(input.pages).slice(0, MAX_CHUNKS_PER_RESOURCE);
  await db.chunk.deleteMany({ where: { goalId: input.goalId, resourceId: input.resourceId } });
  if (chunks.length === 0) return { chunks: 0, embedded: false };

  const vectors = await embedTexts(chunks.map((c) => c.text), "RETRIEVAL_DOCUMENT");
  let conceptVecs: number[][] | null = null;
  if (vectors && input.concepts.length > 0) {
    conceptVecs = await embedTexts(
      input.concepts.map((c) => `${c.name}. ${c.description ?? ""}`),
      "RETRIEVAL_DOCUMENT",
    );
  }

  const conceptFor = (text: string, i: number): string | null => {
    if (vectors && conceptVecs) {
      let best = -1;
      let bestScore = 0.55; // below this the embedding match is too weak to trust
      conceptVecs.forEach((cv, j) => {
        const s = cosine(vectors[i], cv);
        if (s > bestScore) {
          best = j;
          bestScore = s;
        }
      });
      if (best >= 0) return input.concepts[best].id;
    }
    return bestConceptForText(text, input.concepts);
  };

  const rows = chunks.map((c, i) => ({
    id: randomUUID(),
    goalId: input.goalId,
    resourceId: input.resourceId,
    conceptId: conceptFor(c.text, i),
    page: c.page,
    text: c.text.replace(/\u0000/g, ""),
    vector: vectors ? toVectorLiteral(vectors[i]) : null,
  }));

  if (!vectors) {
    await db.chunk.createMany({
      data: rows.map((r) => ({ id: r.id, goalId: r.goalId, resourceId: r.resourceId, conceptId: r.conceptId, page: r.page, text: r.text })),
    });
    return { chunks: rows.length, embedded: false };
  }
  for (let i = 0; i < rows.length; i += 100) {
    const values = rows
      .slice(i, i + 100)
      .map(
        (r) =>
          Prisma.sql`(${r.id}, ${r.goalId}, ${r.resourceId}, ${r.conceptId}, ${r.page}, ${r.text}, ${r.vector}::vector)`,
      );
    await db.$executeRaw`
      INSERT INTO "Chunk" ("id", "goalId", "resourceId", "conceptId", "page", "text", "embedding")
      VALUES ${Prisma.join(values)}`;
  }
  return { chunks: rows.length, embedded: true };
}

interface ChunkRow {
  id: string;
  page: number;
  text: string;
  conceptId: string | null;
  fileName: string;
  score: number;
}

const toChunk = (r: ChunkRow): RetrievedChunk => ({
  id: r.id,
  page: Number(r.page),
  text: r.text,
  fileName: r.fileName,
  conceptId: r.conceptId,
  score: Number(r.score),
});

/** Concept-tagged chunks get a small boost so they win near-ties. */
const CONCEPT_BONUS = 0.08;

async function vectorSearch(goalId: string, conceptId: string | null, vec: string, k: number): Promise<RetrievedChunk[]> {
  const rows = await db.$queryRaw<ChunkRow[]>`
    SELECT c."id", c."page", c."text", c."conceptId", r."fileName",
           1 - (c."embedding" <=> ${vec}::vector) AS "score"
    FROM "Chunk" c JOIN "Resource" r ON r."id" = c."resourceId"
    WHERE c."goalId" = ${goalId} AND c."embedding" IS NOT NULL
    ORDER BY c."embedding" <=> ${vec}::vector
    LIMIT ${k * 3}`;
  return rows
    .map(toChunk)
    .map((c) => ({ ...c, score: c.score + (conceptId && c.conceptId === conceptId ? CONCEPT_BONUS : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

async function keywordSearch(goalId: string, conceptId: string | null, query: string, k: number): Promise<RetrievedChunk[]> {
  const rows = await db.chunk.findMany({
    where: { goalId },
    select: { id: true, page: true, text: true, conceptId: true, resource: { select: { fileName: true } } },
    orderBy: [{ page: "asc" }],
    take: KEYWORD_SCAN,
  });
  if (rows.length === 0) return [];
  // Prefer the concept's own chunks when the scan window is full.
  const scores = bm25Scores(query, rows.map((r) => ({ id: r.id, text: r.text })));
  const max = Math.max(...scores, 0) || 1;
  const ranked = rows
    .map((r, i) => ({
      id: r.id,
      page: r.page,
      text: r.text,
      conceptId: r.conceptId,
      fileName: r.resource.fileName,
      score: scores[i] / max + (conceptId && r.conceptId === conceptId ? CONCEPT_BONUS * 2 : 0),
      raw: scores[i],
    }))
    .filter((r) => r.raw > 0 || (conceptId && r.conceptId === conceptId))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return ranked.map((r) => ({ id: r.id, page: r.page, text: r.text, conceptId: r.conceptId, fileName: r.fileName, score: r.score }));
}

/**
 * Top-k chunks for a query. Prefers chunks tagged with conceptId, then falls back to the
 * whole goal. Uses pgvector cosine when embeddings exist, else keyword scoring.
 */
export async function retrieveChunks(input: {
  goalId: string;
  conceptId?: string | null;
  query: string;
  k?: number;
}): Promise<RetrievedChunk[]> {
  const k = Math.min(8, Math.max(1, Math.trunc(input.k ?? 4)));
  const conceptId = input.conceptId ?? null;
  const query = input.query.slice(0, 2000);

  const hasVectors = await db.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM "Chunk" WHERE "goalId" = ${input.goalId} AND "embedding" IS NOT NULL) AS "exists"`;
  if (hasVectors[0]?.exists) {
    const [qv] = (await embedTexts([query], "RETRIEVAL_QUERY")) ?? [];
    const vec = toVectorLiteral(qv);
    if (vec) {
      const hits = await vectorSearch(input.goalId, conceptId, vec, k);
      if (hits.length > 0) return hits;
    }
  }
  return keywordSearch(input.goalId, conceptId, query, k);
}
