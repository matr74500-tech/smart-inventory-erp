import { test as base, type Page } from "@playwright/test";

type TestFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const username = "matr74500";
    const password = "TestPass123!";

    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector('input[id="u"]', { state: "visible" });
    await page.fill('input[id="u"]', username);
    await page.fill('input[id="p"]', password);
    await page.click('button:has-text("دخول")');
    await page.waitForURL("/", { timeout: 30000 });
    await page.waitForLoadState("networkidle");

    await use(page);
  },
});

export { expect } from "@playwright/test";
