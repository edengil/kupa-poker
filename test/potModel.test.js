/* מודל הקופה — הכרעות עדן 25.10.2026:
   - הקופה = ה־5% הרשום (session.savingsPot), תמיד מלאה, לעולם לא נגזרת מפער הערב.
   - "בפועל" (savingsPotActual) ניתן לעריכה, ברירת מחדל = הרשום; יתרת המזומן הראשית = בפועל.
   - חוסר מימון מתחלק בין הזוכים יחסית לרווחים, בשקלים שלמים — לעולם לא מהקופה.
   - הקופה היא חובת הפקדה של עדן: כשהוא חייב, 93₪ מתשלומיו הולכים לקופה והשאר לזוכים.
   - הנטו הגולמי של עדן לא משתנה. עודף מעבר לקופה: בהכרעת 25.10 נרשם בכיור
     "עודף ערב"; הכרעת עדן 19.11.2026 החליפה זאת — העודף מזוכה לעדן על שמו
     בחלוקה (שאריתו שלו נספגת, שאריות אחרים הן העברות residual אליו).
   - חלוקות ידניות ישנות (basis בסגנון playersWithPot) נשמרות כ־legacy בדיוק כמות שהן. */
import { describe, it, expect } from "vitest";
import { paymentPlan, potOverview } from "../lib/paymentTracking.js";
import {
  resolveSettlement,
  settlementTextForSession,
  potRecordedFor,
  potActualFor,
  nightGap,
  POT_SINK_NAME,
  RESIDUAL_SINK_NAME,
} from "../lib/nightShare.js";
import { settlementBasis } from "../lib/savedSettlement.js";
import { playersFromSession } from "../lib/nightShare.js";

// ערב 24.10.2026 האמיתי: קניות 1,850 (5% = 93), סכום נטו −35 (עודף 35)
const NIGHT_2410 = {
  id: "live_1792879962020",
  iso: "2026-10-24",
  cps: 2,
  savings5: true,
  savingsPot: 93,
  entries: [
    { name: "עדן גיל", buyin: 550, chips: 40 },
    { name: "אורן גיל", buyin: 100, chips: 840 },
    { name: "קובי סעדה", buyin: 400, chips: 0 },
    { name: "ירין מלאך", buyin: 150, chips: 300 },
    { name: "דן ינקלויץ", buyin: 150, chips: 500 },
    { name: "נתנאל כהן", buyin: 150, chips: 0 },
    { name: "דור לירז", buyin: 100, chips: 420 },
    { name: "אופיר סנה", buyin: 250, chips: 1530 },
  ],
};

function sums(transfers) {
  const got = Object.create(null);
  const gave = Object.create(null);
  for (const t of transfers) {
    if (t.fromSplit) {
      for (const [n, a] of Object.entries(t.fromSplit)) gave[n] = (gave[n] || 0) + a;
    } else {
      gave[t.from] = (gave[t.from] || 0) + t.amount;
    }
    got[t.to] = (got[t.to] || 0) + t.amount;
  }
  return { got, gave };
}

