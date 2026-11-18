import { test, expect } from "@playwright/test";

/* כרטיס הערב בדף הערבים — ניהול העברות וקופה מהכרטיס (18.11):
   ערב אחרון בסגנון 17.11 עם קופה רשומה 65. מסך ה־preview הוא מנהל,
   לכן שורת הקופה והסימונים מהכרטיס פעילים כאן:
   שורת קופה במונה · עריכת «בפועל» 65→80 מהכרטיס · סימון כל השורות
   והקופה עד מונה מלא · ביטול סימון קופה מוריד את המונה · שמירה
   בטעינה מחדש. */
const DB_KEY = "poker:preview:poker:db";

const NIGHT_17_11 = {
  id: "e2e-potcard-1711",
  iso: "2026-11-17",
  d: 17,
  mo: 11,
  y: 2026,
  entries: [
    { name: "עדן גיל", amount: -200 },
    { name: "אופיר סנה", amount: 300 },
    { name: "קובי סעדה", amount: -150 },
    { name: "דור לירז", amount: 50 },
  ],
  savingsPot: 65,
};

async function seedNight(page) {
  await page.goto("/preview");
  await page.evaluate(
    ([key, night]) => {
      const db = {
        sessions: [night],
        yearly: [],
        monthly: [],
        aliases: {},
        emails: {},
        phones: {},
        roster: [],
      };
      localStorage.setItem(key, JSON.stringify(db));
    },
    [DB_KEY, NIGHT_17_11]
  );
  await page.reload();
  await page.getByTestId("tab-sessions").click();
}

test.describe("כרטיס הערב — קופה וסימונים מהכרטיס", () => {
  test("שורת קופה, עריכת בפועל, סימון מלא וביטול סימון", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
    await seedNight(page);

    const panel = page.getByTestId("latest-night-confirmations");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("17.11.2026");

    /* שורת הקופה: עדן גיל ← קופת חיסכון · 65₪ · ממתין, והמונה כולל אותה */
    const potRow = page.getByTestId("night-confirm-pot-row");
    await expect(potRow).toBeVisible();
    await expect(potRow).toContainText("קופת חיסכון");
    await expect(potRow).toContainText("65₪");
    await expect(page.getByTestId("night-confirm-pot-state")).toHaveText("ממתין");
    await expect(panel).toContainText("נסגרו 0 מתוך 4");

    /* עריכת «בפועל» מהכרטיס: 65 → 80; הרשום נשאר 65 */
    await page.getByTestId("night-confirm-pot-edit-actual").click();
    const input = page.getByTestId("night-confirm-pot-edit-input");
    await expect(input).toHaveValue("65");
    await input.fill("80");
    await page.getByTestId("night-confirm-pot-edit-save").click();
    await expect(potRow).toContainText("80₪");
    await expect(potRow).toContainText("רשום: 65₪");
    await expect(page.getByTestId("night-confirm-pot-state")).toHaveText("ממתין");

    /* סימון כל שורות השחקנים והקופה מהכרטיס — עד מונה מלא */
    await page.getByTestId("night-confirm-toggle-0").check();
    await page.getByTestId("night-confirm-toggle-1").check();
    await page.getByTestId("night-confirm-toggle-2").check();
    await page.getByTestId("night-confirm-pot-toggle").check();
    await expect(page.getByTestId("night-confirm-pot-state")).toHaveText(/הופקד/);
    await expect(panel).toContainText("נסגרו 4 מתוך 4");

    /* ביטול סימון הקופה מוריד את המונה; סימון חוזר מחזיר אותו */
    await page.getByTestId("night-confirm-pot-toggle").uncheck();
    await expect(page.getByTestId("night-confirm-pot-state")).toHaveText("ממתין");
    await expect(panel).toContainText("נסגרו 3 מתוך 4");
    await page.getByTestId("night-confirm-pot-toggle").check();
    await expect(panel).toContainText("נסגרו 4 מתוך 4");

    /* ביטול סימון של שורת שחקן מחזיר אותה ל«ממתין» */
    await page.getByTestId("night-confirm-toggle-0").uncheck();
    await expect(page.getByTestId("night-confirm-state-0")).toHaveText("ממתין");
    await expect(panel).toContainText("נסגרו 3 מתוך 4");

    /* כפתור «ערוך חלוקה» בתוך המקטע פותח את עורך החלוקה הקיים */
    await page.getByTestId("night-confirm-edit-settlement").click();
    await expect(page.getByRole("dialog", { name: "חלוקת תשלומים" })).toBeVisible();
    await page.reload();
    await page.getByTestId("tab-sessions").click();

    /* הסימונים והבפועל שרדו טעינה מחדש */
    const panelAfter = page.getByTestId("latest-night-confirmations");
    await expect(panelAfter).toContainText("נסגרו 3 מתוך 4");
    await expect(page.getByTestId("night-confirm-pot-state")).toHaveText(/הופקד/);
    await expect(page.getByTestId("night-confirm-pot-row")).toContainText("80₪");
  });

  test("העברה מסומנת נעולה לעריכה בעורך — ואחרי ביטול הסימון העריכה עוברת (החלטה 4)", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
    await seedNight(page);

    /* מסמנים מהכרטיס את ההעברה עדן גיל ← אופיר סנה 135
       (ב־preview אין שם צופה מזוהה, אז הסימון בלי ייחוס — הצ'יפ «נסגר») */
    await page.getByTestId("night-confirm-toggle-0").check();
    await expect(page.getByTestId("night-confirm-state-0")).toHaveText("נסגר");

    const editor = page.getByRole("dialog", { name: "חלוקת תשלומים" });
    await page.getByTestId("night-confirm-edit-settlement").click();
    await expect(editor).toBeVisible();
    await expect(page.getByTestId("settlement-edit-notice")).toContainText("נעולה לעריכה");

    /* ניסיון לרשום ידנית סכום אחר לאותה העברה — נחסם עם הודעה ברורה */
    await editor.getByRole("button", { name: /עדן גיל/ }).click();
    await editor.getByLabel("בחירת מקבל").selectOption("אופיר סנה");
    await editor.getByLabel("סכום העברה").fill("100");
    await editor.getByRole("button", { name: "רשום העברה" }).click();
    await expect(editor.getByRole("alert")).toContainText("אי אפשר לשמור את החלוקה");
    await expect(editor.getByRole("alert")).toContainText("עדן גיל אל אופיר סנה · 135₪");
    await expect(editor.getByText("נרשם ידנית")).toHaveCount(0);
    await page.getByTestId("settlement-close").click();

    /* מבטלים את הסימון מהכרטיס — אותה עריכה בדיוק עוברת */
    await page.getByTestId("night-confirm-toggle-0").uncheck();
    await expect(page.getByTestId("night-confirm-state-0")).toHaveText("ממתין");
    await page.getByTestId("night-confirm-edit-settlement").click();
    await expect(editor).toBeVisible();
    await editor.getByRole("button", { name: /עדן גיל/ }).click();
    await editor.getByLabel("בחירת מקבל").selectOption("אופיר סנה");
    await editor.getByLabel("סכום העברה").fill("100");
    await editor.getByRole("button", { name: "רשום העברה" }).click();
    await expect(editor.getByText("נרשם ידנית")).toBeVisible();
    await expect(editor.getByText("עדן גיל → אופיר סנה · 100₪")).toBeVisible();
    await expect(editor.getByRole("alert")).toHaveCount(0);
  });
});
