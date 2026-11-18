import { test, expect } from "@playwright/test";
import { resetPreview, openLive, addPlayer, setCashout } from "./helpers.js";

/**
 * הוספת טיפ ידנית בלייב — גיבוי כשהבוט בוואטסאפ נפל.
 * נתוני טסט בלבד בסביבת preview; ההוספה הידנית לא שולחת שום בקשת /api/send,
 * וכל האירועים נשמרים בנתיב מצב־הלייב הרגיל (poker:preview:poker:live).
 *
 * מדיניות 11.11 (עדן): טיפ הוא רישום בלבד — הוספת טיפ לא משנה את היציאה
 * בשום מצב, ומחיקת טיפ חדש היא ישירה, בלי אישור. אישור «להחזיר ליציאה»
 * קיים רק לאירועי מורשת מהמשטר הישן (אירוע עם fromCashout), שבהם ההוספה
 * כן הורידה מהיציאה בזמנו ומחיקה עם החזר משחזרת אותה.
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

  test("הוספה מעדכנת תווית בלי לגעת ביציאה, רענון שומר, מחיקה ישירה בלי אישור", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "טיפמן");
    await setCashout(page, "טיפמן", 500);

    // כפתור ההוספה נראה תמיד — גם כשעוד אין שום טיפ
    await expect(page.getByTestId("live-tip-open-טיפמן")).toBeVisible();
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveCount(0);

    // הוספה מהירה של 30 — רישום בלבד: התווית מתעדכנת, היציאה נשארת 500
    await page.getByTestId("live-tip-open-טיפמן").click();
    await page.getByTestId("live-tip-quick-30").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveText("טיפ 30");
    await expect(page.getByTestId("live-cashout-טיפמן")).toHaveValue("500");

    // הוספה חופשית של 20 — עדיין בלי שום שינוי ביציאה
    await page.getByTestId("live-tip-open-טיפמן").click();
    await page.getByTestId("live-tip-input").fill("20");
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveText("טיפ 50");
    await expect(page.getByTestId("live-cashout-טיפמן")).toHaveValue("500");

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
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveText("טיפ 50");
    await expect(page.getByTestId("live-cashout-טיפמן")).toHaveValue("500");

    // רשימת האירועים: מחיקת ה־20 היא ישירה — טיפ חדש לא ירד מהיציאה,
    // ולכן לא נפתח אישור «להחזיר ליציאה» והאירוע נמחק בלחיצה אחת
    await page.getByTestId("live-tip-label-טיפמן").click();
    const ev20 = saved.tips.find((t) => t.amount === 20);
    await page.getByTestId(`live-tip-del-${ev20.id}`).click();
    await expect(page.getByTestId(`live-tip-del-confirm-${ev20.id}`)).toHaveCount(0);
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveText("טיפ 30");
    await expect(page.getByTestId("live-cashout-טיפמן")).toHaveValue("500");
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(1);

    // מחיקת האחרון — גם היא ישירה; התווית נעלמת והיציאה נשארת 500
    const ev30 = saved.tips.find((t) => t.amount === 30);
    await page.getByTestId(`live-tip-del-${ev30.id}`).click();
    await expect(page.getByTestId("live-tip-label-טיפמן")).toHaveCount(0);
    await expect(page.getByTestId("live-cashout-טיפמן")).toHaveValue("500");
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(0);
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

    // טיפ ידני נוסף מצטבר על אותו יומן — רישום בלבד, היציאה נשארת 300
    await page.getByTestId("live-tip-open-בוטמן").click();
    await page.getByTestId("live-tip-quick-10").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-בוטמן")).toHaveText("טיפ 50");
    await expect(page.getByTestId("live-cashout-בוטמן")).toHaveValue("300");
    // עכשיו יש בדיוק כפתור מחיקה אחד — של האירוע הידני
    await expect(page.locator('[data-testid^="live-tip-del-"]')).toHaveCount(1);
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(2);
  });

  test("הערב הנשמר נושא את ה־tipsGiven ואת יומן הטיפים", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "סוגר");

    // טיפ לפני שהוזנה יציאה — רק מצטבר (רישום בלבד, כמו אחרי יציאה)
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

  test("ביטול מכסה הוספת טיפ — האירוע נעלם והיציאה לא זזה", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "מבטל");
    await setCashout(page, "מבטל", 500);

    await page.getByTestId("live-tip-open-מבטל").click();
    await page.getByTestId("live-tip-quick-30").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-tip-label-מבטל")).toHaveText("טיפ 30");
    await expect(page.getByTestId("live-cashout-מבטל")).toHaveValue("500");

    // כפתור הביטול גלוי ומכסה את הוספת הטיפ — בלי לגעת ביציאה
    await expect(page.getByTestId("live-undo")).toBeVisible();
    await page.getByTestId("live-undo").click();
    await expect(page.getByTestId("live-tip-label-מבטל")).toHaveCount(0);
    await expect(page.getByTestId("live-cashout-מבטל")).toHaveValue("500");
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(0);
  });

  test("ביטול מכסה גם מחיקת טיפ — האירוע חוזר והיציאה לא זזה", async ({ page }) => {
    await openLive(page);
    await addPlayer(page, "מבטלמחיקה");
    await setCashout(page, "מבטלמחיקה", 500);

    await page.getByTestId("live-tip-open-מבטלמחיקה").click();
    await page.getByTestId("live-tip-quick-30").click();
    await page.getByTestId("live-tip-confirm").click();
    await expect(page.getByTestId("live-cashout-מבטלמחיקה")).toHaveValue("500");

    // מחיקה ישירה (טיפ חדש) — האירוע נעלם, היציאה נשארת 500
    await page.getByTestId("live-tip-label-מבטלמחיקה").click();
    const saved = await readLive(page);
    const ev = saved.tips.find((t) => t.amount === 30);
    await page.getByTestId(`live-tip-del-${ev.id}`).click();
    await expect(page.getByTestId("live-tip-label-מבטלמחיקה")).toHaveCount(0);
    await expect(page.getByTestId("live-cashout-מבטלמחיקה")).toHaveValue("500");
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(0);

    // ביטול מחזיר את האירוע ליומן — היציאה עדיין 500 (לא ירד ממנה כלום)
    await page.getByTestId("live-undo").click();
    await expect(page.getByTestId("live-tip-label-מבטלמחיקה")).toHaveText("טיפ 30");
    await expect(page.getByTestId("live-cashout-מבטלמחיקה")).toHaveValue("500");
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(1);
  });

  test("מחיקת טיפ מורשת שירד מהיציאה דורשת אישור — שני המסלולים", async ({ page }) => {
    // מדמים ערב מהמשטר הישן: שני טיפים ידניים שכן ירדו מהיציאה בזמנו
    // (fromCashout) — יציאה מקורית 500, אחרי 30+20 היציאה 450.
    await page.evaluate((k) => {
      const live = {
        players: [{ name: "מאשר", buyin: 250, cashout: "450", tipsGiven: 50 }],
        tips: [
          { id: "app_legacy_1", name: "מאשר", amount: 30, at: Date.now() - 120000, src: "app", fromCashout: true, cashDelta: 30 },
          { id: "app_legacy_2", name: "מאשר", amount: 20, at: Date.now() - 60000, src: "app", fromCashout: true, cashDelta: 20 },
        ],
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

    await expect(page.getByTestId("live-tip-label-מאשר")).toHaveText("טיפ 50");
    await expect(page.getByTestId("live-cashout-מאשר")).toHaveValue("450");

    // לחיצה על מחיקת אירוע מורשת פותחת אישור בשורה — שום דבר עוד לא נמחק
    await page.getByTestId("live-tip-label-מאשר").click();
    await page.getByTestId("live-tip-del-app_legacy_1").click();
    await expect(page.getByTestId("live-tip-del-confirm-app_legacy_1")).toContainText("להחזיר 30 ליציאה");
    await page.screenshot({ path: "test-results/manual-tip-confirm.png" });
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(2);

    // «השאר את היציאה» — האירוע נמחק, היציאה נשארת 450
    await page.getByTestId("live-tip-del-no-app_legacy_1").click();
    await expect(page.getByTestId("live-tip-label-מאשר")).toHaveText("טיפ 20");
    await expect(page.getByTestId("live-cashout-מאשר")).toHaveValue("450");
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(1);

    // מסלול שני — «החזר ליציאה»: האירוע נמחק והיציאה חוזרת ב־20
    await page.getByTestId("live-tip-del-app_legacy_2").click();
    await expect(page.getByTestId("live-tip-del-confirm-app_legacy_2")).toContainText("להחזיר 20 ליציאה");
    await page.getByTestId("live-tip-del-yes-app_legacy_2").click();
    await expect(page.getByTestId("live-tip-label-מאשר")).toHaveCount(0);
    await expect(page.getByTestId("live-cashout-מאשר")).toHaveValue("470");
    await expect.poll(async () => (await readLive(page))?.tips?.length ?? 0).toBe(0);
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
