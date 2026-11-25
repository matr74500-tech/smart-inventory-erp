# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: critical-flow.spec.ts >> Critical Flow: Login → Product → Sale → Stock >> Create product, make sale, verify stock decrement
- Location: e2e/critical-flow.spec.ts:6:3

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: "97"
Received array: ["Test Product 1795567431841
نص درزن · حبة (1)", "ITM-0082
TEST1795567431841", "—", "20", "100", "0", "100", ""]
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - complementary [aria-hidden] [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - generic [ref=e6]:
            - generic [ref=e7]: نظام المخزون الذكي
            - generic [ref=e8]: نقاط البيع وإدارة المخزون
          - button [ref=e9] [cursor=pointer]
        - navigation [ref=e10]:
          - link [ref=e11] [cursor=pointer]:
            - /url: /
            - generic [ref=e17]: الرئيسية
          - link [ref=e18] [cursor=pointer]:
            - /url: /inventory
            - generic [ref=e29]: الأصناف والمخزون
          - link [ref=e30] [cursor=pointer]:
            - /url: /purchases
            - generic [ref=e35]: فاتورة مشتريات
          - link [ref=e36] [cursor=pointer]:
            - /url: /sales
            - generic [ref=e41]: المبيعات
          - link [ref=e42] [cursor=pointer]:
            - /url: /customers
            - generic [ref=e48]: العملاء
          - link [ref=e49] [cursor=pointer]:
            - /url: /cash
            - generic [ref=e53]: الصندوق والإقفال
          - link [ref=e54] [cursor=pointer]:
            - /url: /reports
            - generic [ref=e58]: التقارير
          - link [ref=e59] [cursor=pointer]:
            - /url: /prices
            - generic [ref=e63]: تحديث الأسعار
          - link [ref=e64] [cursor=pointer]:
            - /url: /alerts
            - generic [ref=e68]: تنبيهات المخزون
          - link [ref=e69] [cursor=pointer]:
            - /url: /labels
            - generic [ref=e74]: ملصقات الباركود
          - link [ref=e75] [cursor=pointer]:
            - /url: /catalog
            - generic [ref=e79]: كتالوج PDF
          - link [ref=e80] [cursor=pointer]:
            - /url: /stocktake
            - generic [ref=e85]: الجرد والإدخال
          - link [ref=e86] [cursor=pointer]:
            - /url: /transfers
            - generic [ref=e90]: التحويلات
          - link [ref=e91] [cursor=pointer]:
            - /url: /reorders
            - generic [ref=e97]: التوريد
          - link [ref=e98] [cursor=pointer]:
            - /url: /suppliers
            - generic [ref=e104]: الموردون
          - link [ref=e105] [cursor=pointer]:
            - /url: /purchase_orders
            - generic [ref=e110]: أوامر الشراء
          - link [ref=e111] [cursor=pointer]:
            - /url: /returns
            - generic [ref=e115]: المرتجعات والمردودات
          - link [ref=e116] [cursor=pointer]:
            - /url: /expenses
            - generic [ref=e119]: المصروفات العامة
          - link [ref=e120] [cursor=pointer]:
            - /url: /sales_reps
            - generic [ref=e126]: المناديب والعمولات
          - link [ref=e127] [cursor=pointer]:
            - /url: /activity_log
            - generic [ref=e130]: سجل تحركات النظام
          - link [ref=e131] [cursor=pointer]:
            - /url: /scanner_settings
            - generic [ref=e133]: إعدادات ماسح الباركود
          - link [ref=e134] [cursor=pointer]:
            - /url: /barcode_labels
            - generic [ref=e139]: إعدادات ملصقات الباركود
          - link [ref=e140] [cursor=pointer]:
            - /url: /ui_theme
            - generic [ref=e147]: التخصيص والشكل
          - link [ref=e148] [cursor=pointer]:
            - /url: /home_shortcuts
            - generic [ref=e154]: اختصارات الصفحة الرئيسية
          - link [ref=e155] [cursor=pointer]:
            - /url: /share_settings
            - generic [ref=e162]: إعدادات المشاركة
          - link [ref=e163] [cursor=pointer]:
            - /url: /system_timezone
            - generic [ref=e167]: التوقيت الزمني
          - link [ref=e168] [cursor=pointer]:
            - /url: /settings
            - generic [ref=e172]: الإعدادات
          - link [ref=e173] [cursor=pointer]:
            - /url: /backup
            - generic [ref=e180]: النسخ الاحتياطي
          - link [ref=e181] [cursor=pointer]:
            - /url: /users
            - generic [ref=e187]: المستخدمون
          - link [ref=e188] [cursor=pointer]:
            - /url: /cleanup
            - generic [ref=e192]: حذف وتنظيف البيانات
        - generic [ref=e193]:
          - generic [ref=e194]:
            - generic [ref=e195]: matr74500
            - generic [ref=e196]: بائع، مدير
          - button [ref=e197] [cursor=pointer]
    - banner [ref=e199]:
      - button "فتح القائمة" [ref=e200] [cursor=pointer]
      - heading "الأصناف والمخزون" [level=1] [ref=e201]
      - button "بحث سريع عن صنف" [ref=e202] [cursor=pointer]
    - main [ref=e204]:
      - generic [ref=e205]:
        - textbox "ابحث بالاسم أو الكود أو الباركود…" [active] [ref=e210]: Test Product 1795567431841
        - button "مسح الباركود" [ref=e211] [cursor=pointer]
        - button "صنف جديد" [ref=e212] [cursor=pointer]
      - generic [ref=e213]:
        - combobox [ref=e214] [cursor=pointer]:
          - generic: كل الفئات
        - combobox [ref=e217] [cursor=pointer]:
          - generic: كل المستودعات
        - button "استيراد" [ref=e221] [cursor=pointer]
        - button "تصدير" [ref=e222] [cursor=pointer]
        - link "كتالوج PDF" [ref=e223] [cursor=pointer]:
          - /url: /catalog
        - link "ملصقات" [ref=e224] [cursor=pointer]:
          - /url: /labels
      - table [ref=e226]:
        - rowgroup [ref=e227]:
          - row [ref=e228]:
            - columnheader "الصنف" [ref=e229]
            - columnheader "الكود / الباركود" [ref=e230]
            - columnheader "الفئة / الرف" [ref=e231]
            - columnheader "تجزئة" [ref=e232]
            - columnheader "المستودع الرئيسي" [ref=e233]
            - columnheader "فرع المبيعات" [ref=e234]
            - columnheader "الإجمالي" [ref=e235]
            - columnheader [ref=e236]
        - rowgroup [ref=e237]:
          - row [ref=e238]:
            - cell "Test Product 1795567431841 نص درزن · حبة (1)" [ref=e239]:
              - generic [ref=e246]:
                - generic [ref=e247]: Test Product 1795567431841
                - generic [ref=e248]: نص درزن · حبة (1)
            - cell "ITM-0082 TEST1795567431841" [ref=e249]:
              - generic [ref=e250]: ITM-0082
              - generic [ref=e251]: TEST1795567431841
            - cell "—" [ref=e252]
            - cell "20" [ref=e254]
            - cell "100" [ref=e255]
            - cell "0" [ref=e256]
            - cell "100" [ref=e257]
            - cell [ref=e258]:
              - button "تعديل" [ref=e259] [cursor=pointer]
      - paragraph [ref=e260]: "أعمدة ملف الاستيراد: الاسم، الكود، الباركود، الوصف، الموديل، الفئة، الرف، الوحدة، الوحدة الكبرى، سعة العبوة، التكلفة، المورد، سعر خاص، تجزئة، نصف جملة، جملة، جملة الجملة."
  - region "Notifications alt+T"
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import { test as authTest } from "./fixtures/auth";
  3   | import { fillInput, clickButton, waitForToast, waitForTableRow } from "./utils/helpers";
  4   | 
  5   | test.describe("Critical Flow: Login → Product → Sale → Stock", () => {
  6   |   test("Create product, make sale, verify stock decrement", async ({ page }) => {
  7   |     test.setTimeout(120000);
  8   |     const productName = `Test Product ${Date.now()}`;
  9   |     const barcode = `TEST${Date.now()}`;
  10  |     const initialQty = 100;
  11  |     const saleQty = 3;
  12  | 
  13  |     // Login
  14  |     await page.goto("/login");
  15  |     await page.waitForLoadState("networkidle");
  16  |     await page.fill('input[id="u"]', "matr74500");
  17  |     await page.fill('input[id="p"]', "TestPass123!");
  18  |     await page.click('button:has-text("دخول")');
  19  |     await page.waitForURL("/", { timeout: 30000 });
  20  |     await page.waitForLoadState("networkidle");
  21  | 
  22  |     // 1. Go to stocktake page
  23  |     await page.evaluate(() => {
  24  |       history.pushState(null, "", "/stocktake");
  25  |       window.dispatchEvent(new PopStateEvent("popstate"));
  26  |     });
  27  |     await page.waitForFunction(() => {
  28  |       return window.location.pathname === "/stocktake" && !!document.querySelector('input[placeholder*="بحث"]');
  29  |     }, { timeout: 15000 });
  30  | 
  31  |     // Select warehouse to see all products
  32  |     await page.getByRole('combobox').first().click();
  33  |     await page.getByRole('option').first().click();
  34  |     await page.waitForTimeout(500);
  35  | 
  36  |     // 2. Create product from stocktake page
  37  |     await clickButton(page, "إضافة صنف جديد");
  38  |     await fillInput(page, "اسم الصنف", productName);
  39  |     await fillInput(page, "الباركود", barcode);
  40  |     await fillInput(page, "الوحدة", "حبة");
  41  |     await fillInput(page, "تكلفة الشراء", "10");
  42  |     await fillInput(page, "تجزئة", "20");
  43  |     await clickButton(page, "حفظ");
  44  |     await page.waitForLoadState("networkidle");
  45  | 
  46  |     // 3. Set initial stock (stocktake)
  47  |     await page.fill('input[placeholder*="بحث"]', productName);
  48  |     await waitForTableRow(page, "الصنف", productName);
  49  |     const productRow = page.locator(`:has-text("${productName}")`).last().locator("..").locator("..");
  50  |     await productRow.locator('input[placeholder*="الكمية"]').fill(String(initialQty));
  51  |     await productRow.evaluate((row) => {
  52  |       const btn = row.querySelector('button[aria-label="حفظ"]');
  53  |       if (btn && !btn.disabled) (btn as HTMLButtonElement).click();
  54  |     });
  55  |     await waitForToast(page, "تم تحديث الكمية");
  56  | 
  57  |     // 4. Make a sale
  58  |     await page.evaluate(() => {
  59  |       history.pushState(null, "", "/sales");
  60  |       window.dispatchEvent(new PopStateEvent("popstate"));
  61  |     });
  62  |     await page.waitForFunction(() => window.location.pathname === "/sales", { timeout: 15000 });
  63  |     await page.waitForLoadState("networkidle");
  64  |     await page.waitForTimeout(2000);
  65  |     // Select warehouse
  66  |     await page.locator('label:has-text("المستودع")').locator("..").locator('[role="combobox"]').click();
  67  |     await page.getByRole('option').first().click();
  68  |     await page.fill('input[placeholder*="امسح الباركود"]', barcode);
  69  |     await page.keyboard.press("Enter");
  70  |     await page.locator('input[aria-label*="كمية"]').waitFor({ state: "visible", timeout: 10000 });
  71  | 
  72  |     // Update quantity in cart and post sale
  73  |     await page.locator('input[aria-label*="كمية"]').fill(String(saleQty));
  74  |     await page.getByRole('button', { name: 'حفظ وترحيل البيع' }).click();
  75  |     // Wait for sale to post (RPC may complete silently); then navigate to inventory
  76  |     await page.waitForTimeout(20000);
  77  | 
  78  |     // 5. Verify product appears in inventory after sale and stock decreased
  79  |     await page.evaluate(() => {
  80  |       history.pushState(null, "", "/inventory");
  81  |       window.dispatchEvent(new PopStateEvent("popstate"));
  82  |     });
  83  |     await page.waitForFunction(() => window.location.pathname === "/inventory", { timeout: 15000 });
  84  |     await page.waitForLoadState("networkidle");
  85  |     await page.fill('input[placeholder*="ابحث بالاسم"]', productName);
  86  |     await waitForTableRow(page, "الصنف", productName);
  87  |     // Verify product row is present with correct name
  88  |     const row = page.locator(`table >> tr:has-text("${productName}")`);
  89  |     await expect(row).toBeVisible();
  90  |     // Verify stock decreased from initialQty after the sale
  91  |     const remainingQty = initialQty - saleQty;
  92  |     const cellTexts = await row.locator('td').allInnerTexts();
  93  |     const trimmed = cellTexts.map((t) => t.trim());
> 94  |     expect(trimmed).toContain(String(remainingQty));
      |                     ^ Error: expect(received).toContain(expected) // indexOf
  95  |   });
  96  | });
  97  | 
  98  | test.describe("Offline Sync", () => {
  99  |   authTest.skip("Queue operation offline, sync when online - skipped: realtime subscription timing unreliable in this environment", async ({
  100 |     authenticatedPage,
  101 |   }) => {
  102 |     const page = authenticatedPage;
  103 | 
  104 |     // Navigate to inventory
  105 |     await page.evaluate(() => {
  106 |       history.pushState(null, "", "/inventory");
  107 |       window.dispatchEvent(new PopStateEvent("popstate"));
  108 |     });
  109 |     await page.waitForFunction(() => window.location.pathname === "/inventory", { timeout: 15000 });
  110 |     await page.waitForLoadState("networkidle");
  111 | 
  112 |     // Add product
  113 |     await page.getByRole('button', { name: 'صنف جديد' }).click();
  114 |     await page.waitForTimeout(1000);
  115 |     await page.fill('input[name="name"]', "Offline Product");
  116 |     await page.fill('input.pr-10', "OFFLINE123");
  117 |     await page.fill('input[name="cost"]', "5");
  118 |     await page.fill('input[name="price"]', "15");
  119 |     await clickButton(page, "حفظ");
  120 |     await waitForToast(page, "تمت إضافة الصنف");
  121 |     await page.waitForTimeout(3000);
  122 | 
  123 |     // Verify product exists
  124 |     await page.fill('input[placeholder*="ابحث بالاسم"]', "Offline Product");
  125 |     await waitForTableRow(page, "الصنف", "Offline Product");
  126 |   });
  127 | });
  128 | 
  129 | test.describe("Permissions", () => {
  130 |   test.skip("Cashier cannot access purchases - requires user management test setup", async ({
  131 |     page,
  132 |   }) => {
  133 |     test.skip();
  134 |   });
  135 | });
  136 | 
  137 | test.describe("Basic Navigation", () => {
  138 |   test("Home page loads", async ({ page }) => {
  139 |     await page.goto("/");
  140 |     await expect(page).toHaveTitle(/نظام المخزون الذكي/);
  141 |   });
  142 | 
  143 |   test("Login page accessible", async ({ page }) => {
  144 |     await page.goto("/login");
  145 |     await expect(page.locator("h1")).toContainText("تسجيل الدخول");
  146 |   });
  147 | 
  148 |   test("Navigation menu works", async ({ page }) => {
  149 |     await page.goto("/login");
  150 |     await page.click('button:has-text("ليس لديك حساب؟ أنشئ حساباً")');
  151 |     await expect(page.locator("h1")).toContainText("حساب جديد");
  152 |   });
  153 | 
  154 |   test("Dev server health check", async ({ page }) => {
  155 |     const response = await page.goto("/");
  156 |     expect(response?.status()).toBe(200);
  157 |   });
  158 | });
  159 | 
```