describe("מודל הקופה (25.10) — ערב 24.10", () => {
  it("רשום/בפועל/פער הם שלושה מספרים נפרדים", () => {
    expect(potRecordedFor(NIGHT_2410)).toBe(93);
    expect(potActualFor(NIGHT_2410)).toBe(93); // ברירת מחדל = רשום
    expect(potActualFor({ ...NIGHT_2410, savingsPotActual: 70 })).toBe(70);
    expect(nightGap(NIGHT_2410)).toBe(-35); // הפער אינו הקופה
  });

  it("אוטומטי: חוסר 58 + שבר קופה 2 נחתכים בחמישיות מהזוכים; רגל הקופה 90 (§8); עדן משלם 525", () => {
    const plan = paymentPlan(NIGHT_2410);
    expect(plan.problems).toEqual([]);
    // החשבונאות המלאה (כולל כיורים) היא של ה־resolver; paymentPlan מחזיק רק העברות שחקנים
    const allTransfers = resolveSettlement(NIGHT_2410).transfers;
    const { got, gave } = sums(allTransfers);
    // עיגול לחמישיות (19.11, שלב 2): כל הנטו כאן כבר כפולות־5. הקיצוץ
    // הכולל הוא 60 = חוסר אמיתי 58 + שבר 2 של מימון הקופה (עדן מממן
    // 93 מתוך חוב 530 → סך בין־אנשים 437, מעוגל ל־435). החלוקה יחסית
    // בחמישיות: אופיר 35, אורן 15 (חלקה המדויק בחוסר האמיתי 58 הוא
    // 17.76, מעוגל למטה לחמישייה — מועדפים נחתכים רק מול החוסר
    // האמיתי ולעולם לא סופגים מהשבר), דור 5, דן 5; היתרה על הרגילים.
    expect(got["אופיר סנה"]).toBe(480);
    expect(got["אורן גיל"]).toBe(305);
    expect(got["דור לירז"]).toBe(105);
    expect(got["דן ינקלויץ"]).toBe(95);
    /* §8.9: רגל הקופה בתוכנית = floor5(93) = 90; ההפרש 3 הוא עודף שיורי
       נסתר לעדן (בפנקס עדיין נרשמים 93 מלאים — potRecordedFor למעלה). */
    expect(got[POT_SINK_NAME]).toBe(90);
    expect(gave["עדן גיל"]).toBe(525); // 435 בין־אנשים + 90 לקופה (הגולמי 530)
    expect(gave["קובי סעדה"]).toBe(400);
    expect(gave["נתנאל כהן"]).toBe(150);
    // חובת ההפקדה של עדן: שורת קופה אחת של 90 ממנו
    const potFromEden = allTransfers.filter((t) => t.to === POT_SINK_NAME);
    expect(potFromEden).toHaveLength(1);
    expect(potFromEden[0].from).toBe("עדן גיל");
    expect(potFromEden[0].amount).toBe(90);
  });

  it("החלוקה הידנית של עדן לערב זה (35/13/10) נצרכת עם עיגול §8.5 של המפה (13←15, ההפרש לעדן)", () => {
    const basis = settlementBasis(playersFromSession(NIGHT_2410), 2);
    const session = {
      ...NIGHT_2410,
      savingsPotActual: 70,
      manualSettlement: {
        basis,
        manualPayments: [],
        shortfall: { "אופיר סנה": 35, "אורן גיל": 13, "דור לירז": 10 },
        settlementVersion: 2,
        settlementUpdatedAt: "2026-10-24T22:45:00.000Z",
      },
    };
    const plan = paymentPlan(session);
    expect(plan.problems).toEqual([]);
    const allTransfers = resolveSettlement(session).transfers;
    const { got, gave } = sums(allTransfers);
    expect(got["אופיר סנה"]).toBe(480);
    /* סבב תיקון (§8.5, ממצא בודק 1): המפה השמורה (35/13/10) נצרכת עם
       עיגול־למעלה של כל ערך — 13←15, וההפרש מזוכה לעדן. אורן: 320
       גולמי − 15 מהמפה המעוגלת = 305, כבר כפולת־5 במדויק. (הציפייה
       הקודמת, 310, שיקפה את הבאג: המפה נצרכה כמות שהיא ואורן למעשה
       התעגלה למטה.) */
    expect(got["אורן גיל"]).toBe(305);
    expect(got["דור לירז"]).toBe(100);
    expect(got["דן ינקלויץ"]).toBe(100);
    // R3: עם savingsPotActual=70 — ההעברה לקופה בתוכנית היא הבפועל, לא הרשום
    expect(got[POT_SINK_NAME]).toBe(70);
    // הכרעת 19.11: ה־23 (הפרש רשום־בפועל) הם שארית של עדן עצמו — נספגים
    // כזיכוי על שמו, לא שורת העברה. עם עיגול §8.5 של המפה (13←15) עדן
    // משלם 505 = 435 + 70 לקופה, והצפוי שלו −505 (הגולמי −530 נשמר
    // ב־raw/בסטטיסטיקה).
    expect(gave["עדן גיל"]).toBe(505);
    expect(
      resolveSettlement(session).expected.find((e) => e.name === "עדן גיל").net
    ).toBe(-505);
    expect(gave["קובי סעדה"]).toBe(400);
    expect(gave["נתנאל כהן"]).toBe(150);
    const edenToPot = allTransfers
      .filter((t) => t.from === "עדן גיל" && t.to === POT_SINK_NAME)
      .reduce((s, t) => s + t.amount, 0);
    expect(edenToPot).toBe(70);
    // הטקסט הציבורי לקבוצה לא חושף את הקופה
    const text = settlementTextForSession(session, { manager: true });
    expect(text).not.toContain("קופת חיסכון");
    expect(text).not.toContain("93");
  });

  it("עודף מעבר לקופה מזוכה לעדן (הכרעת 19.11) — זוכים וקופה מלאים", () => {
    const session = {
      iso: "2026-10-24",
      cps: 1,
      savings5: true,
      savingsPot: 93,
      entries: [
        { name: "עדן גיל", amount: -400 },
        { name: "דן ינקלויץ", amount: 250 },
      ],
    };
    const plan = paymentPlan(session);
    expect(plan.problems).toEqual([]);
    const resolved = resolveSettlement(session);
    const { got, gave } = sums(resolved.transfers);
    expect(got["דן ינקלויץ"]).toBe(250);
    /* §8.9: רגל הקופה = floor5(93) = 90; שבר הקופה 3 מצטרף לעודף של עדן. */
    expect(got[POT_SINK_NAME]).toBe(90);
    // 150 עודף − 93 קופה = 57 עודף, ועוד 3 שבר־קופה — 60 שארית של עדן,
    // נספגת: אין שורת כיור ואין שורת residual, והוא משלם 340 בלבד
    // בהעברות (250 לדן + 90 לקופה). הצפוי שלו −340; הגולמי −400 נשמר
    // בשדה raw.
    expect(got[RESIDUAL_SINK_NAME]).toBeUndefined();
    expect(resolved.transfers.filter((t) => t.residual)).toEqual([]);
    expect(gave["עדן גיל"]).toBe(340);
    const edenExpected = resolved.expected.find((e) => e.name === "עדן גיל");
    expect(edenExpected.net).toBe(-340);
    expect(edenExpected.raw).toBe(-400);
    expect(resolved.expected.some((e) => e.name === RESIDUAL_SINK_NAME)).toBe(false);
  });

  it("potOverview על הפנקס המתוקן: רשום 163, בפועל 140, יתרות 133/110", () => {
    const night1010 = {
      id: "live_1791669733765",
      iso: "2026-10-10",
      savingsPot: 70,
      savingsPotActual: 70,
      entries: [{ name: "עדן גיל", amount: -70 }],
    };
    const night2410 = { ...NIGHT_2410, savingsPotActual: 70 };
    const o = potOverview({
      sessions: [night1010, night2410],
      savingsWithdrawals: [{ amount: 30, reason: "מפת פוקר ירוקה", at: "2026-10-10T22:08:48.735Z" }],
      savingsPot: 163,
    });
    expect(o.totalRecorded).toBe(163);
    expect(o.totalActual).toBe(140);
    expect(o.balanceRecorded).toBe(133);
    expect(o.balance).toBe(110); // הראשית = בפועל
  });
});

