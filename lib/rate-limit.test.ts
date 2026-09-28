import { afterEach, describe, expect, it, vi } from "vitest";

// Pure helpers only; the DB client is never used here.
vi.mock("@/lib/db", () => ({ db: {} }));
import { ipFromHeaders, retryPhrase } from "./rate-limit";

const h = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });

describe("ipFromHeaders", () => {
  afterEach(() => {
    delete process.env.VERCEL;
    delete process.env.TRUSTED_PROXY;
  });

  it("ignores spoofable forwarding headers when not behind a known proxy", () => {
    expect(ipFromHeaders(h({ "x-forwarded-for": "1.2.3.4" }))).toBe("unknown");
  });

  it("uses the platform header on Vercel", () => {
    process.env.VERCEL = "1";
    expect(ipFromHeaders(h({ "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "1.2.3.4" }))).toBe("9.9.9.9");
  });

  it("buckets IPv6 by /64", () => {
    process.env.TRUSTED_PROXY = "1";
    expect(ipFromHeaders(h({ "x-real-ip": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" }))).toBe("2001:db8:1:2::/64");
  });
});

describe("retryPhrase", () => {
  it("reads naturally", () => {
    expect(retryPhrase(30)).toBe("in a minute");
    expect(retryPhrase(600)).toBe("in 10 minutes");
    expect(retryPhrase(7200)).toBe("in 2 hours");
  });
});
