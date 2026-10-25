/* תשלום זוגי ידני — ההעברות האמיתיות של ערב 10.10.2026 כפי שדיווח עדן. */
import { describe, it, expect } from "vitest";
import { paymentPlan, validateTransfers, saveManualPayments } from "../lib/paymentTracking.js";
import { resolveSettlement } from "../lib/nightShare.js";

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

// ההעברות האמיתיות: עדן+אורן 230 לדן / 10 לקובי / 80 לאופיר (פיצול יחסי 205:120),
// נתנאל 200 לקובי, דור 300 לדן, איציק 175 לאופיר
const REAL_TRANSFERS = [
  { from: "עדן גיל ואורן גיל", to: "דן ינקלויץ", amount: 230, joint: true, fromSplit: { "עדן גיל": 145, "אורן גיל": 85 } },
  { from: "עדן גיל ואורן גיל", to: "קובי סעדה", amount: 10, joint: true, fromSplit: { "עדן גיל": 6, "אורן גיל": 4 } },
  { from: "עדן גיל ואורן גיל", to: "אופיר סנה", amount: 80, joint: true, fromSplit: { "עדן גיל": 50, "אורן גיל": 30 } },
  { from: "נתנאל כהן", to: "קובי סעדה", amount: 200 },
  { from: "דור לירז", to: "דן ינקלויץ", amount: 300 },
  { from: "איציק תפילין", to: "אופיר סנה", amount: 175 },
];

describe("העברות אמיתיות 10.10 — תשלום זוגי ידני", () => {
  it("6 ההעברות נשמרות ולא נזרקות (ערב עם עודף)", () => {
    const withManual = saveManualPayments(NIGHT_1010, REAL_TRANSFERS);
    const plan = paymentPlan(withManual);
    const manual = plan.transfers.filter((t) => t.manual);
    expect(manual).toHaveLength(6);
    expect(manual[0]).toMatchObject({ from: "עדן גיל ואורן גיל", to: "דן ינקלויץ", amount: 230, joint: true });
    expect(manual[0].fromSplit).toEqual({ "עדן גיל": 145, "אורן גיל": 85 });
  });

  it("דן וקובי מקבלים מלא; אופיר חסר 5₪ — היתרה נשארת כהעברה ממתינה", () => {
    const withManual = saveManualPayments(NIGHT_1010, REAL_TRANSFERS);
    const plan = paymentPlan(withManual);
    const got = {};
    for (const t of plan.transfers) got[t.to] = (got[t.to] || 0) + t.amount;
    expect(got["דן ינקלויץ"]).toBe(530);
    expect(got["קובי סעדה"]).toBe(210);
    expect(got["אופיר סנה"]).toBe(260); // 255 ידני + 5 אוטומטי (ממתין)
    const pending = plan.transfers.filter((t) => !t.manual && !t.residual);
    expect(pending).toHaveLength(1);
    expect(pending[0].to).toBe("אופיר סנה");
    expect(pending[0].amount).toBe(5);
    // מודל 25.10: העודף (75₪) לא מנותב דרך עדן — הוא רשום במפורש בכיור העודף
    // (שורות העודף הן פנימיות ל־resolver ואינן חלק מתוכנית התשלומים הקנונית)
    const residual = resolveSettlement(withManual).transfers.filter((t) => t.residual);
    expect(residual.reduce((s, t) => s + t.amount, 0)).toBe(75);
  });

  it("הוולידטור לא מתריע על החלוקה המלאה (ידני + יתרה)", () => {
    const withManual = saveManualPayments(NIGHT_1010, REAL_TRANSFERS);
    const plan = paymentPlan(withManual);
    expect(plan.problems).toEqual([]);
  });

  it("פיצול שלא מסתכם לסכום — נזרק", () => {
    expect(() =>
      saveManualPayments(NIGHT_1010, [
        { from: "עדן גיל ואורן גיל", to: "דן ינקלויץ", amount: 230, joint: true, fromSplit: { "עדן גיל": 100, "אורן גיל": 85 } },
      ])
    ).toThrow();
  });
});
