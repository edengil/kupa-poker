import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import os from "os";
import { resetPreview } from "./helpers.js";

function writeTempJson(name, data) {
  const file = path.join(os.tmpdir(), name);
  fs.writeFileSync(file, JSON.stringify(data), "utf8");
  return file;
}

const miniDb = {
  sessions: [
    {
      id: "imp_1",
      iso: "2026-07-15",
      d: 15,
      mo: 7,
      y: 2026,
      entries: [
        { name: "ייבוא אלפא", amount: 80 },
        { name: "ייבוא בטה", amount: -80 },
      ],
    },
  ],
  yearly: [],
  monthly: [],
  aliases: {},
  roster: ["ייבוא אלפא", "ייבוא בטה"],
};

/**
 * ייבוא גיבוי — קובץ תקול נדחה, קובץ תקין מחליף נתונים.
 */
test.describe("ייבוא גיבוי", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await resetPreview(page);
  });

  test("קובץ לא תקין מציג שגיאה ולא מחליף", async ({ page }) => {
    await page.getByTestId("tab-input").click();
    await expect(page.getByTestId("backup-import-btn")).toBeVisible({ timeout: 20_000 });

    const bad = writeTempJson(`kupa-bad-${Date.now()}.json`, { hello: "nope" });
    await page.getByTestId("backup-import-input").setInputFiles(bad);
    await expect(page.getByTestId("backup-import-error")).toBeVisible();
    await expect(page.getByTestId("backup-import-confirm")).toHaveCount(0);
  });

  test("קובץ תקין מאפשר החלפה ומופיע בטבלה", async ({ page }) => {
    await page.getByTestId("tab-input").click();
    await expect(page.getByTestId("backup-import-btn")).toBeVisible({ timeout: 20_000 });

    const good = writeTempJson(`kupa-good-${Date.now()}.json`, miniDb);
    await page.getByTestId("backup-import-input").setInputFiles(good);
    await expect(page.getByTestId("backup-import-confirm")).toContainText("1 ערבים");
    await page.getByTestId("backup-import-apply").click();

    await page.getByTestId("tab-table").click();
    await expect(page.getByText("ייבוא אלפא").first()).toBeVisible({ timeout: 15_000 });
  });
});
