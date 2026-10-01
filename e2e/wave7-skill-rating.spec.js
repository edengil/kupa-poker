import { test, expect } from "@playwright/test";
import { resetPreview } from "./helpers.js";

/**
 * גל 7 · תכונה 6 — דירוג מיומנות (ELO) בטאב השחקנים ובפרופיל.
 *
 * בזרע: עדן גיל ראשון בדירוג (107 ערבים, ציון ≈1078), 18 שחקנים מדורגים
 * (5+ ערבים). אברהם חבבו עם ערב אחד — בלי תג, ובפרופיל שורת "עוד X ערבים".
 */

test.describe("גל 7 · דירוג מיומנות ELO", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await resetPreview(page);
    await page.getByTestId("tab-players").click();
  });

  test("תג דירוג מופיע לשחקנים עם 5+ ערבים, ובפרופיל שורת הדירוג המלאה", async ({ page }) => {
    // 18 שחקנים מדורגים בזרע — תגים עם טיפת 🎯 וציון
    const badges = page.locator('[title^="דירוג מיומנות"]');
    await expect.poll(async () => badges.count()).toBeGreaterThanOrEqual(15);

    // עדן גיל: מקום ראשון, ציון 1078 (השורה בטבלת השחקנים — עם מונה הערבים)
    const edenRow = page
      .locator("button", { hasText: "עדן גיל" })
      .filter({ hasText: "ערבים" })
      .first();
    await expect(edenRow).toContainText("🎯");
    await expect(edenRow).toContainText("1078");

    await edenRow.click();
    await expect(page.getByText(/🎯 דירוג מיומנות:/)).toBeVisible();
    await expect(page.getByText(/מקום 1 מתוך 18/)).toBeVisible();
    await page.screenshot({ path: "test-results/wave7-profile-elo.png" });
  });

  test("שחקן עם פחות מחמישה ערבים בלי תג, ובפרופיל ספירה לאחור לכניסה לטבלה", async ({ page }) => {
    await page.getByLabel("חיפוש שחקן").fill("אברהם");
    const row = page
      .locator("button", { hasText: "אברהם חבבו" })
      .filter({ hasText: "ערבים" })
      .first();
    await expect(row).toBeVisible();
    await expect(row).not.toContainText(/🎯\s*\d/);

    await row.click();
    await expect(page.getByText(/עוד 4 ערבים לכניסה לטבלה הרשמית/)).toBeVisible();
  });
});
