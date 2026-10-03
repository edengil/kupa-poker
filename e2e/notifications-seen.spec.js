import { test, expect } from "@playwright/test";
import { resetPreview } from "./helpers.js";

/**
 * באדג' התראות בסגנון פייסבוק: סופר רק התראות שטרם נצפו.
 * פתיחת המגירה מסמנת את כל ה־id-ים כנצפו — הבאדג' מתאפס ונשמר כך.
 */
test.describe("התראות — באדג' נצפה", () => {
  test.beforeEach(async ({ page }) => {
    await resetPreview(page);
    // ניקוי מעקב "נצפה" מהרצות קודמות (מפתח מחוץ ל־poker:preview:)
    await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("kupa:notices:seen")) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    });
    await page.reload();
    await page.getByTestId("preview-banner").waitFor({ state: "visible" });
  });

  test("באדג' מראה N, פתיחת מגירה מאפסת, סגירה ורענון שומרים 0", async ({ page }) => {
    const badge = page.getByTestId("notifications-count");
    await expect(badge).toBeVisible({ timeout: 20_000 });
    const n = Number(await badge.textContent());
    expect(n).toBeGreaterThan(0);

    await page.getByTestId("notifications-button").click();
    await expect(page.getByTestId("notifications-sheet")).toBeVisible();
    // נצפה — הבאדג' נעלם מיד בפתיחה
    await expect(badge).toBeHidden();

    await page.getByTestId("notifications-close").click();
    await expect(page.getByTestId("notifications-sheet")).toBeHidden();
    await expect(badge).toBeHidden();

    // הנצפה נשמר גם אחרי רענון — אין התראות חדשות
    await page.reload();
    await page.getByTestId("preview-banner").waitFor({ state: "visible" });
    await expect(page.getByTestId("notifications-count")).toBeHidden({ timeout: 20_000 });
  });
});
