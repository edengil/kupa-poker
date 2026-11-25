import { test, expect } from "@playwright/test";

/**
 * צופה ציבורי — בלי Google/Supabase, מול /preview/viewer.
 */
test.describe("צופה ציבורי", () => {
  test("עם שיתוף היסטוריה — רואים שחקן מהערבים", async ({ page }) => {
    await page.goto("/preview/viewer?history=1");
    await expect(page.getByTestId("preview-viewer-banner")).toContainText("היסטוריה גלויה");
    await expect(page.getByText("אלפא צופה").first()).toBeVisible({ timeout: 20_000 });
  });

  test("בלי שיתוף היסטוריה — בלי טאב לייב, והחלוקה מוסתרת עד אישור המנהל", async ({ page }) => {
    await page.goto("/preview/viewer?history=0");
    await expect(page.getByTestId("preview-viewer-banner")).toContainText("היסטוריה מוסתרת");
    await expect(page.getByTestId("tab-live")).toHaveCount(0);
    await expect(page.getByTestId("tab-table")).toBeVisible();
    /* כלל ברזל 3 (הכרעת עדן §7.4, גל Pot Boost): חלוקת ערב לא־מאושר
       נסתרת מהצופה לגמרי — גם כרטיס הערב האחרון בטאב הטבלה. ערב
       התצוגה אינו מאושר, ולכן הכרטיס לא מתרנדר. */
    await expect(page.getByTestId("tab-table")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("last-settlement-card")).toHaveCount(0);
    /* שליחת לינק לקבוצה — רק למנהל; צופה רגיל רק פותח את הלינק */
    await expect(page.getByTestId("send-settlement-link")).toHaveCount(0);
  });

  test("עם לייב פעיל — מוצג משחק עכשיו גם בלי היסטוריה", async ({ page }) => {
    await page.goto("/preview/viewer?history=0&live=1");
    await expect(page.getByTestId("preview-viewer-live")).toBeVisible();
    await expect(page.getByText("חי בלייב")).toBeVisible();
    await expect(page.getByText("צפייה בלבד")).toBeVisible();
    await expect(page.getByRole("button", { name: /חי בלייב/ })).toBeDisabled();
    /* כלל ברזל 3: גם עם לייב פעיל, חלוקת ערב לא־מאושר לא נחשפת לצופה. */
    await expect(page.getByTestId("last-settlement-card")).toHaveCount(0);
  });
});
