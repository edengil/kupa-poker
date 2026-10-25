/* מודל הקופה — הכרעות עדן 25.10.2026:
   - הקופה = ה־5% הרשום (session.savingsPot), תמיד מלאה, לעולם לא נגזרת מפער הערב.
   - "בפועל" (savingsPotActual) ניתן לעריכה, ברירת מחדל = הרשום; יתרת המזומן הראשית = בפועל.
   - חוסר מימון מתחלק בין הזוכים יחסית לרווחים, בשקלים שלמים — לעולם לא מהקופה.
   - הקופה היא חובת הפקדה של עדן: כשהוא חייב, 93₪ מתשלומיו הולכים לקופה והשאר לזוכים.
   - הנטו הגולמי של עדן לא משתנה; עודף מעבר לקופה נרשם בכיור "עודף ערב".
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

  it("אוטומטי: חוסר 58 מתחלק יחסית בין הזוכים; הקופה מלאה; עדן משלם 530 מהם 93 לקופה", () => {
    const plan = paymentPlan(NIGHT_2410);
    expect(plan.problems).toEqual([]);
    const { got, gave } = sums(plan.transfers);
    // חלוקה יחסית של 58: אופיר 29, אורן 18, דור 6, דן 5
    expect(got["אופיר סנה"]).toBe(486);
    expect(got["אורן גיל"]).toBe(302);
    expect(got["דור לירז"]).toBe(104);
    expect(got["דן ינקלויץ"]).toBe(95);
    expect(got[POT_SINK_NAME]).toBe(93); // הקופה לעולם לא נחתכת
    expect(gave["עדן גיל"]).toBe(530); // מלוא החוב הגולמי
    expect(gave["קובי סעדה"]).toBe(400);
    expect(gave["נתנאל כהן"]).toBe(150);
    // חובת ההפקדה של עדן: שורת קופה אחת של 93 ממנו
    const potFromEden = plan.transfers.filter((t) => t.to === POT_SINK_NAME);
    expect(potFromEden).toHaveLength(1);
    expect(potFromEden[0].from).toBe("עדן גיל");
    expect(potFromEden[0].amount).toBe(93);
  });

  it("החלוקה הידנית של עדן לערב זה (35/13/10) נשמרת במדויק דרך manualSettlement", () => {
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
    const { got, gave } = sums(plan.transfers);
    expect(got["אופיר סנה"]).toBe(480);
    expect(got["אורן גיל"]).toBe(307);
    expect(got["דור לירז"]).toBe(100);
    expect(got["דן ינקלויץ"]).toBe(100);
    expect(got[POT_SINK_NAME]).toBe(93);
    expect(gave["עדן גיל"]).toBe(530); // 437 לזוכים + 93 לקופה
    expect(gave["קובי סעדה"]).toBe(400);
    expect(gave["נתנאל כהן"]).toBe(150);
    const edenToPot = plan.transfers
      .filter((t) => t.from === "עדן גיל" && t.to === POT_SINK_NAME)
      .reduce((s, t) => s + t.amount, 0);
    expect(edenToPot).toBe(93);
    // הטקסט הציבורי לקבוצה לא חושף את הקופה
    const text = settlementTextForSession(session);
    expect(text).not.toContain("קופת חיסכון");
    expect(text).not.toContain("93");
  });

  it("עודף מעבר לקופה הולך לכיור העודף — זוכים וקופה מלאים", () => {
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
    const { got, gave } = sums(plan.transfers);
    expect(got["דן ינקלויץ"]).toBe(250);
    expect(got[POT_SINK_NAME]).toBe(93);
    expect(got[RESIDUAL_SINK_NAME]).toBe(57); // 150 עודף − 93 קופה
    expect(gave["עדן גיל"]).toBe(400);
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
    expect(plan.problems).toEqual([]);
  });
});
