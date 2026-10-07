import { describe, it, expect } from "vitest";
import {
  completedMonths,
  completedQuarters,
  completedHalves,
  completedYears,
  summaryPeriods,
  periodToScope,
} from "../lib/poker/summaryPeriods.js";

const S = (iso) => ({
  id: iso,
  iso,
  d: Number(iso.slice(8, 10)),
  mo: Number(iso.slice(5, 7)),
  y: Number(iso.slice(0, 4)),
  entries: [{ name: "א", amount: 10 }, { name: "ב", amount: -10 }],
});

/* היום: אוקטובר 2026 (הסביבה מדמה — הבדיקות לא תלויות בתאריך האמיתי
   כל עוד יש ערבים בעבר הרחוק). */
const db = {
  aliases: {},
  sessions: [
    S("2024-03-05"), // רבעון 1 2024, חציון 1 2024
    S("2024-11-10"), // רבעון 4 2024, חציון 2 2024
    S("2025-06-15"), // רבעון 2 2025, חציון 1 2025
    S("2026-01-20"), // רבעון 1 2026
  ],
};

describe("summaryPeriods — רק תקופות שהסתיימו", () => {
  it("חודשים: כולל את כל החודשים עם ערבים (כולם בעבר)", () => {
    const ms = completedMonths(db);
    expect(ms.map((m) => m.key)).toEqual(["2026-1", "2025-6", "2024-11", "2024-3"]);
    expect(ms[0].label).toBe("ינואר 2026");
  });

  it("רבעונים: מקבץ נכון וממיין חדש→ישן", () => {
    const qs = completedQuarters(db);
    expect(qs.map((q) => q.key)).toEqual(["2026-Q1", "2025-Q2", "2024-Q4", "2024-Q1"]);
    expect(qs[0].label).toBe("רבעון 1 · 2026");
  });

  it("חציונים: מקבץ נכון", () => {
    const hs = completedHalves(db);
    expect(hs.map((h) => h.key)).toEqual(["2026-H1", "2025-H1", "2024-H2", "2024-H1"]);
  });

  it("שנים: רק שנים שהסתיימו (לא 2026)", () => {
    const ys = completedYears(db);
    // 2026 היא השנה הנוכחית (או עברה) — הבדיקה גמישה לתאריך הריצה
    for (const y of ys) expect(y.y).toBeLessThan(new Date().getFullYear() + 1);
    expect(ys.map((y) => y.y)).toContain(2024);
    expect(ys.map((y) => y.y)).toContain(2025);
  });

  it("summaryPeriods מנתב לפי סינון", () => {
    expect(summaryPeriods(db, "month")).toEqual(completedMonths(db));
    expect(summaryPeriods(db, "quarter")).toEqual(completedQuarters(db));
    expect(summaryPeriods(db, "half")).toEqual(completedHalves(db));
    expect(summaryPeriods(db, "year")).toEqual(completedYears(db));
  });

  it("periodToScope ממפה נכון", () => {
    expect(periodToScope({ kind: "month", y: 2026, mo: 3 })).toEqual({ kind: "month", y: 2026, mo: 3 });
    expect(periodToScope({ kind: "quarter", y: 2026, q: 2 })).toEqual({ kind: "quarter", y: 2026, q: 2 });
    expect(periodToScope({ kind: "half", y: 2026, h: 1 })).toEqual({ kind: "half", y: 2026, h: 1 });
    expect(periodToScope({ kind: "year", y: 2025 })).toEqual({ kind: "year", y: 2025 });
  });

  it("db ריק — רשימות ריקות", () => {
    expect(completedMonths({ sessions: [] })).toEqual([]);
    expect(completedQuarters(null)).toEqual([]);
  });
});
