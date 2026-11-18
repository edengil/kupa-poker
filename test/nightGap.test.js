/* פער הערב — ההגדרה הקנונית של עדן (11.11), כמו checkNightBalance:
   הפער הוא יציאות + טיפים מול הג'יטונים שהונפקו. טיפ הוא רישום בלבד
   והג'יטונים שלו עברו בין השחקנים בשולחן, לכן הם חוזרים לספירה;
   רק מה שחסר מתחת לטיפים הוא חוסר אמיתי.
   ערב בלי נתוני ג'יטונים (סכום־בלבד) — אין תיקון, סכום הנטו כמות שהוא. */
import { describe, it, expect } from "vitest";
import { nightGap } from "../lib/nightShare.js";

// נטו גולמי −150₪ (יציאות 450₪ מול קניות 600₪), cps=2
const BASE = {
  id: "gap-tips",
  iso: "2026-11-17",
  cps: 2,
  entries: [
    { name: "אבי כהן", buyin: 300, chips: 400 },
    { name: "משה לוי", buyin: 300, chips: 500 },
  ],
};

describe("nightGap — תיקון הטיפים (כלל 11.11)", () => {
  it("בלי טיפים — הפער הוא סכום הנטו הגולמי", () => {
    expect(nightGap(BASE)).toBe(-150);
  });

  it("טיפים מכסים חלק מהפער — רק החוסר שמתחת לטיפים נשאר", () => {
    const night = {
      ...BASE,
      entries: [
        { name: "אבי כהן", buyin: 300, chips: 400, tipsGiven: 60 },
        { name: "משה לוי", buyin: 300, chips: 500, tipsGiven: 40 },
      ],
    };
    // 100 ג'יטוני טיפ = 50₪ ב־cps=2 → −150 + 50 = −100
    expect(nightGap(night)).toBe(-100);
  });

  it("טיפים שמכסים את כל הפער — אין חוסר אמיתי", () => {
    const night = {
      ...BASE,
      entries: [
        { name: "אבי כהן", buyin: 300, chips: 400, tipsGiven: 200 },
        { name: "משה לוי", buyin: 300, chips: 500, tipsGiven: 100 },
      ],
    };
    // 300 ג'יטוני טיפ = 150₪ → −150 + 150 = 0
    expect(nightGap(night)).toBe(0);
  });

  it("טיפים מעבר לפער — עודף חיובי", () => {
    const night = {
      ...BASE,
      entries: [
        { name: "אבי כהן", buyin: 300, chips: 400, tipsGiven: 260 },
        { name: "משה לוי", buyin: 300, chips: 500, tipsGiven: 140 },
      ],
    };
    // 400 ג'יטוני טיפ = 200₪ → −150 + 200 = +50
    expect(nightGap(night)).toBe(50);
  });

  it("ערב סכום־בלבד — אין תיקון טיפים גם אם נרשמו, ההתנהגות כמו תמיד", () => {
    const night = {
      id: "gap-amount-only",
      iso: "2026-11-14",
      entries: [
        { name: "אבי כהן", amount: 100, tipsGiven: 50 },
        { name: "משה לוי", amount: -60 },
        { name: "דוד פרץ", amount: -70 },
      ],
    };
    expect(nightGap(night)).toBe(-30);
  });
});
