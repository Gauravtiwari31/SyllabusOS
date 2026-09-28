// Small, dependency-free text utilities shared by the offline parsers, the keyword grader
// and keyword retrieval. Deterministic and pure (unit-tested).

const STOPWORDS = new Set(
  (
    "a an the and or but if then else of in on at to for from by with without into onto over under " +
    "about above below between among through during before after up down out off again further " +
    "is am are was were be been being have has had having do does did doing can could should would " +
    "may might must shall will it its it's this that these those there here which who whom whose what " +
    "when where why how all any both each few more most other some such no nor not only own same so " +
    "than too very just also as i me my we our you your he him his she her they them their one two " +
    "three four five six seven eight nine ten etc eg ie e.g i.e via per using use used based " +
    // exam / syllabus filler
    "explain describe define discuss write short note notes give example examples suitable briefly " +
    "brief detail detailed differentiate difference compare contrast illustrate diagram following " +
    "consider marks mark question questions answer answers state list mention justify elaborate " +
    "introduction overview basic basics concept concepts various different type types need " +
    "importance significance advantage advantages disadvantage disadvantages neat sketch find " +
    "show prove derive calculate determine assume given let also"
  ).split(/\s+/),
);

/** Lowercase, strip accents/punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'+#\s]/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// First matching rule wins. Order matters (longest / most specific first).
const SUFFIX_RULES: Array<[RegExp, string]> = [
  [/(?:ization|isation|izing|ising|ized|ised|izes|ises|ize|ise)$/, ""],
  [/(?:abilities|ability|ibility|able|ible)$/, ""],
  [/(?:ational|ations|ation|ments|ment|nesses|ness|ities|ity)$/, ""],
  [/ies$/, "y"],
  [/ied$/, "y"],
  [/ings?$/, ""],
  [/(ss|sh|ch|x|z)es$/, "$1"], // classes → class, indexes → index
  [/ed$/, ""],
  [/([^s])s$/, "$1"], // keys → key, but class stays class
];

/**
 * Light stemmer: enough to make "normalization/normalize/normalized", "serializability/
 * serializable/serialization", "queries/query", "locks/locking" collide. Not linguistics.
 */
export function stem(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  let w = word;
  for (const [re, rep] of SUFFIX_RULES) {
    if (!re.test(w)) continue;
    const next = w.replace(re, rep);
    if (next.length < 3) continue;
    w = next;
    break;
  }
  // serializ → serial, normaliz → normal (after -able/-ation stripping)
  if (w.length > 5 && /i[sz]$/.test(w)) w = w.slice(0, -2);
  // recovery → recover, query → quer (consistent with queries → query → quer)
  if (w.length > 4 && /ry$/.test(w)) w = w.slice(0, -1);
  return w;
}

export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}

/** Content tokens: normalised, stopwords removed, stemmed. Keeps short technical tokens like "2pl", "sql", "3nf". */
export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(text).split(" ")) {
    if (!raw || STOPWORDS.has(raw)) continue;
    if (raw.length < 2 && !/\d/.test(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokens(text));
}

/** Fraction of `phrase` content tokens present in `haystack` tokens (0..1). */
export function coverage(phraseTokens: string[], haystack: Set<string>): number {
  const uniq = [...new Set(phraseTokens)];
  if (uniq.length === 0) return 0;
  let hit = 0;
  for (const t of uniq) if (haystack.has(t)) hit++;
  return hit / uniq.length;
}

/** True when the normalised phrase occurs verbatim (word-bounded) in the normalised text. */
export function containsPhrase(normalizedText: string, phrase: string): boolean {
  const p = normalize(phrase);
  if (!p) return false;
  return ` ${normalizedText} `.includes(` ${p} `);
}

/** Split prose into sentences (keeps sentence punctuation). */
export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9("'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Truncate at a word boundary, adding an ellipsis when cut. */
export function truncateWords(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:–-]+$/, "")}…`;
}

export function slugify(text: string): string {
  return (
    normalize(text)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "concept"
  );
}

/** "DATABASE SYSTEM CONCEPTS" → "Database System Concepts"; mixed-case text is left alone. */
export function fixCase(text: string): string {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    const small = new Set(["of", "and", "in", "on", "to", "for", "the", "a", "an", "with", "by", "or"]);
    return text
      .toLowerCase()
      .split(/(\s+)/)
      .map((w, i) => {
        if (/^\s+$/.test(w)) return w;
        // keep acronyms-ish short tokens (sql, er, 2pl, bcnf) upper-case
        if (/^(sql|er|eer|dbms|rdbms|acid|bcnf|[0-9]nf|2pl|ddl|dml|dcl|tcl|os|cpu|io|api|http|tcp|ip|b\+?)$/.test(w))
          return w.toUpperCase();
        if (i > 0 && small.has(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join("");
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface WeightedDoc {
  id: string;
  /** token → weight (already stemmed) */
  bag: Map<string, number>;
  /** normalised phrases whose verbatim presence earns a bonus (e.g. the concept name) */
  phrases: string[];
}

/** Build a weighted token bag from (text, weight) pairs; the max weight per token wins. */
export function weightedBag(parts: Array<[string | null | undefined, number]>): Map<string, number> {
  const bag = new Map<string, number>();
  for (const [text, w] of parts) {
    if (!text) continue;
    for (const t of tokens(text)) bag.set(t, Math.max(bag.get(t) ?? 0, w));
  }
  return bag;
}

/**
 * Score a query against weighted docs with an IDF factor over the doc collection (tokens
 * shared by many docs — "database", "data" — count for less). Returns scores in doc order.
 */
export function scoreDocs(query: string, docs: WeightedDoc[]): number[] {
  const q = new Set(tokens(query));
  const nq = normalize(query);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.bag.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = Math.max(1, docs.length);
  return docs.map((d) => {
    let s = 0;
    for (const t of q) {
      const w = d.bag.get(t);
      if (!w) continue;
      s += w * Math.log(1 + n / (df.get(t) ?? 1));
    }
    for (const p of d.phrases) {
      if (p.split(" ").length >= 2 && containsPhrase(nq, p)) s += 3;
    }
    return s;
  });
}

/** Index of the best score (> 0); ties go to the earliest doc. -1 when nothing scores. */
export function argmaxPositive(scores: number[]): number {
  let best = -1;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > 0 && (best === -1 || scores[i] > scores[best])) best = i;
  }
  return best;
}
