/* גל 7, פריט 7.2 — פיקסצ'רות הזהב של איחוד התקופה.
   הצילומים בקבצים before-*.json/txt נלכדו מהקוד שלפני האיחוד (גל 6,
   קומיט 316b753 + 7.1) על אותם ערבים בדיוק (26.9 + 24.10 + כינוי
   משתמש). הבדיקה מריצה את הקוד הנוכחי על אותם נתונים ותובעת זהות
   מלאה: טקסט דוח הוואטסאפ בייט־בייט, ומבני האפליקציה (תקופות,
   סכומים, כרטיסים) ב־deep-equal. כל סטייה = שינוי פלט שהמשתמש רואה
   = כשל. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildPeriodReport, dueReports } from "../lib/summary.js";
import { periodTotals } from "../lib/poker/totals.js";
import { summaryCardData } from "../lib/poker/summaryCard.js";
import {
  completedMonths,
  completedQuarters,
  completedHalves,
  completedYears,
} from "../lib/poker/summaryPeriods.ts";
import { effectiveReportAliases } from "../lib/poker/period.js";
import { NIGHT_24_10 } from "./fixtures/night-2026-10-24.js";
import { NIGHT_26_9 } from "./fixtures/night-2026-09-26.js";

const GOLD = new URL("../../workspace/goals/goal-19/hidden_files/wave7-golden/", `file://${process.cwd()}/`);
const read = (name) => readFileSync(new URL(name, GOLD), "utf8");

export const GOLDEN_DB = {
  aliases: { קובי: "קובי סעדה" },
  sessions: [NIGHT_26_9, NIGHT_24_10],
  yearly: [],
  monthly: [],
  roster: [],
};

const REPS = [
  { kind: "m", y: 2026, mo: 9, key: "m:2026-09" },
  { kind: "m", y: 2026, mo: 10, key: "m:2026-10" },
  { kind: "q", y: 2026, q: 3, key: "q:2026-Q3" },
  { kind: "q", y: 2026, q: 4, key: "q:2026-Q4" },
  { kind: "h", y: 2026, h: 2, key: "h:2026-H2" },
  { kind: "y", y: 2026, key: "y:2026" },
];

describe("גל 7 · 7.2 — זהב: דוחות וואטסאפ תקופתיים זהים בייטית", () => {
  for (const rep of REPS) {
    it(`דוח ${rep.key} זהה לצילום שלפני האיחוד`, () => {
      const before = read(`before-report-${rep.key.replace(":", "_")}.txt`);
      const now = buildPeriodReport(GOLDEN_DB, rep) ?? "<null>";
      expect(now).toBe(before);
    });
  }

  it("dueReports זהה על תאריכים מייצגים (כולל force)", () => {
    const before = JSON.parse(read("before-dueReports.json"));
    const cases = {
      "2026-11-02": new Date(2026, 10, 2),
      "2027-01-15": new Date(2027, 0, 15),
      "2026-07-11": new Date(2026, 6, 11),
    };
    const now = {};
    for (const [label, d] of Object.entries(cases)) {
      now[label] = dueReports(d);
      now[`${label}/force-m`] = dueReports(d, "m");
    }
    expect(now).toEqual(before);
  });
});

describe("גל 7 · 7.2 — זהב: צד האפליקציה זהה", () => {
  it("רשימות תקופות + periodTotals + כרטיסים — deep-equal לצילום", () => {
    const before = JSON.parse(read("before-app.json"));
    const now = {
      months: completedMonths(GOLDEN_DB),
      quarters: completedQuarters(GOLDEN_DB),
      halves: completedHalves(GOLDEN_DB),
      years: completedYears(GOLDEN_DB),
      totals: {
        "month 2026-9": periodTotals(GOLDEN_DB, "month", 2026, 9),
        "month 2026-10": periodTotals(GOLDEN_DB, "month", 2026, 10),
        "quarter 2026-3": periodTotals(GOLDEN_DB, "quarter", 2026, null, 3),
        "quarter 2026-4": periodTotals(GOLDEN_DB, "quarter", 2026, null, 4),
        "half 2026-2": periodTotals(GOLDEN_DB, "half", 2026, null, 2),
        "year 2026": periodTotals(GOLDEN_DB, "year", 2026),
        all: periodTotals(GOLDEN_DB, "all"),
      },
      cards: {
        month9: summaryCardData(GOLDEN_DB, { kind: "month", y: 2026, mo: 9 }),
        month10: summaryCardData(GOLDEN_DB, { kind: "month", y: 2026, mo: 10 }),
        q3: summaryCardData(GOLDEN_DB, { kind: "quarter", y: 2026, q: 3 }),
        q4: summaryCardData(GOLDEN_DB, { kind: "quarter", y: 2026, q: 4 }),
        h2: summaryCardData(GOLDEN_DB, { kind: "half", y: 2026, h: 2 }),
        year: summaryCardData(GOLDEN_DB, { kind: "year", y: 2026 }),
      },
    };
    expect(now).toEqual(before);
  });
});

describe("גל 7 · 7.2 — כינויים אפקטיביים של הדוח (החלפת reportAliases)", () => {
  it("ברירת־המחדל קובעת, תוספת משתמש נשמרת — כמו AL של האפליקציה", () => {
    const eff = effectiveReportAliases({ קובי: "אחר", חדש: "חדש מלא" });
    expect(eff["קובי"]).toBe("קובי סעדה"); // מהמפה האחת, לא מהמשתמש
    expect(eff["חדש"]).toBe("חדש מלא");
    expect(eff["אופיר"]).toBe("אופיר סנה");
  });

  it("בלי כינויי משתמש — המפה האחת כמו שהיא", () => {
    const eff = effectiveReportAliases(undefined);
    expect(eff["דן"]).toBe("דן ינקלויץ");
    expect(Object.keys(eff).length).toBeGreaterThan(30);
  });
});
