import { test, expect } from "@playwright/test";
import { resetPreview, openLive, addPlayer, setCashout } from "./helpers.js";

/**
 * גל 7 · תכונה 4 — התראת שיא חיה באמצע ערב.
 *
 * בסביבת הבדיקה בלבד: שיא יציאת הג'יטונים ההיסטורי בזרע הוא 2,000
 * (שגיא גיל). שחקן טסט שיוצא עם יותר — ההכרזה יוצאת ל־/api/send
 * שמיורט כאן במלואו (שום הודעה לא מגיעה לקבוצה אמיתית), פעם אחת
 * לכל שיא+שחקן (דדופ לערב), גם אם הערך ממשיך לעלות.
 */

test.describe("גל 7 · שיא חי באמצע ערב", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await resetPreview(page);
  });

  test("שבירת שיא בלייב מכריזה פעם אחת ליעד מיורט, בלי כפילות", async ({ page }) => {
    const sends = [];
    await page.route("**/api/send", async (route) => {
      sends.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await openLive(page);

    // הבוט כבוי כברירת מחדל בתצוגה — מדליקים כמו בעלים לפני ערב
    const botOnBtn = page.getByRole("button", { name: "הדלק", exact: true });
    if (await botOnBtn.isVisible().catch(() => false)) {
      await botOnBtn.click();
      await expect(page.getByText("בוט הוואטסאפ פעיל")).toBeVisible();
    }

    // שיא היציאה ההיסטורי הוא 2,000 ג' — 999,999 שובר אותו מיד
    await addPlayer(page, "שובר שיא");
    await setCashout(page, "שובר שיא", 999999);

    await expect.poll(() => sends.length).toBe(1);
    expect(sends[0]?.text).toContain("שיא חדש");
    expect(sends[0]?.text).toContain("שובר שיא");
    expect(sends[0]?.text).toContain("שגיא גיל");
    expect(sends[0]?.text).toContain("2,000");

    // הורדת הערך (עדיין מעל השיא) לא מכריזה שוב — דדופ לכל שיא+שחקן
    await setCashout(page, "שובר שיא", 888888);
    await page.waitForTimeout(1500);
    expect(sends.length).toBe(1);

    // שחקן אחר ששובר את אותו שיא — הכרזה נפרדת, גם רק פעם אחת
    await addPlayer(page, "שוברת שיא");
    await setCashout(page, "שוברת שיא", 999998);
    await expect.poll(() => sends.length).toBe(2);
    expect(sends[1]?.text).toContain("שוברת שיא");
    await setCashout(page, "שוברת שיא", 777777);
    await page.waitForTimeout(1500);
    expect(sends.length).toBe(2);

    await page.screenshot({ path: "test-results/wave7-live-record.png" });
  });

  test("בלי שבירת שיא אין הכרזה", async ({ page }) => {
    const sends = [];
    await page.route("**/api/send", async (route) => {
      sends.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await openLive(page);
    const botOnBtn = page.getByRole("button", { name: "הדלק", exact: true });
    if (await botOnBtn.isVisible().catch(() => false)) {
      await botOnBtn.click();
    }

    // יציאה רגילה של 100 ג' — רחוק מהשיא ההיסטורי
    await addPlayer(page, "שחקן רגיל");
    await setCashout(page, "שחקן רגיל", 100);
    await page.waitForTimeout(1500);
    expect(sends.length).toBe(0);
  });
});
