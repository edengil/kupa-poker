/* A(b) — בדיקות הגנה למסלול מחיקת ה־manualSettlement ב־withActual
   (PotDashboard) כש־frozenActual קיים:
   • המסלול מוחק חלוקה שמורה רק כשהיא המפה הקפואה האוטומטית, ורק כשמוחקים
     את ה«בפועל» — שחרור מכוון חזרה לחישוב האוטומטי.
   • חלוקה שעדן שמר בעצמו (בלי frozenActual) לעולם לא נמחקת בעריכת בפועל.
   • עדכון בפועל על מפה קפואה נוגע רק ב־frozenActual — שאר החלוקה נשמרת.
   גל 2, ממצא 8: עריכת בפועל על חלוקה אמיתית בלי frozenActual מקפיאה
   אותה (frozenReal + מפת הרשום) במקום להשאיר אותה חשופה לפער
   מנהל/צופה; מחיקת הבפועל משחררת רק את סימון ההקפאה. */
import { describe, it, expect } from "vitest";
import { withActual } from "../components/poker/PotDashboard.jsx";
import { NIGHT_24_10 } from "./fixtures/night-2026-10-24.js";
import {
  resolveSettlement,
  POT_SINK_NAME,
  RESIDUAL_SINK_NAME,
} from "../lib/nightShare.js";
import { snapshotForViewer } from "../lib/publicShare.js";

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

  it("חלוקה שעדן שמר בעצמו (בלי frozenActual) לא נמחקת בעריכת בפועל — היא מוקפאת (ממצא 8)", () => {
    // ה־manualSettlement של הפיקסצ'ר הוא חלוקה שמורה רגילה — אין בה frozenActual
    expect(NIGHT_24_10.manualSettlement.frozenActual).toBeUndefined();
    const cleared = withActual(NIGHT_24_10, 0);
    expect(cleared.manualSettlement).toEqual(NIGHT_24_10.manualSettlement);
    const set = withActual(NIGHT_24_10, 55);
    expect(set.savingsPotActual).toBe(55);
    // החלוקה עצמה נשמרת (בסיס/תשלומים/העדפות), ונוספים רק סימוני ההקפאה
    expect(set.manualSettlement.basis).toBe(NIGHT_24_10.manualSettlement.basis);
    expect(set.manualSettlement.manualPayments).toEqual(
      NIGHT_24_10.manualSettlement.manualPayments
    );
    expect(set.manualSettlement.preferCreditors).toEqual(
      NIGHT_24_10.manualSettlement.preferCreditors
    );
    expect(set.manualSettlement.frozenActual).toBe(55);
    expect(set.manualSettlement.frozenReal).toBe(true);
    // המפה של 24.10 כבר מלאה — ההקפאה משאירה אותה בדיוק כמו שהיא
    expect(set.manualSettlement.shortfall).toEqual(
      NIGHT_24_10.manualSettlement.shortfall
    );
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

describe("withActual — פער מנהל/צופה עם חלוקה ידנית בלי מפה (ממצא 8)", () => {
  /* שחזור הביקורת על נתוני 24.10: אותה חלוקה ידנית, אבל עם מפת חוסר
     ריקה ותשלום ידני אחד. הביקורת מדדה מנהל 309/498/106/97 מול צופה
     302/486/104/95 (אורן/אופיר/דור/דן) כשהבפועל 70 והרשום 93. */
  const EMPTY_MAP_SESSION = {
    ...NIGHT_24_10,
    savingsPotActual: undefined,
    manualSettlement: {
      basis: NIGHT_24_10.manualSettlement.basis,
      manualPayments: [{ from: "נתנאל כהן", to: "אופיר סנה", amount: 150 }],
      preferCreditors: [],
      settlementVersion: 2,
      settlementUpdatedAt: "2026-10-25T05:51:17.933Z",
    },
  };
  const receivedByPlayer = (session) => {
    const got = {};
    for (const t of resolveSettlement(session).transfers || []) {
      if (!t.to || t.to === POT_SINK_NAME || t.to === RESIDUAL_SINK_NAME) continue;
      got[t.to] = (got[t.to] || 0) + t.amount;
    }
    return got;
  };
  const viewerOf = (session) =>
    snapshotForViewer({ config: {}, data: { sessions: [session] } }).data.sessions[0];

  it("בלי הקפאה: עריכת בפועל ישירה מזיזה סכומי שחקנים בין מנהל לצופה (הבאג)", () => {
    const raw = { ...EMPTY_MAP_SESSION, savingsPotActual: 70 };
    const admin = receivedByPlayer(raw);
    const viewer = receivedByPlayer(viewerOf(raw));
    expect(admin).not.toEqual(viewer);
    // המספרים המדויקים של הביקורת (לפי שם)
    expect(admin["אורן גיל"]).toBe(309);
    expect(admin["אופיר סנה"]).toBe(498);
    expect(viewer["אורן גיל"]).toBe(302);
    expect(viewer["אופיר סנה"]).toBe(486);
  });

  it("אחרי withActual: מנהל וצופה מקבלים אותם סכומי שחקנים, ושורת הקופה היא הבפועל", () => {
    const out = withActual(EMPTY_MAP_SESSION, 70);
    expect(out.manualSettlement.frozenActual).toBe(70);
    expect(out.manualSettlement.frozenReal).toBe(true);
    expect(out.manualSettlement.manualPayments).toEqual(
      EMPTY_MAP_SESSION.manualSettlement.manualPayments
    );
    expect(Object.keys(out.manualSettlement.shortfall).length).toBeGreaterThan(0);
    expect(receivedByPlayer(out)).toEqual(receivedByPlayer(viewerOf(out)));
    const potTotal = (resolveSettlement(out).transfers || [])
      .filter((t) => t.to === POT_SINK_NAME)
      .reduce((s, t) => s + t.amount, 0);
    expect(potTotal).toBe(70);
  });

  it("מחיקת הבפועל אחרי הקפאת חלוקה אמיתית שומרת את החלוקה ואת סכומי השחקנים", () => {
    const frozen = withActual(EMPTY_MAP_SESSION, 70);
    const cleared = withActual(frozen, 0);
    expect(cleared.savingsPotActual).toBeUndefined();
    expect(cleared.manualSettlement).toBeTruthy();
    expect(cleared.manualSettlement.frozenActual).toBeUndefined();
    expect(cleared.manualSettlement.frozenReal).toBeUndefined();
    expect(cleared.manualSettlement.manualPayments).toEqual(
      EMPTY_MAP_SESSION.manualSettlement.manualPayments
    );
    expect(receivedByPlayer(cleared)).toEqual(receivedByPlayer(frozen));
  });
});
