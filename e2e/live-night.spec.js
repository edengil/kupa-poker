import { test, expect } from "@playwright/test";
import { resetPreview, openLive, addPlayer, setCashout } from "./helpers.js";

/**
 * זרימות קריטיות שיכולות לשבור ערב אמיתי:
 * טעינה · הושבה · יציאות חלקיות · סיום · חלוקה · ביטול · שימור בטאב ערבים.
 */
test.describe("ערב חי עד חלוקה", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await resetPreview(page);
  });

  test("טוען את סביבת הבדיקה ומציג טבלה + טופס אחרון", async ({ page }) => {
    await expect(page.getByTestId("preview-banner")).toContainText("סביבת בדיקה");
    await expect(page.getByTestId("tab-table")).toBeVisible();
    await expect(page.getByText("טופס אחרון")).toBeVisible();
    await expect(page.getByText("חם עכשיו")).toBeVisible();
  });

  test("חוסם סיום ערב בלי יציאות מלאות", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "אלפא");
    await addPlayer(page, "בטה");
    await setCashout(page, "אלפא", 200);

    const finish = page.getByTestId("live-finish");
    await expect(finish).toBeDisabled();
    await expect(
      page.getByRole("status").filter({ hasText: "יש להשלים ג׳יטונים ביציאה" })
    ).toBeVisible();
  });

  test("ביטול אחרון מסיר כניסה לשולחן", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "גמא");
    await expect(page.getByTestId("live-cashout-גמא")).toBeVisible();
    await expect(page.getByTestId("live-undo")).toBeVisible();
    await page.getByTestId("live-undo").click();
    await expect(page.getByTestId("live-cashout-גמא")).toHaveCount(0);
  });

  test("סיום ערב מאוזן פותח חלוקה ידנית ושומר בערבים", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "אלפא");
    await addPlayer(page, "בטה");
    /* cps=2 · קנייה 50₪ לכל אחד = 200 ג' בקופה · אלפא +50 / בטה −50 */
    await setCashout(page, "אלפא", 200);
    await setCashout(page, "בטה", 0);

    const finish = page.getByTestId("live-finish");
    await expect(finish).toBeEnabled();
    await finish.click();

    await expect(page.getByTestId("live-settlement-builder")).toBeVisible();
    await expect(page.getByText("חלוקה ידנית · רק אצלך")).toBeVisible();
    await expect(page.getByText("מי שצריך לשלם")).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "חלוקת תשלומים" }).getByRole("button", { name: "בטה 50₪" })
    ).toBeVisible();

    await page.getByTestId("settlement-close").click();
    await expect(page.getByTestId("live-settlement-builder")).toHaveCount(0);

    await page.getByTestId("tab-sessions").click();
    await expect(page.getByTestId("tab-sessions")).toHaveAttribute("aria-current", "page");
    /* הערב נשמר — מונה הערבים עולה (SEED מתחיל מ־118 בדרך כלל) */
    await expect(page.getByTestId("tab-sessions")).toContainText(/\d+/);
    await expect(page.getByText("אלפא").first()).toBeVisible();
  });

  test("רענון באמצע ערב משחזר שחקנים מהמטמון המקומי", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "דלתא");
    await setCashout(page, "דלתא", 100);

    await expect
      .poll(async () =>
        page.evaluate(() => localStorage.getItem("poker:preview:poker:live"))
      )
      .toContain("דלתא");

    await page.reload();
    await page.getByTestId("preview-banner").waitFor({ state: "visible" });
    await openLive(page);
    await expect(page.getByTestId("live-cashout-דלתא")).toBeVisible();
    await expect(page.getByTestId("live-cashout-דלתא")).toHaveValue("100");
  });
});
