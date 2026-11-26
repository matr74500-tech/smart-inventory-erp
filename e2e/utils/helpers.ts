import { Page, Locator, expect } from "@playwright/test";

export async function waitForToast(page: Page, message: string, timeout = 5000) {
  await expect(page.locator(`[data-sonner-toast]:has-text("${message}")`)).toBeVisible({ timeout });
}

export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
  await page.waitForURL(path);
  await page.waitForLoadState("networkidle");
}

export async function fillInput(page: Page, label: string, value: string) {
  const container = page.locator(`label:has-text("${label}")`).locator("..");
  const select = container.locator("select").first();
  if ((await select.count()) > 0) {
    await select.selectOption(value);
  } else {
    await container.locator("input, textarea").first().fill(value);
  }
}

export async function selectOption(page: Page, label: string, value: string) {
  const select = page.locator(`label:has-text("${label}")`).locator("..").locator("select").first();
  await select.selectOption(value);
}

export async function clickButton(page: Page, text: string) {
  await page.evaluate((t) => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === t,
    );
    if (btn) (btn as HTMLButtonElement).click();
  }, text);
}

export async function waitForTableRow(page: Page, columnName: string, value: string) {
  await expect(page.locator(`:has-text("${value}")`).first()).toBeVisible({ timeout: 10000 });
}

export async function addProductToCart(page: Page, productName: string, quantity = 1) {
  await page.fill('input[placeholder*="امسح الباركود أو اكتب اسم الصنف"]', productName);
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await expect(page.locator(`text=${productName}`).first()).toBeVisible({ timeout: 5000 });
}

export async function completeSale(page: Page, paymentMethod = "نقدي YER") {
  await page.selectOption('select[aria-label*="طريقة الدفع"]', paymentMethod);
  await clickButton(page, "ترحيل الفاتورة");
  await waitForToast(page, "تم ترحيل الفاتورة");
}
