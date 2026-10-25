/* A(b) — בדיקות הגנה למסלול מחיקת ה־manualSettlement ב־withActual
   (PotDashboard) כש־frozenActual קיים:
   • המסלול מוחק חלוקה שמורה רק כשהיא המפה הקפואה האוטומטית, ורק כשמוחקים
     את ה«בפועל» — שחרור מכוון חזרה לחישוב האוטומטי.
   • חלוקה שעדן שמר בעצמו (בלי frozenActual) לעולם לא נמחקת בעריכת בפועל.
   • עדכון בפועל על מפה קפואה נוגע רק ב־frozenActual — שאר החלוקה נשמרת. */
import { describe, it, expect } from "vitest";
import { withActual } from "../components/poker/PotDashboard.jsx";
import { NIGHT_24_10 } from "./fixtures/night-2026-10-24.js";

const FROZEN_MS = {
  basis: NIGHT_24_10.manualSettlement.basis,
  manualPayments: [],
  preferCreditors: [],
  shortfall: { "אופיר סנה": 35, "אורן גיל": 13, "דור לירז": 10 },
  frozenActual: 70,
  settlementVersion: 2,
  settlementUpdatedAt: "2026-10-25T00:00:00.000Z",
};

describe("withActual — הגנת מסלול המחיקה", () => {
  it("מחיקת הבפועל על מפה קפואה משחררת את ה־manualSettlement כולו (חזרה לאוטומטי)", () => {
    const session = { ...NIGHT_24_10, manualSettlement: FROZEN_MS };
    const out = withActual(session, 0);
    expect("manualSettlement" in out).toBe(false);
    expect(out.savingsPotActual).toBeUndefined();
    // שאר הערב לא נפגע
    expect(out.entries).toEqual(session.entries);
    expect(out.savingsPot).toBe(93);
  });

  it("עדכון הבפועל על מפה קפואה משנה רק את frozenActual — המפה והתשלומים נשמרים", () => {
    const session = { ...NIGHT_24_10, manualSettlement: FROZEN_MS };
    const out = withActual(session, 55);
    expect(out.savingsPotActual).toBe(55);
    expect(out.manualSettlement).toEqual({ ...FROZEN_MS, frozenActual: 55 });
  });

  it("חלוקה שעדן שמר בעצמו (בלי frozenActual) לא נמחקת ולא משתנה בעריכת בפועל", () => {
    // ה־manualSettlement של הפיקסצ'ר הוא חלוקה שמורה רגילה — אין בה frozenActual
    expect(NIGHT_24_10.manualSettlement.frozenActual).toBeUndefined();
    const cleared = withActual(NIGHT_24_10, 0);
    expect(cleared.manualSettlement).toEqual(NIGHT_24_10.manualSettlement);
    const set = withActual(NIGHT_24_10, 55);
    expect(set.manualSettlement).toEqual(NIGHT_24_10.manualSettlement);
    expect(set.savingsPotActual).toBe(55);
  });

  it("אחרי שמירת עורך (frozenActual כבר לא קיים) מחיקת הבפועל שומרת את החלוקה", () => {
    // saveManualPayments כותב manualSettlement מחדש בלי frozenActual; מאותו
    // רגע מסלול המחיקה סגור — גם אם המפה זהה למפה שהוקפאה קודם.
    const afterEditorSave = {
      ...NIGHT_24_10,
      manualSettlement: {
        basis: NIGHT_24_10.manualSettlement.basis,
        manualPayments: [{ from: "קובי סעדה", to: "אופיר סנה", amount: 100 }],
        preferCreditors: [],
        shortfall: { "אופיר סנה": 35, "אורן גיל": 13, "דור לירז": 10 },
        settlementVersion: 3,
        settlementUpdatedAt: "2026-10-25T01:00:00.000Z",
      },
    };
    const out = withActual(afterEditorSave, 0);
    expect(out.manualSettlement).toEqual(afterEditorSave.manualSettlement);
  });
});
