import { describe, it, expect } from "vitest";

/* ============================================================================
   גל 2, פריט 2.1 — הזרקת נוסחאות ביצוא CSV:
   תא טקסט שמתחיל ב־= + - @ נפתח באקסל כנוסחה. שמות שחקנים ומיקומים הם
   טקסט חופשי — חייבים לקבל קידומת גרש. מספרים (כולל נטו שלילי) נשארים
   מספרים ולא נפגעים.
   ============================================================================ */

import { sessionsToCsv, playersToCsv } from "../lib/poker/csvExport.js";

function dbOf(sessions) {
  return { aliases: {}, roster: [], yearly: [], sessions };
}

const base = { iso: "2026-08-01", d: 1, mo: 8, y: 2026 };

describe("CSV formula neutralization (wave 2.1)", () => {
  it("prefixes player names starting with =, +, -, @", () => {
    const csv = sessionsToCsv(
      dbOf([
        {
          ...base,
          location: "בית",
          entries: [
            { name: "=2+5", amount: 10, buyin: 50 },
            { name: "+972", amount: 10, buyin: 50 },
            { name: "-drop", amount: 10, buyin: 50 },
            { name: "@SUM(1+1)", amount: 10, buyin: 50 },
          ],
        },
      ])
    );
    expect(csv).toContain("'=2+5");
    expect(csv).toContain("'+972");
    expect(csv).toContain("'-drop");
    expect(csv).toContain("'@SUM(1+1)");
  });

  it("prefixes a formula hiding behind leading spaces, and a formula location", () => {
    const csv = sessionsToCsv(
      dbOf([
        {
          ...base,
          location: "@ערב-מיוחד",
          entries: [{ name: "  =cmd", amount: 10, buyin: 50 }],
        },
      ])
    );
    expect(csv).toContain("'  =cmd");
    expect(csv).toContain("'@ערב-מיוחד");
  });

  it("keeps negative numeric nets as plain numbers (no prefix)", () => {
    const csv = sessionsToCsv(
      dbOf([
        {
          ...base,
          location: "בית",
          entries: [{ name: "מפסיד", amount: -530, buyin: 600 }],
        },
      ])
    );
    expect(csv).toContain("מפסיד,-530,600");
    expect(csv).not.toContain("'-530");
  });

  it("still quotes a neutralized cell that contains a comma", () => {
    const csv = sessionsToCsv(
      dbOf([
        {
          ...base,
          location: "בית",
          entries: [{ name: "=a,b", amount: 10, buyin: 50 }],
        },
      ])
    );
    expect(csv).toContain("\"'=a,b\"");
  });

  it("prefixes names in the players summary export too", () => {
    const csv = playersToCsv(
      dbOf([
        {
          ...base,
          location: "בית",
          entries: [{ name: "=HYPERLINK(1)", amount: 10, buyin: 50 }],
        },
      ])
    );
    expect(csv).toContain("'=HYPERLINK(1)");
  });

  it("leaves ordinary Hebrew names untouched", () => {
    const csv = sessionsToCsv(
      dbOf([
        {
          ...base,
          location: "אצל עדן",
          entries: [{ name: "עדן גיל", amount: 40, buyin: 100 }],
        },
      ])
    );
    expect(csv).toContain("עדן גיל,40,100");
    expect(csv).not.toContain("'עדן");
  });
});
