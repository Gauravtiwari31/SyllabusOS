import { defineConfig } from "@playwright/test";

// End-to-end checks across phone, tablet and desktop sizes (e2e/). Runs against
// E2E_BASE_URL when set; otherwise starts `pnpm start` (run `pnpm build` first) or reuses a
// server already listening on E2E_PORT (e.g. `pnpm dev --port 3100`).
// PW_CHANNEL=msedge / chrome uses an installed browser instead of Playwright's Chromium.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // CI: one line per test as it finishes (the github reporter alone buffers its progress dots
  // on one line, so a stall shows nothing), and a hard cap so a stall fails fast.
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  globalTimeout: process.env.CI ? 10 * 60_000 : undefined,
  use: {
    baseURL,
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  projects: [
    // One guest account per run (guest sign-ups are rate limited per IP).
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "app",
      testMatch: /\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/demo.json" },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm start --port ${PORT}`,
        // auth.ts trusts the Host header only on Vercel, in dev, or when told to.
        env: { AUTH_TRUST_HOST: "true" },
        stdout: "pipe",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
