import { test, expect } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import { resetPreview } from "./helpers.js";

/**
 * גל 7 · תכונה 2 — גרף השוואת שחקנים בטאב השיאים.
 * גל 7 · תכונה 3 — כרטיס סיכום מעוצב לשיתוף כתמונה.
 *
 * נתוני הזרע כוללים 118 ערבים, כך שהבחירה ברירת־המחדל היא שני המובילים
 * במאזן (אופיר סנה, שגיא גיל). שיתוף מערכתי (Web Share) לא קיים בדפדפן
 * שולחני — הנתיב שנבדק הוא נפילת־הגיבוי להורדת PNG, כמו במכשיר בלי שיתוף.
 */

const CHART_LABEL = "גרף רווח מצטבר של השחקנים הנבחרים";

test.describe("גל 7 · גרף השוואה וכרטיס סיכום", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await resetPreview(page);
    await page.getByTestId("tab-records").click();
  });

  test("בחירת שחקנים מציירת את כל העקומות עם מקרא, עד ארבעה", async ({ page }) => {
    const chart = page.getByRole("img", { name: CHART_LABEL });
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toBeVisible();

    // ברירת מחדל: שני המובילים במאזן
    const card = chart.locator("..");
    await expect(chart.locator("path")).toHaveCount(2);
    await expect(card).toContainText("אופיר סנה");
    await expect(card).toContainText("שגיא גיל");

    const chip = (name) => page.locator("button[aria-pressed]", { hasText: name });

    // מוסיפים שלישי ורביעי — עקומה ומקרא מתעדכנים
    await chip("אורן גיל").scrollIntoViewIfNeeded();
    await chip("אורן גיל").click();
    await expect(chart.locator("path")).toHaveCount(3);
    await chip("עדן גיל").click();
    await expect(chart.locator("path")).toHaveCount(4);
    await expect(card).toContainText("אורן גיל");
    await expect(card).toContainText("עדן גיל");

    // חמישי לא נכנס — המכסה היא ארבעה
    await chip("דן ינקלויץ").click();
    await expect(chart.locator("path")).toHaveCount(4);
    await expect(chip("דן ינקלויץ")).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.locator('button[aria-pressed="true"]')
    ).toHaveCount(4);

    // סינון "כל הזמנים" שומר את כל הסדרות
    const yearSelect = page
      .locator("label", { hasText: "שנה להשוואה" })
      .locator("select");
    await yearSelect.selectOption("all");
    await expect(chart.locator("path")).toHaveCount(4);

    // הסרת שחקן מורידה את העקומה שלו
    await chip("אורן גיל").click();
    await expect(chart.locator("path")).toHaveCount(3);
    await card.screenshot({ path: "test-results/wave7-compare-chart.png" });
  });

  test("כפתור כרטיס הסיכום מייצר תמונת PNG להורדה", async ({ page }) => {
    const btn = page.getByRole("button", { name: /שתף כרטיס סיכום מעוצב/ });
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeVisible();

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await btn.click();
    const download = await downloadPromise;

    // כרום חסר־ראש לפעמים מציע "download" לקובץ blob במקום שם ה־download
    // של האפליקציה — התוכן הוא מה שקובע, והוא נבדק למטה מול חתימת PNG.
    expect(download.suggestedFilename()).toMatch(/^kupa-poker-.*\.png$|^download$/);
    const out = "test-results/wave7-summary-card.png";
    await download.saveAs(out);

    const info = await stat(out);
    expect(info.size).toBeGreaterThan(10_000);
    const head = (await readFile(out)).subarray(0, 4);
    expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47]); // חתימת PNG

    await expect(
      page.getByText(/הכרטיס ירד כקובץ תמונה/)
    ).toBeVisible();
    await page.screenshot({ path: "test-results/wave7-records-tab.png" });
  });
});
