import { test, expect } from "@playwright/test";
import { openLive, addPlayer, setCashout } from "./helpers.js";

/**
 * כשל שמירה לשרת — הנתונים נשארים במכשיר / בערב שנשמר.
 */
test.describe("כשל רשת בשמירה", () => {
  test("סיום ערב עם flush כושל עדיין פותח חלוקה ושומר מקומית", async ({ page }) => {
    const alerts = [];
    page.on("dialog", async (dialog) => {
      alerts.push(dialog.message());
      await dialog.accept();
    });

    await page.goto("/preview?failFlush=1");
    await page.evaluate(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("poker:preview:")) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    });
    await page.reload();
    await expect(page.getByTestId("preview-banner")).toContainText("כשל שמירה");

    await openLive(page);
    await addPlayer(page, "נט אלפא");
    await addPlayer(page, "נט בטה");
    await setCashout(page, "נט אלפא", 200);
    await setCashout(page, "נט בטה", 0);

    await page.getByTestId("live-finish").click();
    await expect(page.getByTestId("live-settlement-builder")).toBeVisible({ timeout: 20_000 });
    expect(alerts.some((m) => /שרת|נשמר במכשיר/.test(m))).toBe(true);

    await page.getByTestId("settlement-close").click();
    const raw = await page.evaluate(() => localStorage.getItem("poker:preview:poker:db"));
    expect(raw).toContain("נט אלפא");
    expect(raw).toContain("נט בטה");
  });
});
