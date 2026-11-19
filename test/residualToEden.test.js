/* זיכוי העודף לעדן גיל — הכרעת עדן 19.11.2026.
   עודף מעבר לקופת החיסכון מזוכה לעדן על שמו בחישוב החלוקה (מחליף את
   כיור "עודף ערב" הניטרלי של מודל 25.10, וחוזר לכלל 2026-10-11):
   - שארית של חייב אחר היא העברת residual ממוענת לעדן (פנימית, לא בתוכנית
     הקנונית ולא בטקסט לקבוצה).
   - שארית של עדן עצמו נספגת — אין העברה עצמית, וחובו הצפוי קטן בהתאם.
   - הצפוי של עדן = גולמי + מלוא העודף; הגולמי (raw) והסטטיסטיקה לא זזים.
   - הקופה (5%) כיור נפרד, מנותבת דרך עדן כמקודם — בלי שינוי.
   - ערבים בלי עודף / קופה־בלבד / טרום־קופה — זהים לקודם.
   - מסלול שמור: הזיכוי חל גם שם, וסימוני שולם/התקבל לא זזים (הם נקשרים
     רק לרשימת ההעברות הקנונית, שהזיכוי לא נוגע בה). */
import { describe, it, expect } from "vitest";
import {
  paymentPlan,
  saveManualPayments,
  markTransfer,
} from "../lib/paymentTracking.js";
import {
  resolveSettlement,
  settlementTextForSession,
  POT_SINK_NAME,
  RESIDUAL_SINK_NAME,
} from "../lib/nightShare.js";

const sums = (transfers) => {
  const got = {}, gave = {};
  for (const t of transfers) {
    got[t.to] = (got[t.to] || 0) + t.amount;
    if (t.fromSplit) for (const [n, a] of Object.entries(t.fromSplit)) gave[n] = (gave[n] || 0) + a;
    else gave[t.from] = (gave[t.from] || 0) + t.amount;
  }
  return { got, gave };
};

describe("זיכוי העודף לעדן (19.11) — מסלול אוטומטי", () => {
  it("עודף מחייב אחר, עם קופה: השארית ממוענת לעדן, הקופה לא נגועה", () => {
    // חובות 400, תביעות 250 זכייה + 93 קופה = 343 → עודף 57:
    // 50 שארית של אבי (שילם 250 מ־300), 7 שארית של עדן עצמו (נספגת).
    const session = {
      iso: "2026-10-24", cps: 1, savings5: true, savingsPot: 93,
      entries: [
        { name: "עדן גיל", amount: -100 },
        { name: "אבי כהן", amount: -300 },
        { name: "דן ינקלויץ", amount: 250 },
      ],
    };
    const plan = paymentPlan(session);
    expect(plan.problems).toEqual([]);
    const resolved = resolveSettlement(session);
    expect(resolved.transfers.filter((t) => t.residual)).toEqual([
      { from: "אבי כהן", to: "עדן גיל", amount: 50, residual: true },
    ]);
    const { got, gave } = sums(resolved.transfers);
    expect(got["דן ינקלויץ"]).toBe(250); // זוכה מקבל מלא
    expect(got[POT_SINK_NAME]).toBe(93); // קופה מלאה, כיור נפרד
    expect(gave["אבי כהן"]).toBe(300); // חייב משלם מלא — 250 לדן + 50 לעדן
    expect(got[RESIDUAL_SINK_NAME]).toBeUndefined();
    // צפוי עדן: −100 גולמי + 57 זיכוי = −43; הגולמי נשמר ב־raw
    const eden = resolved.expected.find((e) => e.name === "עדן גיל");
    expect(eden.net).toBe(-43);
    expect(eden.raw).toBe(-100);
    // התוכנית הקנונית והטקסט לקבוצה לא חושפים את שורת העודף
    expect(plan.transfers.some((t) => t.residual)).toBe(false);
    expect(plan.potTransfer).toMatchObject({ from: "עדן גיל", to: POT_SINK_NAME, amount: 93 });
    const text = settlementTextForSession(session);
    // תנועותיו היחידות של עדן בערב הזה הן הקופה (יוצאת) והעודף (נכנס) —
    // שתיהן מסוננות מהטקסט לקבוצה, אז שמו לא מופיע בו כלל
    expect(text).not.toContain("עדן גיל");
    expect(text).toContain("250");
  });

  it("עדן עם נטו 0 בערב עם עודף — מקבל את העודף, צפויו חיובי", () => {
    const session = {
      iso: "2026-10-10",
      entries: [
        { name: "עדן גיל", amount: 0 },
        { name: "אבי כהן", amount: -100 },
        { name: "דן ינקלויץ", amount: 70 },
      ],
    };
    const { transfers, expected } = resolveSettlement(session);
    expect(transfers.filter((t) => t.residual)).toEqual([
      { from: "אבי כהן", to: "עדן גיל", amount: 30, residual: true },
    ]);
    const eden = expected.find((e) => e.name === "עדן גיל");
    expect(eden.net).toBe(30);
    expect(eden.raw).toBe(0);
  });

  it("ערב קופה־בלבד בלי עודף: חוב 343 של עדן מתעגל ל־340, והפער נספג בקיצוץ חמישיות לדן", () => {
    // תחת שלב 1 הערב היה מאוזן בדיוק (343 = 250 + 93). תחת עיגול
    // החמישיות (שלב 2): חובו של עדן (מועדף) מעוגל למטה 343←340, נוצר
    // חוסר 3, ושבר מימון הקופה שלו הוא 2 — הקיצוץ הכולל לדן (הזוכה
    // הרגיל היחיד) הוא 5, והוא סופג את שניהם. אין עודף ואין זיכוי.
    const session = {
      iso: "2026-10-24", cps: 1, savings5: true, savingsPot: 93,
      entries: [
        { name: "עדן גיל", amount: -343 },
        { name: "דן ינקלויץ", amount: 250 },
      ],
    };
    const resolved = resolveSettlement(session);
    expect(resolved.transfers).toEqual([
      { from: "עדן גיל", to: "דן ינקלויץ", amount: 245 },
      { from: "עדן גיל", to: POT_SINK_NAME, amount: 93, pot: true },
    ]);
    const eden = resolved.expected.find((e) => e.name === "עדן גיל");
    expect(eden.net).toBe(-338); // משלם 245 + 93
    expect(eden.raw).toBe(-343); // הגולמי לא זז
    expect(paymentPlan(session).problems).toEqual([]);
  });

  it("ערב מאוזן בלי עודף ובלי קופה — זהה לקודם", () => {
    const session = {
      iso: "2026-10-24", cps: 1, savings5: true,
      entries: [
        { name: "עדן גיל", amount: -100 },
        { name: "דן ינקלויץ", amount: 60 },
        { name: "אבי כהן", amount: 40 },
      ],
    };
    const resolved = resolveSettlement(session);
    expect(resolved.transfers).toEqual([
      { from: "עדן גיל", to: "דן ינקלויץ", amount: 60 },
      { from: "עדן גיל", to: "אבי כהן", amount: 40 },
    ]);
    expect(resolved.expected.map((e) => e.net)).toEqual([-100, 60, 40]);
  });

  it("ערב טרום־קופה עם עודף — לא משתנה: אין שורות residual, הצפוי גולמי", () => {
    const session = {
      iso: "2026-10-09",
      entries: [
        { name: "עדן גיל", amount: -280 },
        { name: "דן ינקלויץ", amount: 100 },
        { name: "רוני לוי", amount: 100 },
      ],
    };
    const resolved = resolveSettlement(session);
    expect(resolved.mode).toBe("plain");
    expect(resolved.transfers.some((t) => t.residual)).toBe(false);
    expect(resolved.transfers).toEqual([
      { from: "עדן גיל", to: "דן ינקלויץ", amount: 100 },
      { from: "עדן גיל", to: "רוני לוי", amount: 100 },
    ]);
    expect(resolved.expected.find((e) => e.name === "עדן גיל").net).toBe(-280);
  });
});

