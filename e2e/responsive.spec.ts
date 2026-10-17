import { expect, test, type Page } from "@playwright/test";

// Every screen must work on phones (both orientations), tablets and desktops: no sideways
// scrolling, navigation that fits the screen, and the study session usable one-handed.

const SCREENS = {
  phone: { width: 390, height: 844 },
  "phone landscape": { width: 844, height: 390 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1024, height: 768 },
  desktop: { width: 1440, height: 900 },
} as const;

type Screen = keyof typeof SCREENS;

const APP_PAGES = ["/dashboard", "/plan", "/graph", "/mistakes", "/revision", "/settings"] as const;

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function firstLearnHref(page: Page) {
  await page.goto("/dashboard");
  const href = await page.locator('a[href^="/learn/"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  return href!;
}

for (const [screen, viewport] of Object.entries(SCREENS) as [Screen, (typeof SCREENS)[Screen]][]) {
  test.describe(`${screen} ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    for (const path of ["/", ...APP_PAGES]) {
      test(`${path} fits the screen width`, async ({ page }) => {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        expect(await horizontalOverflow(page), `${path} scrolls sideways`).toBeLessThanOrEqual(0);
      });
    }

    test("navigation suits the screen", async ({ page }) => {
      await page.goto("/dashboard");
      const tabBar = page.locator(".nu-tabbar");
      const labelledNav = page
        .locator("header nav")
        .getByRole("link", { name: "Plan", exact: true })
        .filter({ hasText: "Plan" });
      const iconNav = page.locator('header nav a[title="Plan"]');

      if (screen === "phone" || screen === "tablet") {
        await expect(tabBar).toBeVisible();
        await expect(labelledNav).toBeHidden();
      } else if (screen === "phone landscape") {
        // Too short for a bottom bar: icon navigation moves into the header.
        await expect(tabBar).toBeHidden();
        await expect(iconNav).toBeVisible();
      } else {
        await expect(tabBar).toBeHidden();
        await expect(labelledNav).toBeVisible();
      }
    });

    test("graph opens on the view that suits the screen", async ({ page }) => {
      await page.goto("/graph");
      const small = screen === "phone" || screen === "phone landscape";
      await expect(page.getByRole("button", { name: small ? "List" : "Graph" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      if (!small) await expect(page.locator(".react-flow__node").first()).toBeVisible();
    });

    test("study-now title stays inside its tile", async ({ page }) => {
      await page.goto("/dashboard");
      // While React streams the page, a hidden copy of the tile can briefly coexist with the
      // shown one; only the visible copy counts.
      const title = page.locator("#study-now-concept").filter({ visible: true });
      await expect(title).toBeVisible();
      const fits = await title.evaluate((el) => {
        const tile = el.closest(".nu-tile")!.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return el.scrollWidth <= el.clientWidth + 1 && r.right <= tile.right + 1;
      });
      expect(fits).toBe(true);
    });
  });
}

test.describe("study session on a phone", () => {
  test.use({ viewport: SCREENS.phone, hasTouch: true });

  test("focus mode, pinned reply box, instant echo of the reply", async ({ page }) => {
    await page.goto(await firstLearnHref(page));
    await expect(page.locator(".nu-tabbar")).toBeHidden();

    const reply = page.getByLabel("Your reply").filter({ visible: true });
    await expect(reply).toBeInViewport();

    const text = "Two operations conflict when different transactions touch the same item and one writes.";
    const send = page.getByRole("button", { name: "Send" });
    // Typing before hydration is lost (the box is controlled), so retry until Send enables.
    await expect(async () => {
      await reply.fill(text);
      await expect(send).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await send.click();

    const conversation = page.getByRole("list", { name: "Conversation" });
    await expect(conversation.getByText(text)).toBeVisible();
    // The tutor answers and the reply box clears; the student's message appears once.
    await expect(conversation.locator("li")).toHaveCount(3, { timeout: 30_000 });
    await expect(conversation.getByText(text)).toHaveCount(1);
    await expect(reply).toHaveValue("");
  });
});

test("Android app links are published", async ({ request }) => {
  const res = await request.get("/.well-known/assetlinks.json");
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("application/json");
  const body = (await res.json()) as {
    target: { package_name: string; sha256_cert_fingerprints: string[] };
  }[];
  const app = body.find((s) => s.target.package_name === "com.syllabusos.app");
  expect(app?.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
});
