/* ביטול משיכה מקופת החיסכון (הכרעת עדן, 25.10.2026):
   - כל שורת משיכה בהיסטוריה ניתנת למחיקה (אדמין בלבד, עם אישור בממשק).
   - המחיקה מסירה את הרשומה מהמערך לפי האינדקס המקורי — התצוגה הפוכה
     (החדשה ביותר קודם), ולכן המיפוי לאינדקס המקורי הוא הלב של הבאג האפשרי.
   - היתרה נגזרת מהנתונים (סכום "בפועל" פחות סכום המשיכות), כך שהיא
     מתעדכנת מעצמה אחרי מחיקה — אין שדה יתרה נפרד לעדכן. */
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  SavingsPotCard,
  withoutWithdrawal,
} from "../components/poker/SavingsPotCard.jsx";

const W = [
  { amount: 30, reason: "מפת פוקר ירוקה", at: "2026-10-10T22:08:48.735Z" },
  { amount: 61.12, reason: "חוסר בקופה", at: "2026-10-24T22:26:00.000Z" },
  { amount: 15, reason: "שתייה", at: "2026-10-24T23:00:00.000Z" },
];

describe("withoutWithdrawal — הסרת משיכה לפי אינדקס מקורי", () => {
  it("מסיר את הרשומה הראשונה/אמצעית/אחרונה בדיוק", () => {
    expect(withoutWithdrawal(W, 0)).toEqual([W[1], W[2]]);
    expect(withoutWithdrawal(W, 1)).toEqual([W[0], W[2]]);
    expect(withoutWithdrawal(W, 2)).toEqual([W[0], W[1]]);
  });

  it("לא משנה את המערך המקורי", () => {
    const copy = W.slice();
    withoutWithdrawal(W, 1);
    expect(W).toEqual(copy);
  });

  it("אינדקס מחוץ לטווח מחזיר רשימה שווה; קלט חסר מחזיר מערך ריק", () => {
    expect(withoutWithdrawal(W, 9)).toEqual(W);
    expect(withoutWithdrawal(undefined, 0)).toEqual([]);
    expect(withoutWithdrawal(null, 0)).toEqual([]);
  });

  it("אחרי מחיקה סכום המשיכות (ומכאן היתרה הנגזרת) מתעדכן", () => {
    const sum = (list) => list.reduce((s, w) => s + (Number(w.amount) || 0), 0);
    expect(sum(W)).toBeCloseTo(106.12);
    expect(sum(withoutWithdrawal(W, 1))).toBe(45);
  });
});

describe("SavingsPotCard — הצגת כפתור מחיקה", () => {
  const db = { sessions: [], savingsWithdrawals: W };

  it("אדמין רואה שורת מחיקה לכל משיכה בהיסטוריה", () => {
    const html = renderToString(
      React.createElement(SavingsPotCard, { db, commit: () => {}, isAdmin: true })
    );
    expect(html).toContain("מפת פוקר ירוקה");
    expect(html).toContain("חוסר בקופה");
    expect(html.match(/מחק/g)).toHaveLength(W.length);
  });

  it("לא־אדמין לא רואה את הכרטיס כלל (גם לא משיכות)", () => {
    const html = renderToString(
      React.createElement(SavingsPotCard, { db, commit: () => {}, isAdmin: false })
    );
    expect(html).toBe("");
  });
});
