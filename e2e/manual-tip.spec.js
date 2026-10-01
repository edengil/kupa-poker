import { test, expect } from "@playwright/test";
import { resetPreview, openLive, addPlayer, setCashout } from "./helpers.js";

/**
 * הוספת טיפ ידנית בלייב — גיבוי כשהבוט בוואטסאפ נפל.
 * נתוני טסט בלבד בסביבת preview; ההוספה הידנית לא שולחת שום בקשת /api/send,
 * וכל האירועים נשמרים בנתיב מצב־הלייב הרגיל (poker:preview:poker:live).
 */

const LIVE_LS = "poker:preview:poker:live";
const DB_LS = "poker:preview:poker:db";

async function readLive(page) {
  const raw = await page.evaluate((k) => localStorage.getItem(k), LIVE_LS);
  return raw ? JSON.parse(raw) : null;
}

test.describe("טיפ ידני בלייב (גיבוי לנפילת הבוט)", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await resetPreview(page);
  });

  test("הוספה מעדכנת תווית ומורידה מהיציאה, רענון שומר, מחיקה מחזירה", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "טיפמן");
    await setCashout(page, "טיפמן", 500);

    // כפתור ההוספה נראה תמיד — גם כשעוד אין שום טיפ
    await expect(page.getByTestId("live-tip-open-טיפמן")).toBeVisible();
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveCount(0);

    // הוספה מהירה של 50 — היציאה כבר מספרית, הטיפ יורד ממנה כמו אצל הבוט
    await page.getByTestId("live-tip-open-טיפמן").click();
    await page.getByTestId("live-tip-quick-50").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveText("טיפ 50");
    await expect(page.getByTestId("live-cashout-טיפמן")).toHaveValue("450");

    // הוספה חופשית של 30
    await page.getByTestId("live-tip-open-טיפמן").click();
    await page.getByTestId("live-tip-input").fill("30");
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveText("טיפ 80");
    await expect(page.getByTestId("live-cashout-טיפמן")).toHaveValue("420");

    // האירועים נשמרו בנתיב מצב־הלייב עם מקור app ומזהים ייחודיים
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(2);
    const saved = await readLive(page);
    expect(saved.tips.every((t) => t.src === "app")).toBe(true);
    expect(new Set(saved.tips.map((t) => t.id)).size).toBe(2);

    await page.screenshot({ path: "test-results/manual-tip-row.png" });

    // רענון באמצע הערב — הכול נשמר
    await page.reload();
    await page.getByTestId("preview-banner").waitFor({ state: "visible" });
    await openLive(page);
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveText("טיפ 80");
    await expect(page.getByTestId("live-cashout-טיפמן")).toHaveValue("420");

    // רשימת האירועים: מחיקת ה־30 — הטיפ ירד מהיציאה, נפתח אישור בשורה
    await page.getByTestId("live-tip-label-טיפמן").click();
    const ev30 = saved.tips.find((t) => t.amount === 30);
    await page.getByTestId(`live-tip-del-${ev30.id}`).click();
    await expect(page.getByTestId(`live-tip-del-confirm-${ev30.id}`)).toContainText("להחזיר 30 ליציאה");
    await page.getByTestId(`live-tip-del-yes-${ev30.id}`).click();
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveText("טיפ 50");
    await expect(page.getByTestId("live-cashout-טיפמן")).toHaveValue("450");

    // מחיקת האחרון — התווית נעלמת והיציאה חוזרת ל־500
    const ev50 = saved.tips.find((t) => t.amount === 50);
    await page.getByTestId(`live-tip-del-${ev50.id}`).click();
    await page.getByTestId(`live-tip-del-yes-${ev50.id}`).click();
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveCount(0);
    await expect(page.getByTestId("live-cashout-טיפמן")).toHaveValue("500");
  });

  test("סכום ריק או 0 חסום", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "אפס");
    await page.getByTestId("live-tip-open-אפס").click();
    await expect(page.getByTestId("live-tip-confirm")).toBeDisabled();
    await page.getByTestId("live-tip-input").fill("0");
    await expect(page.getByTestId("live-tip-confirm")).toBeDisabled();
    await page.getByTestId("live-tip-cancel").click();
    await expect(page.getByTestId("live-tip-input")).toHaveCount(0);
    await expect(page.getByTestId("live-tip-label-אפס")).toHaveCount(0);
  });

  test("אירוע בוט הוא קריאה בלבד וטיפ ידני מצטבר עליו בלי כפילות", async ({ page }) => {
    // מדמים ערב שבו הבוט כבר רשם טיפ אחד לפני שנפל
    await page.evaluate((k) => {
      const live = {
        players: [{ name: "בוטמן", buyin: 50, cashout: "300", tipsGiven: 40 }],
        tips: [{ id: "wamid_test_1", name: "בוטמן", amount: 40, at: Date.now() - 60000 }],
        entriesCount: "",
        addAmt: 50,
        startedAt: Date.now() - 3600000,
        coupleFills: [],
        actionLog: [],
        handOfNight: "",
        liveAnnounced: [],
        planSnap: null,
        cps: 2,
      };
      localStorage.setItem(k, JSON.stringify(live));
    }, LIVE_LS);
    await page.reload();
    await page.getByTestId("preview-banner").waitFor({ state: "visible" });
    await openLive(page);

    await expect(page.getByTestId("live-tip-label-בוטמן")).toHaveText("טיפ 40");
    await page.getByTestId("live-tip-label-בוטמן").click();
    await expect(page.getByText("מהבוט")).toBeVisible();
    // לאירוע הבוט אין כפתור מחיקה
    await expect(page.locator('[data-testid^="live-tip-del-"]')).toHaveCount(0);

    // טיפ ידני נוסף מצטבר על אותו יומן ומוריד מהיציאה
    await page.getByTestId("live-tip-open-בוטמן").click();
    await page.getByTestId("live-tip-quick-10").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-בוטמן")).toHaveText("טיפ 50");
    await expect(page.getByTestId("live-cashout-בוטמן")).toHaveValue("290");
    // עכשיו יש בדיוק כפתור מחיקה אחד — של האירוע הידני
    await expect(page.locator('[data-testid^="live-tip-del-"]')).toHaveCount(1);
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(2);
  });

  test("הערב הנשמר נושא את ה־tipsGiven ואת יומן הטיפים", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "סוגר");

    // טיפ לפני שהוזנה יציאה — לא מוריד כלום, רק מצטבר
    await page.getByTestId("live-tip-open-סוגר").click();
    await page.getByTestId("live-tip-quick-20").click();
    await page.getByTestId("live-tip-input").fill("5");
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-סוגר")).toHaveText("טיפ 5");
    await page.getByTestId("live-tip-open-סוגר").click();
    await page.getByTestId("live-tip-quick-20").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-סוגר")).toHaveText("טיפ 25");

    /* קנייה 50₪ · cps=2 · קופה 100 ג' · יציאה 100 = נטו 0, ערב מאוזן */
    await setCashout(page, "סוגר", 100);
    await expect(page.getByTestId("live-cashout-סוגר")).toHaveValue("100");

    const finish = page.getByTestId("live-finish");
    await expect(finish).toBeEnabled();
    await finish.click();
    await expect(page.getByTestId("live-settlement-builder")).toBeVisible();
    await page.getByTestId("settlement-close").click();

    const db = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_LS);
    const sess = db.sessions.find((s) => (s.entries || []).some((e) => e.name === "סוגר"));
    expect(sess).toBeTruthy();
    expect(sess.entries.find((e) => e.name === "סוגר").tipsGiven).toBe(25);
    expect(sess.tips).toEqual([
      expect.objectContaining({ name: "סוגר", amount: 5 }),
      expect.objectContaining({ name: "סוגר", amount: 20 }),
    ]);
  });

  test("ביטול מכסה הוספת טיפ — האירוע נעלם והיציאה חוזרת", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "מבטל");
    await setCashout(page, "מבטל", 500);

    await page.getByTestId("live-tip-open-מבטל").click();
    await page.getByTestId("live-tip-quick-50").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-מבטל")).toHaveText("טיפ 50");
    await expect(page.getByTestId("live-cashout-מבטל")).toHaveValue("450");

    // כפתור הביטול גלוי ומכסה את הוספת הטיפ
    await expect(page.getByTestId("live-undo")).toBeVisible();
    await page.getByTestId("live-undo").click();
    await expect(page.getByTestId("live-tip-label-מבטל")).toHaveCount(0);
    await expect(page.getByTestId("live-cashout-מבטל")).toHaveValue("500");
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(0);
  });

  test("ביטול מכסה גם מחיקת טיפ — האירוע חוזר והיציאה יורדת שוב", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "מבטלמחיקה");
    await setCashout(page, "מבטלמחיקה", 500);

    await page.getByTestId("live-tip-open-מבטלמחיקה").click();
    await page.getByTestId("live-tip-quick-50").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-cashout-מבטלמחיקה")).toHaveValue("450");

    await page.getByTestId("live-tip-label-מבטלמחיקה").click();
    const saved = await readLive(page);
    const ev = saved.tips.find((t) => t.amount === 50);
    await page.getByTestId(`live-tip-del-${ev.id}`).click();
    await page.getByTestId(`live-tip-del-yes-${ev.id}`).click();
    await expect(page.getByTestId("live-cashout-מבטלמחיקה")).toHaveValue("500");

    // ביטול מחזיר את האירוע ליומן ומוריד שוב מהיציאה
    await page.getByTestId("live-undo").click();
    await expect(page.getByTestId("live-tip-label-מבטלמחיקה")).toHaveText("טיפ 50");
    await expect(page.getByTestId("live-cashout-מבטלמחיקה")).toHaveValue("450");
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(1);
  });

  test("מחיקת טיפ שירד מהיציאה דורשת אישור — שני המסלולים", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "מאשר");
    await setCashout(page, "מאשר", 500);

    await page.getByTestId("live-tip-open-מאשר").click();
    await page.getByTestId("live-tip-quick-50").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-cashout-מאשר")).toHaveValue("450");

    // לחיצה על מחיקה פותחת אישור בשורה — שום דבר עוד לא נמחק
    await page.getByTestId("live-tip-label-מאשר").click();
    let saved = await readLive(page);
    const ev = saved.tips.find((t) => t.amount === 50);
    await page.getByTestId(`live-tip-del-${ev.id}`).click();
    await expect(page.getByTestId(`live-tip-del-confirm-${ev.id}`)).toContainText("להחזיר 50 ליציאה");
    await page.screenshot({ path: "test-results/manual-tip-confirm.png" });
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(1);

    // «השאר את היציאה» — האירוע נמחק, היציאה נשארת 450
    await page.getByTestId(`live-tip-del-no-${ev.id}`).click();
    await expect(page.getByTestId("live-tip-label-מאשר")).toHaveCount(0);
    await expect(page.getByTestId("live-cashout-מאשר")).toHaveValue("450");
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(0);

    // מסלול שני — «החזר ליציאה»
    await page.getByTestId("live-tip-open-מאשר").click();
    await page.getByTestId("live-tip-quick-20").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-מאשר")).toHaveText("טיפ 20");
    await expect(page.getByTestId("live-cashout-מאשר")).toHaveValue("430");
    saved = await readLive(page);
    const ev2 = saved.tips.find((t) => t.amount === 20);
    await page.getByTestId(`live-tip-del-${ev2.id}`).click();
    await page.getByTestId(`live-tip-del-yes-${ev2.id}`).click();
    await expect(page.getByTestId("live-tip-label-מאשר")).toHaveCount(0);
    await expect(page.getByTestId("live-cashout-מאשר")).toHaveValue("450");
  });

  test("הבוחר מציג סה״כ טיפים עד כה", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "סוכם");
    await page.getByTestId("live-tip-open-סוכם").click();
    await expect(page.getByTestId("live-tip-total-סוכם")).toContainText("טיפים עד כה: 0");
    await page.getByTestId("live-tip-quick-20").click();
    await page.getByTestId("live-tip-confirm").click();
    await page.getByTestId("live-tip-open-סוכם").click();
    await expect(page.getByTestId("live-tip-total-סוכם")).toContainText("טיפים עד כה: 20");
  });
});
