/* הקופה הצדדית התחילה בערב 10.10.2026 — ערבים קודמים בלי קופה ובלי ולידציה מחמירה. */
import { describe, it, expect } from "vitest";
import { computedPot, nightGap, playersWithPot, sessionHasPot } from "../lib/nightShare.js";
import { paymentPlan, potOverview } from "../lib/paymentTracking.js";

// ערב שלפני הקופה עם עודף ברישום 150₪ (חייבים 250 מול זכיות 100)
const NIGHT_OLD = {
  id: "s-old",
  d: 6, mo: 10, y: 2026, iso: "2026-10-06",
  entries: [
    { name: "דן ינקלויץ", amount: 100 },
    { name: "אורן גיל", amount: -150 },
    { name: "עדן גיל", amount: -100 },
  ],
};

const NIGHT_1010 = {
  id: "live_1791669733765",
  d: 10, mo: 10, y: 2026, iso: "2026-10-10",
  entries: [
    { name: "דן ינקלויץ", amount: 530 },
    { name: "אופיר סנה", amount: 260 },
    { name: "קובי סעדה", amount: 210 },
    { name: "אורן גיל", amount: -110 },
    { name: "איציק תפילין", amount: -175 },
    { name: "נתנאל כהן", amount: -200 },
    { name: "עדן גיל", amount: -290 },
    { name: "דור לירז", amount: -300 },
  ],
};

describe("שער תחילת הקופה (10.10.2026)", () => {
  it("sessionHasPot לפי תאריך", () => {
    expect(sessionHasPot(NIGHT_OLD)).toBe(false);
    expect(sessionHasPot(NIGHT_1010)).toBe(true);
    expect(sessionHasPot({ iso: "2026-11-01" })).toBe(true);
    expect(sessionHasPot({})).toBe(false);
    expect(sessionHasPot(null)).toBe(false);
  });

  it("אין קופה רשומה בלי שדה — הפער נמדד בנפרד (מודל 25.10)", () => {
    expect(computedPot(NIGHT_OLD)).toBe(0);
    // בלי שדה savingsPot ובלי מתג — אין קופה רשומה; ה־75₪ הם פער הערב, לא קופה
    expect(computedPot(NIGHT_1010)).toBe(0);
    expect(nightGap(NIGHT_1010)).toBe(-75);
    expect(nightGap(NIGHT_OLD)).toBe(-150);
  });

  it("ערב ישן — playersWithPot לא נוגע בנטו של עדן", () => {
    const players = playersWithPot(NIGHT_OLD);
    const eden = players.find((p) => p.name === "עדן גיל");
    expect(Number(eden.buyin)).toBe(100);
    expect(Number(eden.cashout)).toBe(0);
  });

  it("ערב ישן — החלוקה כמו פעם ואין התרעות ולידציה", () => {
    const { transfers, problems } = paymentPlan(NIGHT_OLD);
    expect(problems).toEqual([]);
    const total = transfers.reduce((s, t) => s + t.amount, 0);
    expect(total).toBe(100); // רק הזכיות שולמו בפועל, כמו שהיה אז
  });

  it("potOverview סופר קופה רק מערב 10.10 ואילך", () => {
    const o = potOverview({ sessions: [NIGHT_1010, NIGHT_OLD] });
    expect(o.totalRecorded).toBe(0); // לאף ערב אין שדה קופה רשום בפיקסטורה
    const e1010 = o.evenings.find((e) => e.id === "live_1791669733765");
    expect(e1010.gap).toBe(-75); // הפער מוצג כשורה נפרדת, לא כקופה
    expect(e1010.edenPaid).toBe(290); // מודל 25.10: עדן משלם את מלוא חובו הגולמי
    const old = o.evenings.find((e) => e.id === "s-old");
    expect(old.recorded).toBe(0);
    expect(old.edenPaid).toBe(100); // עדן משלם מלא בערב ישן
  });
});