describe("זיכוי העודף לעדן (19.11) — מסלול שמור וסימונים", () => {
  const NIGHT_1010 = {
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
  };
  const REAL = [
    { from: "עדן גיל ואורן גיל", to: "דן ינקלויץ", amount: 230, joint: true, fromSplit: { "עדן גיל": 145, "אורן גיל": 85 } },
    { from: "עדן גיל ואורן גיל", to: "קובי סעדה", amount: 10, joint: true, fromSplit: { "עדן גיל": 6, "אורן גיל": 4 } },
    { from: "עדן גיל ואורן גיל", to: "אופיר סנה", amount: 80, joint: true, fromSplit: { "עדן גיל": 50, "אורן גיל": 30 } },
    { from: "נתנאל כהן", to: "קובי סעדה", amount: 200 },
    { from: "דור לירז", to: "דן ינקלויץ", amount: 300 },
    { from: "איציק תפילין", to: "אופיר סנה", amount: 175 },
  ];

  it("הזיכוי חל במסלול השמור, והעברות השחקנים זהות לאלה שלפני הסימון", () => {
    const withManual = saveManualPayments(NIGHT_1010, REAL);
    const before = paymentPlan(withManual);
    const resolved = resolveSettlement(withManual);
    // עודף 75 מזוכה: שורת אורן→עדן 1, שארית עדן (74) נספגת, צפוי −205
    expect(resolved.transfers.filter((t) => t.residual)).toEqual([
      expect.objectContaining({ from: "אורן גיל", to: "עדן גיל", amount: 1, residual: true }),
    ]);
    expect(resolved.expected.find((e) => e.name === "עדן גיל").net).toBe(-205);
    // התוכנית הקנונית לא כוללת שורות עודף — לכן אינדקסי הסימון יציבים
    expect(before.transfers.some((t) => t.residual)).toBe(false);
    expect(before.problems).toEqual([]);
    return before;
  });

  it("סימון שולם על העברה קנונית שורד חישוב מחדש; ה־fingerprint לא זז", () => {
    const withManual = saveManualPayments(NIGHT_1010, REAL);
    const before = paymentPlan(withManual);
    // ההעברה האוטומטית הממתינה (5₪ לאופיר) — היחידה שאינה ידנית
    const idx = before.transfers.findIndex((t) => !t.manual);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(before.paid[idx]).toBeFalsy();
    const marked = markTransfer(withManual, idx, true, "test");
    const after = paymentPlan(marked);
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.transfers).toHaveLength(before.transfers.length);
    expect(after.transfers.map(({ from, to, amount }) => ({ from, to, amount }))).toEqual(
      before.transfers.map(({ from, to, amount }) => ({ from, to, amount }))
    );
    expect(after.paid[idx]).toBe(true);
    expect(after.problems).toEqual([]);
  });
});
