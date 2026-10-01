import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { resetPreview, openLive } from "./helpers.js";

/**
 * גל 7 · תכונה 5 — זימוני אימייל לערב עם אישור מהמייל.
 *
 * מה שרץ באמת בממשק: מילוי אימייל בפרופיל, פתיחת ערב, סטטוס הזימונים
 * בכרטיס התוכנית, ועדכון האישור חזרה בכרטיס. שליחת המייל עצמה יוצאת
 * מהשרת (Supabase + nodemailer) — בסביבת התצוגה אין שרת מחובר, לכן
 * הקריאה ל־/api/email-invite מיורטת בתשובת שרת מדומה, וכתיבת השרת
 * לנתונים (סימון "נשלח" ואישור מהקישור) מדומה בדיוק באותה צורת נתונים
 * שהשרת כותב (markEmailInvites / applyEmailRsvp) — בלי מייל אמיתי לאף אחד.
 * הנתיב הציבורי /api/rsvp-confirm נבדק מול שרת הפיתוח עצמו.
 */

const DB_KEY = "poker:preview:poker:db";

async function readPreviewDb(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, DB_KEY);
}

/** מדמה את כתיבת השרת ל־plan (זימונים/אישורים) וטוען מחדש כמו snapshot טרי. */
async function patchPlanFromServer(page, patch) {
  await page.evaluate(
    ({ key, patch }) => {
      const raw = localStorage.getItem(key);
      const db = raw ? JSON.parse(raw) : {};
      db.plan = { ...(db.plan || {}), ...patch };
      localStorage.setItem(key, JSON.stringify(db));
    },
    { key: DB_KEY, patch }
  );
  await page.reload();
  await page.getByTestId("preview-banner").waitFor({ state: "visible" });
}

async function setEmailViaProfile(page, player, email) {
  await page.getByTestId("tab-players").click();
  await page
    .locator("button", { hasText: player })
    .filter({ hasText: "ערבים" })
    .first()
    .click();
  const input = page.getByLabel("אימייל של השחקן");
  await input.waitFor({ state: "visible" });
  await input.fill(email);
  await page.getByRole("button", { name: "שמור", exact: true }).click();
  await expect(page.getByText("נשמר ✓")).toBeVisible();
  // סוגרים את חלון הפרופיל ברענון — הנתונים נשמרים במטמון המקומי
  await page.reload();
  await page.getByTestId("preview-banner").waitFor({ state: "visible" });
}

