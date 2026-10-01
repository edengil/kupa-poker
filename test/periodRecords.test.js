import { describe, it, expect } from "vitest";
import { computePeriodRecords, recordPeriods } from "../lib/poker/computeRecords.js";

function night(iso, entries, extra = {}) {
  const [y, mo, d] = iso.split("-").map(Number);
  return {
    id: iso,
    iso,
    d,
    mo,
    y,
    entries: Object.entries(entries).map(([name, amount]) =>
      typeof amount === "object" ? { name, ...amount } : { name, amount }
    ),
    ...extra,
  };
}

/* אוגוסט: קובי מוביל. ספטמבר: נתנאל מוביל, וערב השיא שלו גדול מערב השיא של אוגוסט —
   כדי להוכיח שאין זליגה בין חודשים. */
const db = {
  aliases: {},
  roster: [],
  yearly: [],
  sessions: [
    night("2026-08-03", { "עדן גיל": { amount: 100, tipsGiven: 10 }, "קובי סעדה": 200, "נתנאל כהן": -300 }),
    night("2026-08-17", { "עדן גיל": -50, "קובי סעדה": 150, "נתנאל כהן": -100 }),
    night("2026-09-07", { "נתנאל כהן": { amount: 500, tipsGiven: 25 }, "עדן גיל": -500 }),
    night("2026-09-21", { "נתנאל כהן": 100, "עדן גיל": -40, "קובי סעדה": -60 }),
    night("2025-12-01", { "עדן גיל": 700, "קובי סעדה": -700 }),
  ],
};

describe("recordPeriods", () => {
  it("lists months and years that have nights, newest first, with Hebrew labels", () => {
    const p = recordPeriods(db);
    expect(p.months.map((m) => m.key)).toEqual(["2026-9", "2026-8", "2025-12"]);
    expect(p.months[0].label).toBe("ספטמבר 2026");
    expect(p.years).toEqual([2026, 2025]);
  });

  it("empty db yields empty options", () => {
    expect(recordPeriods({ sessions: [] })).toEqual({ months: [], years: [] });
    expect(recordPeriods(null)).toEqual({ months: [], years: [] });
  });
});

describe("computePeriodRecords", () => {
  it("monthly scope computes records from that month only", () => {
    const aug = computePeriodRecords(db, { kind: "month", y: 2026, mo: 8 });
    expect(aug.label).toBe("אוגוסט 2026");
    expect(aug.nights).toBe(2);
    expect(aug.recs.totalNights).toBe(2);
    expect(aug.recs.monthKing.name).toBe("קובי סעדה"); // ‎200+150 באוגוסט
    expect(aug.recs.monthKing.amount).toBe(350);
    /* ערב השיא של ספטמבר (‎+500) לא זולג לאוגוסט */
    expect(aug.recs.bestNight.name).toBe("קובי סעדה");
    expect(aug.recs.bestNight.amount).toBe(200);
    expect(aug.recs.tips?.monthKing?.name).toBe("עדן גיל"); // 10 ג' טיפ באוגוסט
  });

  it("another month gives that month's records", () => {
    const sep = computePeriodRecords(db, { kind: "month", y: 2026, mo: 9 });
    expect(sep.recs.monthKing.name).toBe("נתנאל כהן");
    expect(sep.recs.monthKing.amount).toBe(600);
    expect(sep.recs.bestNight.amount).toBe(500);
    expect(sep.recs.most.name).toBe("נתנאל כהן"); // 2 ערבים בספטמבר, כמו עדן — שוויון נפתר במיון הקיים
  });

  it("yearly scope computes records from that year only", () => {
    const y2026 = computePeriodRecords(db, { kind: "year", y: 2026 });
    expect(y2026.label).toBe("2026");
    expect(y2026.nights).toBe(4);
    expect(y2026.recs.yearKing.name).toBe("קובי סעדה"); // ‎+290 ב־2026 מול ‎+200 של נתנאל
    expect(y2026.recs.yearKing.amount).toBe(290);
    expect(y2026.recs.bestNight.amount).toBe(500);
    /* ערב השיא של 2025 (‎+700) לא נכנס לשיאי 2026 */
    const y2025 = computePeriodRecords(db, { kind: "year", y: 2025 });
    expect(y2025.recs.yearKing.name).toBe("עדן גיל");
    expect(y2025.recs.yearKing.amount).toBe(700);
  });

  it("returns null for a period without nights (no crash)", () => {
    expect(computePeriodRecords(db, { kind: "month", y: 2024, mo: 1 })).toBeNull();
    expect(computePeriodRecords(db, { kind: "year", y: 2030 })).toBeNull();
    expect(computePeriodRecords(null, { kind: "year", y: 2026 })).toBeNull();
    expect(computePeriodRecords(db, { kind: "week", y: 2026 })).toBeNull();
  });
});
