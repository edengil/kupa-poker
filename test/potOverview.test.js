/* דשבורד קופה צדדית לאדמין — סיכומים ועריכה לכל ערב. */
import { describe, it, expect } from "vitest";
import { potOverview } from "../lib/paymentTracking.js";
import { computedPot } from "../lib/nightShare.js";

const NIGHT_1010 = {
  id: "live_1791669733765",
  d: 10, mo: 10, y: 2026, iso: "2026-10-10",
  savingsPot: 76.25,
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

const NIGHT_2 = {
  id: "s2",
  d: 3, mo: 10, y: 2026, iso: "2026-10-03",
  entries: [
    { name: "דן ינקלויץ", amount: 100 },
    { name: "עדן גיל", amount: -100 },
  ],
};

describe("דשבורד קופה", () => {
  it("computedPot מחזיר את העודף בשקלים שלמים", () => {
    expect(computedPot(NIGHT_1010)).toBe(75);
    expect(computedPot(NIGHT_2)).toBe(0); // מאוזן — אין קופה
    expect(computedPot({ entries: [] })).toBe(0);
  });

  it("potOverview מסכם ערבים ומשיכות", () => {
    const db = {
      sessions: [NIGHT_1010, NIGHT_2],
      savingsWithdrawals: [{ amount: 50, reason: "x", at: "2026-10-05T00:00:00Z" }],
    };
    const o = potOverview(db);
    expect(o.evenings).toHaveLength(2);
    expect(o.evenings[0].id).toBe("live_1791669733765"); // חדש קודם
    const e = o.evenings[0];
    expect(e.applied).toBe(75);
    expect(e.recorded).toBe(76.25);
    expect(e.edenGross).toBe(-280);
    expect(e.edenPaid).toBe(205);
    expect(e.edenWon).toBe(0);
    expect(o.totalApplied).toBe(75);
    expect(o.totalRecorded).toBe(76.25);
    expect(o.withdrawn).toBe(50);
    expect(o.balance).toBe(26.25);
  });

  it("ערב מאוזן: קופה 0 ועדן משלם מלא", () => {
    const o = potOverview({ sessions: [NIGHT_2] });
    const e = o.evenings[0];
    expect(e.applied).toBe(0);
    expect(e.edenPaid).toBe(100);
  });
});
