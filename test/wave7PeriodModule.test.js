/* גל 7, פריט 7.2 — בדיקות יחידה ישירות למודול התקופה הקנוני
   (lib/poker/period.js): מפתחות, תוויות, פירוק דו־פורמטי, וקורא
   חותמות sentReports שמקבל את שני הפורמטים וכותב רק קנוני. */
import { describe, expect, it } from "vitest";
import {
  isReportSent,
  legacyAppKey,
  parseReportKey,
  periodKey,
  periodLabel,
} from "../lib/poker/period.js";
import { MONTHS } from "../lib/summary.js";

describe("גל 7 · 7.2 — מפתחות ותוויות קנוניים", () => {
  it("periodKey בפורמט השרת, מרופד", () => {
    expect(periodKey({ kind: "m", y: 2026, mo: 9 })).toBe("m:2026-09");
    expect(periodKey({ kind: "m", y: 2026, mo: 10 })).toBe("m:2026-10");
    expect(periodKey({ kind: "q", y: 2026, q: 4 })).toBe("q:2026-Q4");
    expect(periodKey({ kind: "h", y: 2026, h: 2 })).toBe("h:2026-H2");
    expect(periodKey({ kind: "y", y: 2026 })).toBe("y:2026");
  });

  it("periodLabel זהה לכותרות הדוח ההיסטוריות", () => {
    expect(periodLabel({ kind: "m", y: 2026, mo: 10 }, MONTHS)).toBe("סיכום אוקטובר 2026");
    expect(periodLabel({ kind: "q", y: 2026, q: 3 }, MONTHS)).toBe("סיכום רבעון 3 · 2026");
    expect(periodLabel({ kind: "h", y: 2026, h: 1 }, MONTHS)).toBe("סיכום חצי שנה · ינואר–יוני 2026");
    expect(periodLabel({ kind: "h", y: 2026, h: 2 }, MONTHS)).toBe("סיכום חצי שנה · יולי–דצמבר 2026");
    expect(periodLabel({ kind: "y", y: 2026 }, MONTHS)).toBe("סיכום שנת 2026");
  });

  it("legacyAppKey — פורמט האפליקציה הישן (לא־מרופד, בלי קידומת)", () => {
    expect(legacyAppKey({ kind: "m", y: 2026, mo: 9 })).toBe("2026-9");
    expect(legacyAppKey({ kind: "m", y: 2026, mo: 10 })).toBe("2026-10");
    expect(legacyAppKey({ kind: "q", y: 2026, q: 4 })).toBe("2026-Q4");
    expect(legacyAppKey({ kind: "h", y: 2026, h: 2 })).toBe("2026-H2");
    expect(legacyAppKey({ kind: "y", y: 2026 })).toBe("2026");
  });
});

describe("גל 7 · 7.2 — parseReportKey דו־פורמטי", () => {
  it("מפרק את הפורמט הקנוני", () => {
    expect(parseReportKey("m:2026-09")).toEqual({ kind: "m", y: 2026, mo: 9 });
    expect(parseReportKey("q:2026-Q4")).toEqual({ kind: "q", y: 2026, q: 4 });
    expect(parseReportKey("h:2026-H2")).toEqual({ kind: "h", y: 2026, h: 2 });
    expect(parseReportKey("y:2026")).toEqual({ kind: "y", y: 2026 });
  });

  it("מפרק את פורמט האפליקציה הישן", () => {
    expect(parseReportKey("2026-9")).toEqual({ kind: "m", y: 2026, mo: 9 });
    expect(parseReportKey("2026-10")).toEqual({ kind: "m", y: 2026, mo: 10 });
    expect(parseReportKey("2026-Q4")).toEqual({ kind: "q", y: 2026, q: 4 });
    expect(parseReportKey("2026-H2")).toEqual({ kind: "h", y: 2026, h: 2 });
    expect(parseReportKey("2026")).toEqual({ kind: "y", y: 2026 });
  });

  it("דוחה מפתחות לא־תקפים", () => {
    expect(parseReportKey("m:2026-13")).toBeNull();
    expect(parseReportKey("q:2026-Q5")).toBeNull();
    expect(parseReportKey("2026-13")).toBeNull();
    expect(parseReportKey("garbage")).toBeNull();
    expect(parseReportKey("")).toBeNull();
    expect(parseReportKey(null)).toBeNull();
    expect(parseReportKey(2026)).toBeNull();
  });

  it("סיבוב מלא: parse(periodKey(p)) מחזיר את p", () => {
    for (const p of [
      { kind: "m", y: 2026, mo: 1 },
      { kind: "m", y: 2025, mo: 12 },
      { kind: "q", y: 2026, q: 2 },
      { kind: "h", y: 2026, h: 1 },
      { kind: "y", y: 2024 },
    ]) {
      expect(parseReportKey(periodKey(p))).toEqual(p);
      expect(parseReportKey(legacyAppKey(p))).toEqual(p);
    }
  });
});

describe("גל 7 · 7.2 — isReportSent: קורא דו־פורמטי", () => {
  const rep = { kind: "m", y: 2026, mo: 9 };

  it("חותמת קנונית חוסמת", () => {
    expect(isReportSent({ "m:2026-09": true }, rep)).toBe(true);
  });

  it("חותמת מורשת (פורמט אפליקציה) חוסמת — אפס כפילויות במעבר", () => {
    expect(isReportSent({ "2026-9": true }, rep)).toBe(true);
  });

  it("אין חותמת — לא נשלח", () => {
    expect(isReportSent({}, rep)).toBe(false);
    expect(isReportSent({ "m:2026-10": true }, rep)).toBe(false);
    expect(isReportSent({ "2026-10": true }, rep)).toBe(false);
  });

  it("מפה חסרה/לא־אובייקט — לא נשלח, בלי קריסה", () => {
    expect(isReportSent(null, rep)).toBe(false);
    expect(isReportSent(undefined, rep)).toBe(false);
    expect(isReportSent("x", rep)).toBe(false);
  });

  it("ערך שקר (false) לא נחשב חותמת", () => {
    expect(isReportSent({ "m:2026-09": false, "2026-9": false }, rep)).toBe(false);
  });

  it("כל הסוגים נקראים בשני הפורמטים", () => {
    expect(isReportSent({ "q:2026-Q3": 1 }, { kind: "q", y: 2026, q: 3 })).toBe(true);
    expect(isReportSent({ "2026-Q3": 1 }, { kind: "q", y: 2026, q: 3 })).toBe(true);
    expect(isReportSent({ "h:2026-H1": 1 }, { kind: "h", y: 2026, h: 1 })).toBe(true);
    expect(isReportSent({ "2026-H1": 1 }, { kind: "h", y: 2026, h: 1 })).toBe(true);
    expect(isReportSent({ "y:2026": 1 }, { kind: "y", y: 2026 })).toBe(true);
    expect(isReportSent({ "2026": 1 }, { kind: "y", y: 2026 })).toBe(true);
  });
});
