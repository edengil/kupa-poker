/* כלל העודף — היסטוריה: כלל 2026-10-11 ניתב את העודף דרך עדן; הכרעת
   25.10.2026 החליפה אותו בכיור "עודף ערב" ניטרלי; והכרעת עדן 19.11.2026
   היא התקפה כיום: העודף מזוכה לעדן גיל על שמו בחלוקה — כל חייב משלם את
   מלוא חובו הגולמי, כל זוכה מקבל את מלוא זכייתו, שאריות של חייבים אחרים
   הן העברות residual לעדן, ושאריתו שלו נספגת ומקטינה את חובו הצפוי.
   הנטו הגולמי והסטטיסטיקה לא משתנים. רק כשעדן לא בערב נשאר הכיור. */
import { describe, it, expect } from "vitest";
import {
  paymentPlan,
  validateTransfers,
} from "../lib/paymentTracking.js";
import { playersWithPot, resolveSettlement } from "../lib/nightShare.js";

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

// היתרות הצפויות אחרי שהעודף (75₪) עובר לעדן
const EXPECTED_1010 = [
  { name: "דן ינקלויץ", net: 530 },
  { name: "אופיר סנה", net: 260 },
  { name: "קובי סעדה", net: 210 },
  { name: "אורן גיל", net: -120 },
  { name: "איציק תפילין", net: -175 },
  { name: "נתנאל כהן", net: -200 },
  { name: "עדן גיל", net: -205 },
  { name: "דור לירז", net: -300 },
];

// החלוקה השבורה מהאפליקציה לפני התיקון (צילום מסך של עדן)
const BROKEN_1010 = [
  { from: "נתנאל כהן", to: "דן ינקלויץ", amount: 200 },
  { from: "עדן גיל ואורן גיל", to: "קובי סעדה", amount: 134, fromSplit: { "עדן גיל": 94, "אורן גיל": 40 } },
  { from: "עדן גיל ואורן גיל", to: "אופיר סנה", amount: 190, fromSplit: { "עדן גיל": 133, "אורן גיל": 57 } },
  { from: "דור לירז", to: "דן ינקלויץ", amount: 300 },
  { from: "איציק תפילין", to: "אופיר סנה", amount: 70 },
  { from: "איציק תפילין", to: "דן ינקלויץ", amount: 30 },
];

function sums(transfers) {
  const got = Object.create(null);
  const gave = Object.create(null);
  for (const t of transfers) {
    if (t.fromSplit && typeof t.fromSplit === "object") {
      for (const [n, a] of Object.entries(t.fromSplit)) gave[n] = (gave[n] || 0) + a;
    } else {
      gave[t.from] = (gave[t.from] || 0) + t.amount;
    }
    got[t.to] = (got[t.to] || 0) + t.amount;
  }
  return { got, gave };
}

describe("כלל העודף — זיכוי לעדן על שמו (הכרעת 19.11; ערב 10.10.2026)", () => {
  it("החלוקה תקינה — אין בעיות ולידציה", () => {
    const { problems } = paymentPlan(NIGHT_1010);
    expect(problems).toEqual([]);
  });

  it("זוכים מקבלים מלא, חייבים משלמים מלא — כולל עדן; העודף מזוכה לעדן", () => {
    // הרשימה המלאה כולל שורות העודף היא של ה־resolver; paymentPlan מחזיק העברות שחקנים בלבד
    const { transfers, expected } = resolveSettlement(NIGHT_1010);
    const { got, gave } = sums(transfers);
    expect(got["דן ינקלויץ"]).toBe(530);
    expect(got["אופיר סנה"]).toBe(260);
    expect(got["קובי סעדה"]).toBe(210); // לא 134!
    expect(gave["איציק תפילין"]).toBe(175); // לא 100!
    expect(gave["נתנאל כהן"]).toBe(200);
    expect(gave["דור לירז"]).toBe(300);
    expect((gave["אורן גיל"] || 0) + (gave["עדן גיל"] || 0)).toBe(400); // 120 + 280 מלא
    // העודף (75) הוא שאריתו של איציק בלבד בחלוקה הזו — והוא ממוען לעדן
    // על שמו (19.11), לא לכיור. עדן עצמו שילם מלא, אז צפויו −205.
    expect(transfers.filter((t) => t.residual)).toEqual([
      { from: "איציק תפילין", to: "עדן גיל", amount: 75, residual: true },
    ]);
    expect(got["עדן גיל"]).toBe(75);
    expect(got["עודף ערב"]).toBeUndefined();
    expect(expected.find((e) => e.name === "עדן גיל").net).toBe(-205);
    for (const t of transfers) {
      expect(Number.isInteger(t.amount) && t.amount > 0).toBe(true);
    }
    const totalIn = Object.values(got).reduce((s, v) => s + v, 0);
    const totalOut = Object.values(gave).reduce((s, v) => s + v, 0);
    expect(totalIn).toBe(1075);
    expect(totalOut).toBe(1075);
  });

  it("הנטו של עדן ב-playersWithPot מופחת בגובה העודף (הגולמי נשמר ב-entries)", () => {
    const players = playersWithPot(NIGHT_1010);
    const eden = players.find((p) => p.name === "עדן גיל");
    expect(+eden.buyin - (+eden.cashout || 0)).toBe(205);
    // הגולמי לא נפגע
    expect(NIGHT_1010.entries.find((e) => e.name === "עדן גיל").amount).toBe(-280);
  });

  it("הוולידטור תופס את החלוקה השבורה הישנה", () => {
    const problems = validateTransfers(EXPECTED_1010, BROKEN_1010);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((p) => p.includes("קובי סעדה"))).toBe(true);
    expect(problems.some((p) => p.includes("איציק תפילין"))).toBe(true);
  });

  it("עדן מרוויח — העודף מגדיל את זכייתו הצפויה (הגולמי נשמר ב־raw)", () => {
    const session = {
      iso: "2026-10-10",
      entries: [
        { name: "עדן גיל", amount: 100 },
        { name: "דן ינקלויץ", amount: 50 },
        { name: "אורן גיל", amount: -200 },
      ],
    };
    const { problems } = paymentPlan(session);
    expect(problems).toEqual([]);
    const { transfers, expected } = resolveSettlement(session);
    const { got } = sums(transfers);
    // הכרעת 19.11: עודף 50 של אורן מזוכה לעדן — הוא מקבל 150 בסך הכל
    // (100 זכייה + 50 עודף), וצפויו 150. הגולמי 100 נשמר בשדה raw.
    expect(got["עדן גיל"]).toBe(150);
    expect(got["דן ינקלויץ"]).toBe(50);
    expect(got["עודף ערב"]).toBeUndefined();
    const edenExpected = expected.find((e) => e.name === "עדן גיל");
    expect(edenExpected.net).toBe(150);
    expect(edenExpected.raw).toBe(100);
  });

  it("עדן לא בערב — העודף לכיור והוולידטור שקט (אין תשלום חסר סמוי)", () => {
    const session = {
      iso: "2026-10-10",
      entries: [
        { name: "דן ינקלויץ", amount: 100 },
        { name: "אורן גיל", amount: -150 },
      ],
    };
    const { problems } = paymentPlan(session);
    expect(problems).toEqual([]);
    const { transfers } = resolveSettlement(session);
    const { got, gave } = sums(transfers);
    expect(got["דן ינקלויץ"]).toBe(100);
    expect(got["עודף ערב"]).toBe(50);
    expect(gave["אורן גיל"]).toBe(150);
  });
});
