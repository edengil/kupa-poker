import { test, expect } from "@playwright/test";
import { resetPreview } from "./helpers.js";

/**
 * באדג' התראות בסגנון פייסבוק: סופר רק התראות שטרם נצפו.
 * גל 5, פריט 5.2: המגירה מסמנת כנצפו רק פריטים שהוצגו בפועל (נכנסו לאזור
 * הגלילה הנראה בשיעור 0.6) — זו כוונת המוצר, לא תקלה: פתיחת מגירה בלבד
 * לא מאפסת את הבאדג' אם חלק מהפריטים נשארו מתחת לקפל, והבאדג' נשאר על
 * מה שלא נראה עד שגוללים אליו. לכן הבדיקה גוללת את הרשימה עד סופה —
 * רק אחרי שכל פריט הוצג בפועל הבאדג' מתאפס, ונשמר כך גם אחרי רענון.
 * מפתח ה־seen כולל רכיב קבוצה (אין דיכוי חוצה־קבוצות).
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

  test("באדג' מראה N, גלילה על כל הפריטים מאפסת, סגירה ורענון שומרים 0", async ({ page }) => {
    const badge = page.getByTestId("notifications-count");
    await expect(badge).toBeVisible({ timeout: 20_000 });
    const n = Number(await badge.textContent());
    expect(n).toBeGreaterThan(0);

    await page.getByTestId("notifications-button").click();
    await expect(page.getByTestId("notifications-sheet")).toBeVisible();

    // מציגים בפועל כל פריט ברשימה (גלילה אליו) — רק פריט שהוצג מסומן
    // כנצפה, ורק כשכולם הוצגו הבאדג' מתאפס.
    const items = page.locator("[data-notice-id]");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await items.nth(i).scrollIntoViewIfNeeded();
    }
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
