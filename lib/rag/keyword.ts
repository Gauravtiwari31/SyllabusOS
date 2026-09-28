// Keyword retrieval (BM25) for when there are no embeddings (offline mode, or notes indexed
// without a key). Pure; unit-tested in keyword.test.ts.
import { tokens } from "@/lib/ai/offline/text";

export interface KeywordDoc {
  id: string;
  text: string;
}

const K1 = 1.2;
const B = 0.75;

/** BM25 score of `query` against each doc, in doc order (0 = no overlap). */
export function bm25Scores(query: string, docs: KeywordDoc[]): number[] {
  const q = [...new Set(tokens(query))];
  if (q.length === 0 || docs.length === 0) return docs.map(() => 0);
  const tfs = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of tokens(d.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  });
  const lens = tfs.map((tf) => [...tf.values()].reduce((a, b) => a + b, 0));
  const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length) || 1;
  const n = docs.length;
  const df = new Map<string, number>();
  for (const tf of tfs) for (const t of q) if (tf.has(t)) df.set(t, (df.get(t) ?? 0) + 1);

  return tfs.map((tf, i) => {
    let s = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (n - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      s += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * lens[i]) / avg)));
    }
    return s;
  });
}
