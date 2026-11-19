/* ממצא 1 מביקורת משפחת־הפער (19.11.2026): «קופת חיסכון» הוצגה על
   פער גולמי בשני משטחים, למרות שהקופה היא 5% מהקניות והפער מושג אחר.
   הבדיקות מעגנות: (א) כרטיס הערב בטאב הערבים מציג למנהל את הפער
   הקנוני (nightGap, כולל טיפים) כפער — ולעולם לא כקופת חיסכון;
   (ב) מד האיזון קורא «קופת חיסכון» רק לחלק הפער ששווה לקופה
   שהקורא סיפק, ואת השארית מציג כפער; בלי קופה — תצוגה ניטרלית. */
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { BalanceMeter } from "../components/poker/chrome.jsx";
import { SessionsTab } from "../components/poker/SessionsTab.jsx";

describe("BalanceMeter — קופה רק עד גובה הקופה הצפויה", () => {
  const render = (bal, pot) =>
    renderToString(React.createElement(BalanceMeter, { bal, pot }));

  it("פער שלילי ששווה בדיוק לקופה — כולו קופת חיסכון", () => {
    const html = render({ pos: 950, neg: 1000, gap: -50 }, 50);
    expect(html).toContain("קופת חיסכון: 50₪ (נשמרת אצל עדן גיל)");
    expect(html).not.toContain("פער");
  });

  it("פער שלילי גדול מהקופה — הקופה בנפרד והשארית פער/חוסר", () => {
    const html = render({ pos: 850, neg: 1000, gap: -150 }, 50);
    expect(html).toContain("קופת חיסכון: 50₪ (נשמרת אצל עדן גיל)");
    expect(html).toContain("פער חוסר 100");
  });

  it("בלי קופה מהקורא — תצוגת פער ניטרלית, בלי טענת קופה", () => {
    const html = render({ pos: 850, neg: 1000, gap: -150 });
    expect(html).toContain("פער חוסר 150");
    expect(html).not.toContain("קופת חיסכון");
  });

  it("קופה 0 — כל הפער הוא פער, לא קופה", () => {
    const html = render({ pos: 850, neg: 1000, gap: -150 }, 0);
    expect(html).toContain("פער חוסר 150");
    expect(html).not.toContain("קופת חיסכון");
  });

  it("מאוזן ועודף מגיע — כמו קודם", () => {
    expect(render({ pos: 100, neg: 100, gap: 0 })).toContain("הערב סגור מדויק");
    expect(render({ pos: 180, neg: 100, gap: 80 })).toContain("פער פלוס 80 (עודף מגיע)");
  });
});

describe("SessionsTab — שורת הסיכום בכרטיס הערב", () => {
  /* דוגמת הביקורת: קניות 1,000₪, יציאות 1,700 ג'יטונים, טיפים 200
     ג'יטונים, cps=2 ⇒ פער גולמי −150, פער קנוני −50. */
  const chipNight = {
    id: "n1",
    iso: "2026-11-09",
    d: 9,
    mo: 11,
    y: 2026,
    cps: 2,
    entries: [
      { name: "א", amount: -50, buyin: 500, chips: 900, tipsGiven: 100 },
      { name: "ב", amount: -100, buyin: 500, chips: 800, tipsGiven: 100 },
    ],
  };
  const renderTab = (sessions, isAdmin) =>
    renderToString(
      React.createElement(SessionsTab, {
        db: { sessions, aliases: {} },
        commit: () => {},
        isAdmin,
      })
    );

  it("מנהל רואה את הפער הקנוני (−50, עם הטיפים) — לא «קופת חיסכון 150»", () => {
    const html = renderTab([chipNight], true);
    expect(html).toContain("⚠ פער חוסר 50");
    expect(html).not.toContain("קופת חיסכון 150");
  });

  it("לא־מנהל עם פער שלילי רואה «✓ מאוזן» כמו קודם", () => {
    const html = renderTab([chipNight], false);
    expect(html).toContain("✓ מאוזן");
    expect(html).not.toContain("פער חוסר");
  });

  it("ערב סכום־בלבד — אותו פער כמו תמיד (סכום הנטו)", () => {
    const amountNight = {
      id: "n2",
      iso: "2026-11-02",
      d: 2,
      mo: 11,
      y: 2026,
      entries: [
        { name: "א", amount: 70 },
        { name: "ב", amount: -100 },
      ],
    };
    const html = renderTab([amountNight], true);
    expect(html).toContain("⚠ פער חוסר 30");
  });
});