describe("מודל הקופה — legacy נשמר", () => {
  it("חלוקה ידנית ישנה (basis של playersWithPot) מזוהה כ־legacy ולא משתנה", () => {
    // ערב 10.10 האמיתי (רשומות סכום בלבד) עם החלוקה הידנית המקורית
    const session = {
      id: "live_1791669733765",
      iso: "2026-10-10",
      entries: [
        { name: "דן ינקלויץ", amount: 530 },
        { name: "אופיר סנה", amount: 260 },
        { name: "קובי סעדה", amount: 210 },
        { name: "אורן גיל", amount: -120 },
        { name: "איציק תפילין", amount: -175 },
        { name: "נתנאל כהן", amount: -200 },
        { name: "עדן גיל", amount: -280 },
        { name: "דור לירז", amount: -300 },
      ],
      manualSettlement: {
        basis: '[1,[{"name":"דן ינקלויץ","buyin":0,"cashout":"530"},{"name":"אופיר סנה","buyin":0,"cashout":"260"},{"name":"קובי סעדה","buyin":0,"cashout":"210"},{"name":"אורן גיל","buyin":120,"cashout":"0"},{"name":"איציק תפילין","buyin":175,"cashout":"0"},{"name":"נתנאל כהן","buyin":200,"cashout":"0"},{"name":"עדן גיל","buyin":205,"cashout":"0"},{"name":"דור לירז","buyin":300,"cashout":"0"}]]',
        manualPayments: [
          { from: "עדן גיל ואורן גיל", to: "דן ינקלויץ", amount: 230, joint: true, fromSplit: { "עדן גיל": 153, "אורן גיל": 77 } },
          { from: "עדן גיל ואורן גיל", to: "קובי סעדה", amount: 10, joint: true, fromSplit: { "עדן גיל": 7, "אורן גיל": 3 } },
          { from: "עדן גיל ואורן גיל", to: "אופיר סנה", amount: 80, joint: true, fromSplit: { "עדן גיל": 53, "אורן גיל": 27 } },
          { from: "נתנאל כהן", to: "קובי סעדה", amount: 200 },
          { from: "דור לירז", to: "דן ינקלויץ", amount: 300 },
          { from: "איציק תפילין", to: "אופיר סנה", amount: 175 },
        ],
        settlementVersion: 2,
        settlementUpdatedAt: "2026-10-10T20:37:00.000Z",
      },
    };
    const r = resolveSettlement(session);
    expect(r.mode).toBe("legacy");
    const plan = paymentPlan(session);
    // גל 2א, ממצא 3: ההעברות עצמן לא משתנות — כל הידניים נופלים גם בקוד
    // החדש, בדיוק כמו פעם (התשלומים המשותפים חורגים מחוב הבסיס של עדן:
    // פיצולים של 213 מול חוב 205). מה שהשתנה: ה־catch הריק הוחלף בדגל
    // מפורש, והחלוקה כבר לא מוצגת למנהל כ"נקייה".
    expect(plan.transfers.every((t) => !t.manual)).toBe(true);
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]).toContain("החלוקה הידנית לא נטענה");
  });
});
