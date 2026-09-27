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

  test("מנהל שולח לינק חלוקה מכרטיס הערב; כשנגמרת המכסה נפתח שיתוף ידני", async ({ page }) => {
    let posted = null;
    await page.route("**/api/send", async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({
        status: 402,
        contentType: "application/json",
        body: JSON.stringify({ error: "נגמרה המכסה", code: "whapi_quota", shareFallback: true }),
      });
    });

    await page.evaluate(() => localStorage.setItem("poker:cache:group", JSON.stringify({ slug: "kupa-e2e" })));
    await openLive(page);
    await addPlayer(page, "לינק א");
    await addPlayer(page, "לינק ב");
    await setCashout(page, "לינק א", 200);
    await setCashout(page, "לינק ב", 0);
    await page.getByTestId("live-finish").click();
    await expect(page.getByTestId("live-settlement-builder")).toBeVisible();
    await page.getByTestId("settlement-close").click();

    await page.getByTestId("tab-table").click();
    const card = page.getByTestId("last-settlement-card");
    await card.getByTestId("send-settlement-link").click();
    await expect(card.getByTestId("send-settlement-link-fallback")).toBeVisible();
    expect(posted?.text).toContain("מסמנים כאן מי העביר:");
    expect(posted?.text).toMatch(/\/n\/[^/\s]+$/);
  });
});
