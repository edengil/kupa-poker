import { test, expect } from "@playwright/test";
import { resetPreview } from "./helpers.js";

async function openAs(page, name) {
  const url = `/preview?as=${encodeURIComponent(name)}`;
  await page.goto(url);
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("poker:preview:")) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  });
  await page.goto(url);
  await page.getByTestId("preview-banner").waitFor({ state: "visible" });
}

test.describe("אישור העברה", () => {
  test("במסך הניהול רואים את אישורי הערב האחרון", async ({ page }) => {
    await resetPreview(page);
    await expect(page.getByTestId("transfer-confirm-popup")).toHaveCount(0);
    await page.getByTestId("tab-sessions").click();
    const panel = page.getByTestId("latest-night-confirmations");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("26.7.2026");
    await expect(panel.getByText("ממתין").first()).toBeVisible();
    await expect(panel.getByText("שולם")).toHaveCount(0);
    await expect(panel.getByText(/אל /).first()).toBeVisible();
  });

  test("שחקן שחוזר בלי לאשר העברה רואה חלון, ואחרי אישור הוא נעלם", async ({ page }) => {
    await openAs(page, "אופיר");
    const popup = page.getByTestId("transfer-confirm-popup");
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("צריך לאשר שהעברת");
    await expect(popup).toContainText("עדיין לא סומן שהכסף הועבר");
    await expect(popup.getByText("ממתין").first()).toBeVisible();

    await page.getByTestId("transfer-confirm-later").click();
    await expect(popup).toHaveCount(0);

    await page.reload();
    await page.getByTestId("preview-banner").waitFor({ state: "visible" });
    await expect(page.getByTestId("transfer-confirm-popup")).toBeVisible();

    await page.getByTestId("transfer-confirm-yes").click();
    await expect(page.getByTestId("transfer-confirm-popup")).toHaveCount(0);

    await page.reload();
    await page.getByTestId("preview-banner").waitFor({ state: "visible" });
    await expect(page.getByTestId("transfer-confirm-popup")).toHaveCount(0);

    await page.getByTestId("tab-sessions").click();
    const panel = page.getByTestId("latest-night-confirmations");
    await expect(panel.getByText("שולם").first()).toBeVisible();
  });
});
