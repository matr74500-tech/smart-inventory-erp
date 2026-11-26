import { test, expect } from "@playwright/test";
import { test as authTest } from "./fixtures/auth";
import { fillInput, clickButton, waitForToast, waitForTableRow } from "./utils/helpers";

test.describe("Critical Flow: Login → Product → Sale → Stock", () => {
  test("Create product, make sale, verify stock decrement", async ({ page }) => {
    test.setTimeout(120000);
    const productName = `Test Product ${Date.now()}`;
    const barcode = `TEST${Date.now()}`;
    const initialQty = 100;
    const saleQty = 3;

    // Login
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.fill('input[id="u"]', "matr74500");
    await page.fill('input[id="p"]', "TestPass123!");
    await page.click('button:has-text("دخول")');
    await page.waitForURL("/", { timeout: 30000 });
    await page.waitForLoadState("networkidle");

    // 1. Go to stocktake page
    await page.evaluate(() => {
      history.pushState(null, "", "/stocktake");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.waitForFunction(
      () => {
        return (
          window.location.pathname === "/stocktake" &&
          !!document.querySelector('input[placeholder*="بحث"]')
        );
      },
      { timeout: 15000 },
    );

    // Select warehouse to see all products
    await page.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();
    await page.waitForTimeout(500);

    // 2. Create product from stocktake page
    await clickButton(page, "إضافة صنف جديد");
    await fillInput(page, "اسم الصنف", productName);
    await fillInput(page, "الباركود", barcode);
    await fillInput(page, "الوحدة", "حبة");
    await fillInput(page, "تكلفة الشراء", "10");
    await fillInput(page, "تجزئة", "20");
    await clickButton(page, "حفظ");
    await page.waitForLoadState("networkidle");

    // 3. Set initial stock (stocktake)
    await page.fill('input[placeholder*="بحث"]', productName);
    await waitForTableRow(page, "الصنف", productName);
    const productRow = page
      .locator(`:has-text("${productName}")`)
      .last()
      .locator("..")
      .locator("..");
    await productRow.locator('input[placeholder*="الكمية"]').fill(String(initialQty));
    await productRow.evaluate((row) => {
      const btn = row.querySelector('button[aria-label="حفظ"]');
      if (btn && !btn.disabled) (btn as HTMLButtonElement).click();
    });
    await waitForToast(page, "تم تحديث الكمية");

    // 4. Make a sale
    await page.evaluate(() => {
      history.pushState(null, "", "/sales");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.waitForFunction(() => window.location.pathname === "/sales", { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    // Select warehouse
    await page
      .locator('label:has-text("المستودع")')
      .locator("..")
      .locator('[role="combobox"]')
      .click();
    await page.getByRole("option").first().click();
    await page.fill('input[placeholder*="امسح الباركود"]', barcode);
    await page.keyboard.press("Enter");
    await page.locator('input[aria-label*="كمية"]').waitFor({ state: "visible", timeout: 10000 });

    // Update quantity in cart and post sale
    await page.locator('input[aria-label*="كمية"]').fill(String(saleQty));
    await page.getByRole("button", { name: "حفظ وترحيل البيع" }).click();
    // Wait for sale to post (RPC may complete silently); then navigate to inventory
    await page.waitForTimeout(20000);

    // 5. Verify product appears in inventory after sale and stock decreased
    await page.evaluate(() => {
      history.pushState(null, "", "/inventory");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.waitForFunction(() => window.location.pathname === "/inventory", { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.fill('input[placeholder*="ابحث بالاسم"]', productName);
    await waitForTableRow(page, "الصنف", productName);
    // Verify product row is present with correct name
    const row = page.locator(`table >> tr:has-text("${productName}")`);
    await expect(row).toBeVisible();
    // Verify stock decreased from initialQty after the sale
    const remainingQty = initialQty - saleQty;
    const cellTexts = await row.locator("td").allInnerTexts();
    const trimmed = cellTexts.map((t) => t.trim());
    expect(trimmed).toContain(String(remainingQty));
  });
});

test.describe("Offline Sync", () => {
  authTest.skip(
    "Queue operation offline, sync when online - skipped: realtime subscription timing unreliable in this environment",
    async ({ authenticatedPage }) => {
      const page = authenticatedPage;

      // Navigate to inventory
      await page.evaluate(() => {
        history.pushState(null, "", "/inventory");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      await page.waitForFunction(() => window.location.pathname === "/inventory", {
        timeout: 15000,
      });
      await page.waitForLoadState("networkidle");

      // Add product
      await page.getByRole("button", { name: "صنف جديد" }).click();
      await page.waitForTimeout(1000);
      await page.fill('input[name="name"]', "Offline Product");
      await page.fill("input.pr-10", "OFFLINE123");
      await page.fill('input[name="cost"]', "5");
      await page.fill('input[name="price"]', "15");
      await clickButton(page, "حفظ");
      await waitForToast(page, "تمت إضافة الصنف");
      await page.waitForTimeout(3000);

      // Verify product exists
      await page.fill('input[placeholder*="ابحث بالاسم"]', "Offline Product");
      await waitForTableRow(page, "الصنف", "Offline Product");
    },
  );
});

test.describe("Permissions", () => {
  test.skip("Cashier cannot access purchases - requires user management test setup", async ({
    page,
  }) => {
    test.skip();
  });
});

test.describe("Basic Navigation", () => {
  test("Home page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/نظام المخزون الذكي/);
  });

  test("Login page accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toContainText("تسجيل الدخول");
  });

  test("Navigation menu works", async ({ page }) => {
    await page.goto("/login");
    await page.click('button:has-text("ليس لديك حساب؟ أنشئ حساباً")');
    await expect(page.locator("h1")).toContainText("حساب جديد");
  });

  test("Dev server health check", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });
});
