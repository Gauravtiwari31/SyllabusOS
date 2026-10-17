import { expect, test as setup } from "@playwright/test";

// Opens the seeded demo once and saves the session for every other test.
setup("sign in to the demo", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/demo.json" });
});