test.describe("גל 7 · זימוני אימייל", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await resetPreview(page);
  });

  test("מילוי אימייל בפרופיל שחקן נשמר, נטען שוב, וכתובת פגומה נדחית", async ({ page }) => {
    await page.getByTestId("tab-players").click();
    await page
      .locator("button", { hasText: "עדן גיל" })
      .filter({ hasText: "ערבים" })
      .first()
      .click();

    const input = page.getByLabel("אימייל של השחקן");
    await input.waitFor({ state: "visible" });

    // כתובת לא תקינה — הודעת שגיאה וכפתור השמירה חסום
    await input.fill("not-an-email");
    await expect(page.getByText("הכתובת לא נראית תקינה")).toBeVisible();
    await expect(page.getByRole("button", { name: "שמור", exact: true })).toBeDisabled();

    await setEmailViaProfileDone(page, input);

    const db = await readPreviewDb(page);
    expect(db?.emails?.["עדן גיל"]).toBe("tester@poker.dev");

    // רענון — הכתובת נטענת חזרה מהנתונים השמורים
    await page.reload();
    await page.getByTestId("preview-banner").waitFor({ state: "visible" });
    await page.getByTestId("tab-players").click();
    await page
      .locator("button", { hasText: "עדן גיל" })
      .filter({ hasText: "ערבים" })
      .first()
      .click();
    await expect(page.getByLabel("אימייל של השחקן")).toHaveValue("tester@poker.dev");
  });

  test("פתיחת ערב מבקשת זימונים, והאישור מהמייל מתעדכן בכרטיס התוכנית", async ({ page }) => {
    // שחקן אחד עם אימייל דרך הממשק
    await setEmailViaProfile(page, "עדן גיל", "tester@poker.dev");

    // יירוט שליחת הזימונים — תשובת שרת מדומה, בלי מייל אמיתי
    let inviteBody = null;
    await page.route("**/api/email-invite", async (route) => {
      inviteBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          sent: ["עדן גיל"],
          failed: [],
          alreadyInvited: [],
          missingEmail: ["אורן גיל", "אופיר סנה", "שגיא גיל"],
        }),
      });
    });

    // פתיחת ערב מתוכנן בעוד חמישה ימים
    await openLive(page);
    await page.getByRole("button", { name: /תכנן תאריך/ }).click();
    const futureIso = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await page.locator('input[type="date"]').fill(futureIso);
    await page.getByRole("button", { name: "שמור ושלח הזמנה" }).click();

    // הבקשה יצאה עם תאריך הערב, והכרטיס מדווח על הזימונים
    await expect(page.getByText(/נשלחו 1 זימונים באימייל/)).toBeVisible();
    expect(inviteBody?.planIso).toBe(futureIso);
    await expect(page.getByText(/ל־3 שחקנים אין אימייל שמור/)).toBeVisible();

    // שחקנים בלי אימייל רשומים בכרטיס; מי שיש לו אימייל — לא ברשימה הזאת
    const missingLine = page.getByText(/בלי אימייל שמור:/);
    await expect(missingLine).toBeVisible();
    await expect(missingLine).toContainText("אורן גיל");
    await expect(missingLine).not.toContainText("עדן גיל");

    // השרת סימן "נשלח" לשני שחקנים; אופיר סנה כבר ענה "לא" מהמייל
    await patchPlanFromServer(page, {
      emailInvites: {
        "עדן גיל": { at: Date.now(), email: "tester@poker.dev" },
        "אופיר סנה": { at: Date.now(), email: "ofir@poker.dev" },
      },
      emailRsvps: { "אופיר סנה": { status: "no", at: Date.now() } },
    });
    await openLive(page);
    await expect(page.getByText("עדן גיל · נשלח")).toBeVisible();
    await expect(page.getByText("אופיר סנה · לא מגיע")).toBeVisible();

    // ועכשיו עדן גיל לוחץ "מגיע" בקישור שבמייל — הכרטיס מתעדכן
    await patchPlanFromServer(page, {
      emailRsvps: {
        "אופיר סנה": { status: "no", at: Date.now() },
        "עדן גיל": { status: "yes", at: Date.now() },
      },
    });
    await openLive(page);
    await expect(page.getByText("עדן גיל · מגיע ✅")).toBeVisible();
    await page.screenshot({ path: "test-results/wave7-email-plan-card.png" });
  });

  test("קישור אישור פגום נדחה בעדינות בנתיב הציבורי", async ({ request }) => {
    const res = await request.get("/api/rsvp-confirm?t=garbage-token&a=yes");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("הקישור פג תוקף או שאינו תקין");
  });

  test("שליחת זימונים בלי התחברות נדחית ולא שולחת כלום", async ({ request }) => {
    const res = await request.post("/api/email-invite", {
      data: { planIso: "2026-12-31" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  // טוקן חתום אמיתי: חותמים באותו אלגוריתם של lib/rsvpToken.js.
  // רץ רק כששרת הפיתוח עלה עם RSVP_TOKEN_SECRET של בדיקה — אז האימות
  // עובר והנתיב מגיע לשלב כתיבת המסד (שאין בסביבה הזאת) ונכשל בעדינות.
  test("טוקן חתום תקין עובר אימות ומגיע לשלב הכתיבה", async ({ request }) => {
    const secret = process.env.RSVP_TOKEN_SECRET;
    test.skip(!secret, "אין RSVP_TOKEN_SECRET בסביבת ההרצה");
    const b64url = (buf) =>
      Buffer.from(buf)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const planIso = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const part = b64url(
      JSON.stringify({
        g: "e2e-test-group",
        n: "שחקן טסט",
        p: planIso,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      })
    );
    const sig = b64url(
      createHmac("sha256", `kupa-rsvp-v1:${secret}`).update(part).digest()
    );
    const res = await request.get(
      `/api/rsvp-confirm?t=${encodeURIComponent(`${part}.${sig}`)}&a=yes`
    );
    expect(res.status()).toBe(200);
    const body = await res.text();
    // לא נדחה כטוקן פגום — הגיע לשלב חיפוש הקבוצה/כתיבה
    expect(body).not.toContain("הקישור פג תוקף");
    expect(body).toContain("משהו לא הסתדר");
  });
});

async function setEmailViaProfileDone(page, input) {
  await input.fill("tester@poker.dev");
  await page.getByRole("button", { name: "שמור", exact: true }).click();
  await expect(page.getByText("נשמר ✓")).toBeVisible();
}
