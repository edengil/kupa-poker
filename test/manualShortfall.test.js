/* חוסר ידני: 10₪ (דן 5, אופיר 5) נרשמים כחוסר ולא כממתין. */
import { describe, it, expect } from "vitest";
import { paymentPlan, saveManualPayments } from "../lib/paymentTracking.js";
import { savedSettlement } from "../lib/savedSettlement.js";
import { playersWithPot } from "../lib/nightShare.js";

const NIGHT_1010 = {
  id: "live_1791669733765",
  iso: "2026-10-10",
  entries: [
    { name: "דן ינקלויץ", amount: 535 },
    { name: "אופיר סנה", amount: 260 },
    { name: "קובי סעדה", amount: 210 },
    { name: "אורן גיל", amount: -110 },
    { name: "איציק תפילין", amount: -175 },
    { name: "נתנאל כהן", amount: -200 },
    { name: "עדן גיל", amount: -290 },
    { name: "דור לירז", amount: -300 },
  ],
};

const REAL = [
  { from: "עדן גיל ואורן גיל", to: "דן ינקלויץ", amount: 230, joint: true, fromSplit: { "עדן גיל": 153, "אורן גיל": 77 } },
  { from: "עדן גיל ואורן גיל", to: "קובי סעדה", amount: 10, joint: true, fromSplit: { "עדן גיל": 7, "אורן גיל": 3 } },
  { from: "עדן גיל ואורן גיל", to: "אופיר סנה", amount: 80, joint: true, fromSplit: { "עדן גיל": 53, "אורן גיל": 27 } },
  { from: "נתנאל כהן", to: "קובי סעדה", amount: 200 },
  { from: "דור לירז", to: "דן ינקלויץ", amount: 300 },
  { from: "איציק תפילין", to: "אופיר סנה", amount: 175 },
];

const SHORTFALL = { "דן ינקלויץ": 5, "אופיר סנה": 5, "עדן גיל": 7, "אורן גיל": 3 };

function sessionWith(ms) {
  return { ...NIGHT_1010, manualSettlement: ms };
}

describe("חוסר ידני", () => {
  it("אין העברות ממתינות כשהחוסר מכסה את היתרה", () => {
    const withManual = saveManualPayments(NIGHT_1010, REAL);
    const ms = { ...withManual.manualSettlement, shortfall: SHORTFALL };
    const plan = paymentPlan(sessionWith(ms));
    const pending = plan.transfers.filter((t) => !t.manual);
    expect(pending).toHaveLength(0);
    expect(plan.transfers.filter((t) => t.manual)).toHaveLength(6);
  });

  it("הוולידטור לא מתריע", () => {
    const withManual = saveManualPayments(NIGHT_1010, REAL);
    const ms = { ...withManual.manualSettlement, shortfall: SHORTFALL };
    const plan = paymentPlan(sessionWith(ms));
    expect(plan.problems).toEqual([]);
  });

  it("shortfallTotal הוא 10 נטו", () => {
    const players = playersWithPot(NIGHT_1010);
    const withManual = saveManualPayments(NIGHT_1010, REAL);
    const ms = { ...withManual.manualSettlement, shortfall: SHORTFALL };
    const saved = savedSettlement(players, 1, ms);
    expect(saved.shortfallTotal).toBe(10);
  });
});
