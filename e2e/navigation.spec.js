import { test, expect } from "@playwright/test";
import { resetPreview } from "./helpers.js";

/**
 * מסכים שאינם לייב — נפילות נפוצות אחרי lazy-load / טעינת SEED.
 */
test.describe("ניווט ומסכים", () => {
  test.beforeEach(async ({ page }) => {
    await resetPreview(page);
  });

  test("טאב שחקנים נטען אחרי פיצול קוד", async ({ page }) => {
    await page.getByTestId("tab-players").click();
    await expect(page.getByPlaceholder("חיפוש שחקן…")).toBeVisible({ timeout: 20_000 });
  });

  test("טאב שיאים נטען", async ({ page }) => {
    await page.getByTestId("tab-records").click();
    await expect(page.getByText(/שיא|רווח|טיפ|ג׳יטונים|גיבור/)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("טאב הזנה נטען לבעלים", async ({ page }) => {
    await page.getByTestId("tab-input").click();
    await expect(
      page.getByPlaceholder(/סיכום פוקר/)
    ).toBeVisible({ timeout: 20_000 });
  });
});
