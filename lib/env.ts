// Server-only module (not marked with "server-only" so tsx scripts like prisma/seed.ts can import it).

// Central, typed access to optional integrations. Every AI / storage feature
// checks these flags and falls back to an offline path instead of crashing.

export const env = {
  geminiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  modelFast: process.env.GEMINI_MODEL_FAST || "gemini-3.6-flash",
  modelStrong: process.env.GEMINI_MODEL_STRONG || process.env.GEMINI_MODEL_FAST || "gemini-3.6-flash",
  /** Retried when the primary model returns 503 (overloaded) or 429 (rate limit). */
  modelFallback: process.env.GEMINI_MODEL_FALLBACK || "gemini-3.5-flash-lite",
  embedModel: process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || "",
  googleAuth: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
};

/** True when a Gemini key is configured; otherwise the app runs in offline mode. */
export const aiEnabled = () => env.geminiKey.length > 0;

/** True when uploads can be archived to Vercel Blob. */
export const blobEnabled = () => env.blobToken.length > 0;
