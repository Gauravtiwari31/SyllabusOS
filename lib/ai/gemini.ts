// Gemini access for the AI layer: structured-output calls with a fallback model on
// overload/rate-limit, one retry on schema-invalid output, per-call timeouts and a
// deployment-wide daily budget. Server-only. Callers fall back to offline paths on error.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output, type ModelMessage } from "ai";
import type { z } from "zod";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

let provider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

export function google() {
  provider ??= createGoogleGenerativeAI({ apiKey: env.geminiKey });
  return provider;
}

/** Thrown when Gemini can't produce a valid result; callers switch to the offline path. */
export class AiUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiUnavailableError";
  }
}

/** 503 overload, 429 rate limit, timeouts and network errors are worth one fallback attempt. */
function isRetryable(err: unknown): boolean {
  const e = err as { statusCode?: number; status?: number; name?: string; message?: string; cause?: unknown };
  const status = e?.statusCode ?? e?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  const text = `${e?.name ?? ""} ${e?.message ?? ""}`.toLowerCase();
  return /overload|high demand|unavailable|rate.?limit|quota|timeout|timed out|abort|fetch failed|econnreset|socket/.test(text);
}

/**
 * Circuit breaker: a model that just returned 503/429 is skipped for a while, so every call
 * doesn't first wait on an overloaded model before reaching the fallback.
 */
const COOL_OFF_MS = 2 * 60_000;
// On globalThis: Next.js loads this module separately for page renders and server actions.
const g = globalThis as unknown as { __aiCoolingUntil?: Map<string, number> };
const coolingUntil = (g.__aiCoolingUntil ??= new Map<string, number>());
const isCooling = (model: string) => (coolingUntil.get(model) ?? 0) > Date.now();

/** Short, key-free description for logs. */
export function describeAiError(err: unknown): string {
  const e = err as { statusCode?: number; name?: string; message?: string };
  return `${e?.name ?? "Error"}${e?.statusCode ? ` ${e.statusCode}` : ""}: ${String(e?.message ?? err).slice(0, 200)}`;
}

/** Counts one call against the daily budget; false = over budget (go offline). */
export async function withinBudget(): Promise<boolean> {
  const r = await rateLimit("aiGlobal", "all");
  if (!r.ok) console.warn("[ai] daily Gemini budget reached; using offline mode");
  return r.ok;
}

export interface ObjectCall<S extends z.ZodType> {
  schema: S;
  system: string;
  messages: ModelMessage[];
  /** use env.modelStrong (verify passes) instead of env.modelFast */
  strong?: boolean;
  temperature?: number;
  timeoutMs?: number;
  label: string;
}

async function once<S extends z.ZodType>(modelId: string, call: ObjectCall<S>): Promise<z.infer<S>> {
  const { output } = await generateText({
    model: google()(modelId),
    output: Output.object({ schema: call.schema }),
    system: call.system,
    messages: call.messages,
    temperature: call.temperature ?? 0.2,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(call.timeoutMs ?? 45_000),
  });
  // Output.object validates against the schema; parse again so callers get zod defaults/transforms.
  return call.schema.parse(output) as z.infer<S>;
}

/**
 * Structured call: primary model, then the fallback model on a retryable error, then one
 * more attempt on schema-invalid output. Throws AiUnavailableError when all attempts fail.
 */
export async function generateStructured<S extends z.ZodType>(call: ObjectCall<S>): Promise<z.infer<S>> {
  if (!env.geminiKey) throw new AiUnavailableError("No Gemini key configured");
  if (!(await withinBudget())) throw new AiUnavailableError("Daily AI budget reached");

  const primary = call.strong ? env.modelStrong : env.modelFast;
  // GEMINI_MODEL_FALLBACK may list several models, comma-separated, tried in order.
  const fallbacks = env.modelFallback.split(",").map((m) => m.trim()).filter(Boolean);
  const all = [primary, ...fallbacks].filter((m, i, a) => m && a.indexOf(m) === i);
  const ready = all.filter((m) => !isCooling(m));
  const chain = ready.length ? ready : all;
  let lastErr: unknown = null;
  let invalidRetried = false;

  for (let i = 0; i < chain.length; i++) {
    try {
      return await once(chain[i], call);
    } catch (err) {
      lastErr = err;
      if (isRetryable(err)) {
        coolingUntil.set(chain[i], Date.now() + COOL_OFF_MS);
        console.warn(`[ai] ${call.label}: ${chain[i]} failed (${describeAiError(err)})${i + 1 < chain.length ? "; trying fallback" : ""}`);
        continue;
      }
      // Schema-invalid / unparsable output: one more try on the same model.
      if (!invalidRetried) {
        invalidRetried = true;
        try {
          return await once(chain[i], call);
        } catch (retryErr) {
          lastErr = retryErr;
          if (isRetryable(retryErr)) continue;
        }
      }
      break;
    }
  }
  throw new AiUnavailableError(`${call.label} failed: ${describeAiError(lastErr)}`, { cause: lastErr });
}
