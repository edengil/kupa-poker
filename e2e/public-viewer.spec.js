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

  test("בלי שיתוף היסטוריה — מסתירים ערבים ומאזנים", async ({ page }) => {
    await page.goto("/preview/viewer?history=0");
    await expect(page.getByTestId("preview-viewer-banner")).toContainText("היסטוריה מוסתרת");
    await expect(page.getByText("אלפא צופה")).toHaveCount(0);
    await expect(page.getByTestId("tab-live")).toHaveCount(0);
    await expect(page.getByTestId("tab-table")).toBeVisible();
  });

  test("עם לייב פעיל — מוצג משחק עכשיו גם בלי היסטוריה", async ({ page }) => {
    await page.goto("/preview/viewer?history=0&live=1");
    await expect(page.getByTestId("preview-viewer-live")).toBeVisible();
    await expect(page.getByText("חי בלייב")).toBeVisible();
    await expect(page.getByText("אלפא צופה")).toHaveCount(0);
  });
});
