import { test, expect } from "@playwright/test";
import { resetPreview, openLive, addPlayer, setCashout } from "./helpers.js";

/**
 * חלוקה ידנית נשמרת בערב ושורדת רענון.
 */
test.describe("חלוקה ידנית שמורה", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await resetPreview(page);
  });

  test("רישום העברה נשאר אחרי רענון ומופיע כשולם", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "חלוקה א");
    await addPlayer(page, "חלוקה ב");
    await setCashout(page, "חלוקה א", 200);
    await setCashout(page, "חלוקה ב", 0);
    await page.getByTestId("live-finish").click();
    await expect(page.getByTestId("live-settlement-builder")).toBeVisible();

    const dialog = page.getByRole("dialog", { name: "חלוקת תשלומים" });
    await dialog.getByRole("button", { name: "חלוקה ב 50₪" }).click();
    await dialog.getByRole("button", { name: "רשום העברה" }).click();
    await expect(dialog.getByRole("status")).toContainText("הכול סגור");

    await page.getByTestId("settlement-close").click();
    await page.reload();
    await page.getByTestId("preview-banner").waitFor({ state: "visible" });

    await page.getByTestId("tab-sessions").click();
    await page.getByRole("button", { name: "חלוקה ותשלומים" }).first().click();
    await expect(page.getByTestId("live-settlement-builder")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "חלוקת תשלומים" }).getByRole("status")).toContainText(
      "הכול סגור"
    );
  });
});
