/* כלל קבוע מעדן (2026-10-11): כסף תלוי באוויר (חייבים > מגיע) תמיד הולך לעדן גיל —
   מפחית את חובו או מגדיל את זכייתו. לעולם לא נופל שרירותית על שחקן אחר
   (ערב 10.10.2026: נפל על איציק) ולא נגרע מזוכה (אותו ערב: קובי 210→134). */
import { describe, it, expect } from "vitest";
import {
  paymentPlan,
  playersWithPot,
  validateTransfers,
} from "../lib/paymentTracking.js";

const NIGHT_1010 = {
  id: "live_1791669733765",
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

describe("כלל העודף → עדן גיל (ערב 10.10.2026)", () => {
  it("החלוקה תקינה — אין בעיות ולידציה", () => {
    const { problems } = paymentPlan(NIGHT_1010);
    expect(problems).toEqual([]);
  });

  it("זוכים מקבלים מלא, חייבים משלמים מלא, עדן משלם פחות העודף", () => {
    const { transfers } = paymentPlan(NIGHT_1010);
    const { got, gave } = sums(transfers);
    expect(got["דן ינקלויץ"]).toBe(530);
    expect(got["אופיר סנה"]).toBe(260);
    expect(got["קובי סעדה"]).toBe(210); // לא 134!
    expect(gave["איציק תפילין"]).toBe(175); // לא 100!
    expect(gave["נתנאל כהן"]).toBe(200);
    expect(gave["דור לירז"]).toBe(300);
    expect((gave["אורן גיל"] || 0) + (gave["עדן גיל"] || 0)).toBe(325); // 120 + (280-75)
    for (const t of transfers) {
      expect(Number.isInteger(t.amount) && t.amount > 0).toBe(true);
    }
    const totalIn = Object.values(got).reduce((s, v) => s + v, 0);
    const totalOut = Object.values(gave).reduce((s, v) => s + v, 0);
    expect(totalIn).toBe(1000);
    expect(totalOut).toBe(1000);
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

  it("עדן מרוויח — העודף מגדיל את זכייתו", () => {
    const session = {
      entries: [
        { name: "עדן גיל", amount: 100 },
        { name: "דן ינקלויץ", amount: 50 },
        { name: "אורן גיל", amount: -200 },
      ],
    };
    const { transfers, problems } = paymentPlan(session);
    expect(problems).toEqual([]);
    const { got } = sums(transfers);
    expect(got["עדן גיל"]).toBe(150); // 100 + עודף 50
    expect(got["דן ינקלויץ"]).toBe(50);
  });

  it("עדן לא בערב — הוולידטור מתריע במקום לשתוק", () => {
    const session = {
      entries: [
        { name: "דן ינקלויץ", amount: 100 },
        { name: "אורן גיל", amount: -150 },
      ],
    };
    const { problems } = paymentPlan(session);
    expect(problems.length).toBeGreaterThan(0);
  });
});
