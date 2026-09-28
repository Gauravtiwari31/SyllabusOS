// Abuse protection for AI-costly and account-creating actions. Server-only (not marked with
// "server-only" so tsx scripts can import modules that depend on it).
// Fixed-window counters in Postgres (model RateLimit), so limits hold across serverless
// instances without another service. One atomic upsert per check.
import { headers } from "next/headers";
import { db } from "@/lib/db";

export interface RateRule {
  /** requests allowed per window */
  limit: number;
  /** window length in seconds */
  windowSec: number;
  /** deny (instead of allow) when the counter itself can't be read */
  failClosed?: boolean;
}

/** Every limit in one place. Keys are "<bucket>:<subject>" (subject = user id, IP or "all"). */
export const RATE_RULES = {
  /** Guest accounts minted per IP (each creates a user row, and a seeded demo goal). */
  guestSignup: { limit: 10, windowSec: 60 * 60, failClosed: true },
  /** Guest accounts minted across the whole deployment per hour (DB-bloat backstop). */
  guestSignupGlobal: { limit: 600, windowSec: 60 * 60, failClosed: true },
  /** Syllabus extraction, PYQ mapping, notes indexing (large prompts / embeddings). */
  aiHeavy: { limit: 12, windowSec: 60 * 60, failClosed: true },
  /** Diagnostic / check / practice question generation. */
  aiQuestions: { limit: 20, windowSec: 60 * 60 },
  /** Socratic tutor turns and hint requests. */
  tutor: { limit: 60, windowSec: 10 * 60 },
  /** Explain My Mistake. */
  explain: { limit: 20, windowSec: 10 * 60 },
  /** Fresh re-explanations (skip the cache, create a new retry question). */
  explainFresh: { limit: 5, windowSec: 10 * 60 },
  /** Diagnostic pool (re)generation per goal — stops retrying failed generation on every visit. */
  poolGen: { limit: 3, windowSec: 60 * 60 },
  /** Check-question generation per session. */
  checkGen: { limit: 2, windowSec: 60 * 60 },
  /** New goals per user. */
  goalCreate: { limit: 10, windowSec: 24 * 60 * 60 },
  /** Model + embedding calls across the deployment per day; over budget → offline mode. */
  aiGlobal: { limit: 5000, windowSec: 24 * 60 * 60 },
} as const satisfies Record<string, RateRule>;

export type RateBucket = keyof typeof RATE_RULES;

export interface RateResult {
  ok: boolean;
  remaining: number;
  /** seconds until the window resets (0 when ok) */
  retryAfterSec: number;
}

/** Count one request against `bucket:subject`. */
export async function rateLimit(bucket: RateBucket, subject: string): Promise<RateResult> {
  const rule: RateRule = RATE_RULES[bucket];
  const { limit, windowSec } = rule;
  const key = `${bucket}:${subject}`.slice(0, 200);
  try {
    const rows = await db.$queryRaw<Array<{ count: number; windowStart: Date }>>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count")
      VALUES (${key}, now(), 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."windowStart" <= now() - make_interval(secs => ${windowSec}) THEN 1
          ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE
          WHEN "RateLimit"."windowStart" <= now() - make_interval(secs => ${windowSec}) THEN now()
          ELSE "RateLimit"."windowStart" END
      RETURNING "count", "windowStart"`;
    const row = rows[0];
    if (!row) return { ok: true, remaining: limit, retryAfterSec: 0 };
    const count = Number(row.count);
    const resetAt = new Date(row.windowStart).getTime() + windowSec * 1000;
    const ok = count <= limit;
    // Opportunistic clean-up of long-expired counters (~1% of checks).
    if (Math.random() < 0.01) void pruneRateLimits();
    return {
      ok,
      remaining: Math.max(0, limit - count),
      retryAfterSec: ok ? 0 : Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
    };
  } catch (err) {
    console.error(`[rate-limit] ${bucket} check failed; ${rule.failClosed ? "denying" : "allowing"} request`, err);
    return rule.failClosed ? { ok: false, remaining: 0, retryAfterSec: 60 } : { ok: true, remaining: limit, retryAfterSec: 0 };
  }
}

/** Human-friendly wait, e.g. "in 4 minutes". */
export function retryPhrase(sec: number): string {
  if (sec < 90) return "in a minute";
  const min = Math.ceil(sec / 60);
  if (min < 90) return `in ${min} minutes`;
  return `in ${Math.ceil(min / 60)} hours`;
}

/** Student-facing message for a blocked request. */
export function rateLimitMessage(r: RateResult): string {
  return `You're going a bit fast. Please try again ${retryPhrase(r.retryAfterSec)}.`;
}

/**
 * Thrown by `enforceRateLimit` when over the limit. Server actions catch it and return
 * `{ ok: false, error: err.message }` like their other safe-to-show errors.
 */
export class RateLimitError extends Error {
  constructor(public readonly result: RateResult) {
    super(rateLimitMessage(result));
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(bucket: RateBucket, subject: string): Promise<void> {
  const r = await rateLimit(bucket, subject);
  if (!r.ok) throw new RateLimitError(r);
}

/** Collapse an IPv6 address to its /64 so one host can't rotate through its whole prefix. */
function ipKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const parts = ip.split(":");
  return parts.length >= 4 ? `${parts.slice(0, 4).join(":")}::/64` : ip;
}

/** Client IP from request headers, trusting forwarded headers only behind a known proxy. */
export function ipFromHeaders(h: Pick<Headers, "get">): string {
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  let ip: string | null = null;
  if (process.env.VERCEL === "1") {
    // Set by the Vercel edge; clients can't forge it.
    ip = first(h.get("x-vercel-forwarded-for")) ?? first(h.get("x-real-ip")) ?? first(h.get("x-forwarded-for"));
  } else if (process.env.TRUSTED_PROXY === "1") {
    ip = first(h.get("x-real-ip")) ?? first(h.get("x-forwarded-for"));
  }
  if (!ip || ip.length > 64) return "unknown";
  return ipKey(ip);
}

/** Best-effort client IP for per-IP limits in server actions and route handlers. */
export async function clientIp(): Promise<string> {
  try {
    return ipFromHeaders(await headers());
  } catch {
    return "unknown";
  }
}

/** Delete counters whose window ended long ago. */
export async function pruneRateLimits(olderThanSec = 2 * 24 * 60 * 60): Promise<void> {
  try {
    await db.$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < now() - make_interval(secs => ${olderThanSec})`;
  } catch (err) {
    console.error("[rate-limit] prune failed", err);
  }
}
