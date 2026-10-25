/* תיקון עורך החלוקה — הכרעות עדן 25.10 (09:08):
   1. תקרת העברה בעריכה ידנית = min(חוב נותר של המעביר, זכאות נטו נותרת של
      המקבל) — אחרי קיזוז החוסר. העורך (LiveSettlementBuilder) עובד מעכשיו על
      יתרות נטו (editorBalancesWithPot), לא על הברוטו.
   2. זוגות נסגרים קודם גם במסלולים הידניים: רשימת הזוגות אוחדה למקור אחד
      (FILL_COUPLES — כל החמישה), וניתוב הקופה דרך עדן לא מפצל יותר העברת זוג.
   מקרה הבוחן: ערב 24.10 כפי שנשמר במסד (manualSettlement עם מפת החוסר). */
import { describe, it, expect } from "vitest";
import { settle, COUPLES } from "../lib/settlement";
import { FILL_COUPLES } from "../lib/poker/coupleFills.js";
import {
  routePotThroughEden,
  applyShortfallMap,
  editorBalancesWithPot,
  applyManualPayment,
  maxPayable,
  POT_SINK_NAME,
} from "../lib/manualSettlement.js";
import { paymentPlan } from "../lib/paymentTracking.js";
import { resolveSettlement, playersFromSession } from "../lib/nightShare.js";
import { settlementBasis } from "../lib/savedSettlement.js";

const NIGHT_2410 = {
  id: "live_1792879962020",
  iso: "2026-10-24",
  cps: 2,
  savings5: true,
  savingsPot: 93,
  savingsPotActual: 70,
  entries: [
    { name: "עדן גיל", buyin: 550, chips: 40 },
    { name: "אורן גיל", buyin: 100, chips: 840 },
    { name: "קובי סעדה", buyin: 400, chips: 0 },
    { name: "ירין מלאך", buyin: 150, chips: 300 },
    { name: "דן ינקלויץ", buyin: 150, chips: 500 },
    { name: "נתנאל כהן", buyin: 150, chips: 0 },
    { name: "דור לירז", buyin: 100, chips: 420 },
    { name: "אופיר סנה", buyin: 250, chips: 1530 },
  ],
};

function night2410WithManualMap() {
  const basis = settlementBasis(playersFromSession(NIGHT_2410), 2);
  return {
    ...NIGHT_2410,
    manualSettlement: {
      basis,
      manualPayments: [],
      shortfall: { "אופיר סנה": 35, "אורן גיל": 13, "דור לירז": 10 },
      settlementVersion: 2,
      settlementUpdatedAt: "2026-10-25T05:51:17.933Z",
    },
  };
}

function sums(transfers) {
  const got = Object.create(null);
  const gave = Object.create(null);
  for (const t of transfers) {
    if (t.fromSplit) {
      for (const [n, a] of Object.entries(t.fromSplit)) gave[n] = (gave[n] || 0) + a;
    } else {
      gave[t.from] = (gave[t.from] || 0) + t.amount;
    }
    got[t.to] = (got[t.to] || 0) + t.amount;
  }
  return { got, gave };
}

describe("איחוד רשימת הזוגות — מקור אחד (FILL_COUPLES)", () => {
  it("COUPLES של החלוקה נגזר מרשימת הזוגות המלאה", () => {
    expect(COUPLES).toEqual(FILL_COUPLES);
    expect(COUPLES).toHaveLength(5);
  });

  it("נתנאל↔אופיר: הכיסוי הזוגי קודם גם לנתנאל (AVOID_CASH_PAY)", () => {
    const { transfers } = settle(
      [
        { name: "נתנאל כהן", buyin: 150, cashout: "0" }, // -150
        { name: "אופיר סנה", buyin: 0, cashout: "480" }, // +480
        { name: "קובי סעדה", buyin: 330, cashout: "0" }, // -330
      ],
      1
    );
    expect(transfers[0]).toMatchObject({ from: "נתנאל כהן", to: "אופיר סנה", amount: 150, pair: true });
    expect(transfers[1]).toMatchObject({ from: "קובי סעדה", to: "אופיר סנה", amount: 330 });
  });

  it("שגיא↔דוד בני ואיציק↔ירדן נסגרים קודם כזוג", () => {
    const { transfers } = settle(
      [
        { name: "שגיא גיל", buyin: 100, cashout: "0" }, // -100
        { name: "דוד בני גיל", buyin: 0, cashout: "60" }, // +60
        { name: "איציק תפילין", buyin: 110, cashout: "0" }, // -110
        { name: "ירדן תפילין", buyin: 0, cashout: "70" }, // +70
        { name: "קובי סעדה", buyin: 0, cashout: "80" }, // +80
      ],
      1
    );
    expect(transfers).toContainEqual(
      expect.objectContaining({ from: "שגיא גיל", to: "דוד בני גיל", amount: 60, pair: true })
    );
    expect(transfers).toContainEqual(
      expect.objectContaining({ from: "איציק תפילין", to: "ירדן תפילין", amount: 70, pair: true })
    );
    // בני הזוג לא משלמים החוצה לפני שהכיסוי הפנימי נסגר
    const sagivOut = transfers.filter((t) => t.from === "שגיא גיל");
    expect(sagivOut[0]).toMatchObject({ to: "דוד בני גיל", pair: true });
    const itzikOut = transfers.filter((t) => t.from === "איציק תפילין");
    expect(itzikOut[0]).toMatchObject({ to: "ירדן תפילין", pair: true });
  });
});

describe("ניתוב הקופה דרך עדן — העברת זוג מוגנת", () => {
  it("לא מפצל את עדן→אורן; הקופה מנותבת מההעברות הרגילות של עדן", () => {
    const transfers = [
      { from: "עדן גיל", to: "אורן גיל", amount: 307, pair: true },
      { from: "עדן גיל", to: "דן ינקלויץ", amount: 100 },
      { from: "עדן גיל", to: POT_SINK_NAME, amount: 23 },
      { from: "קובי סעדה", to: POT_SINK_NAME, amount: 70 },
    ];
    const { transfers: out, edenPotBurden } = routePotThroughEden(transfers, "עדן גיל", POT_SINK_NAME);
    const edenOren = out.filter((t) => t.from === "עדן גיל" && t.to === "אורן גיל");
    expect(edenOren).toEqual([{ from: "עדן גיל", to: "אורן גיל", amount: 307, pair: true }]);
    const edenPot = out.filter((t) => t.from === "עדן גיל" && t.to === POT_SINK_NAME);
    expect(edenPot.reduce((s, t) => s + t.amount, 0)).toBe(93);
    expect(out.filter((t) => t.from === "קובי סעדה" && t.to === POT_SINK_NAME)).toHaveLength(0);
    expect(out).toContainEqual(expect.objectContaining({ from: "קובי סעדה", to: "דן ינקלויץ", amount: 70 }));
    expect(edenPotBurden).toBe(70);
  });
});

describe("ערב 24.10 (manualSettlement שמור) — זוגות נסגרים קודם במסלול הידני", () => {
  it("עדן→אורן 307 במלואה וראשונה; נתנאל→אופיר 150 כזוג; עדן 437 לזוכים + 70 לקופה (בפועל — R3)", () => {
    const session = night2410WithManualMap();
    const plan = paymentPlan(session);
    expect(plan.problems).toEqual([]);
    const t = plan.transfers;
    // עדן→אורן: העברה אחת, מלאה, זוגית — ואין שום העברה אחרת לאורן
    const toOren = t.filter((x) => x.to === "אורן גיל");
    expect(toOren).toEqual([
      expect.objectContaining({ from: "עדן גיל", to: "אורן גיל", amount: 307, pair: true }),
    ]);
    expect(t.findIndex((x) => x.from === "עדן גיל")).toBe(t.indexOf(toOren[0]));
    // נתנאל↔אופיר: כל ה־150 של נתנאל נסגרים מול אופיר כהעברת זוג יחידה
    const netanelOut = t.filter((x) => x.from === "נתנאל כהן");
    expect(netanelOut).toEqual([
      expect.objectContaining({ from: "נתנאל כהן", to: "אופיר סנה", amount: 150, pair: true }),
    ]);
    // הסכומים האישיים בדיוק כמו בהכרעת עדן; הקופה אינה ברשימת ההעברות
    // הקנונית — היא חוזרת כ־potTransfer, ובפועל (70) כי savingsPotActual נערך
    const { got, gave } = sums(t);
    expect(got["אופיר סנה"]).toBe(480);
    expect(got["אורן גיל"]).toBe(307);
    expect(got["דור לירז"]).toBe(100);
    expect(got["דן ינקלויץ"]).toBe(100);
    expect(got[POT_SINK_NAME]).toBeUndefined();
    expect(plan.potTransfer).toEqual(
      expect.objectContaining({ from: "עדן גיל", to: POT_SINK_NAME, amount: 70, pot: true })
    );
    expect(gave["עדן גיל"]).toBe(437);
    // הפרש הרשום־בפועל (23) נשאר כעודף פנימי ב־resolver — לא העברה לשחקן
    const residual = resolveSettlement(session).transfers.filter((x) => x.residual);
    expect(residual.reduce((s, x) => s + x.amount, 0)).toBe(23);
  });

  it("עקביות צופה (R1+R3+R4): בלי שדות הקופה מתקבלת אותה תוכנית שחקנים ואותו fingerprint", () => {
    const admin = night2410WithManualMap();
    // כך הערב נראה בנתוני הציבור: ה־SQL מסיר savingsPot, והצופה לא מקבל
    // את savingsPotActual (R4). נשאר savings5 — הרשום מחושב מ־5% מהקניות.
    const viewer = { ...admin, savingsPot: undefined, savingsPotActual: undefined };
    const adminPlan = paymentPlan(admin);
    const viewerPlan = paymentPlan(viewer);
    expect(viewerPlan.transfers).toEqual(adminPlan.transfers);
    expect(viewerPlan.fingerprint).toBe(adminPlan.fingerprint);
    // רק המנהל רואה את העברת הקופה, ובסכום הבפועל; אצל הצופה היא כלל לא
    // חלק מהתוכנית הקנונית (transfers), ולכן גם לא מהספירה ומהסימונים.
    expect(adminPlan.potTransfer?.amount).toBe(70);
    expect(viewerPlan.transfers.some((t) => t.pot)).toBe(false);
  });

  it("גם במסלול האוטומטי (בלי manualSettlement) נתנאל→אופיר היא העברת זוג", () => {
    const plan = paymentPlan(NIGHT_2410);
    expect(plan.transfers).toContainEqual(
      expect.objectContaining({ from: "נתנאל כהן", to: "אופיר סנה", amount: 150, pair: true })
    );
  });
});

describe("תקרת העברה בעורך — זכאות נטו אחרי חוסר", () => {
  const players = playersFromSession(NIGHT_2410);
  const MAP = { "אופיר סנה": 35, "אורן גיל": 13, "דור לירז": 10 };

  it("עם מפת החוסר השמורה: יתרות העורך הן הנטו (אופיר 480, אורן 307)", () => {
    const opening = editorBalancesWithPot(players, 2, 93, POT_SINK_NAME, { shortfallMap: MAP });
    expect(opening.shortfall).toBe(58);
    expect(opening.balances["אופיר סנה"]).toBe(480);
    expect(opening.balances["אורן גיל"]).toBe(307);
    expect(opening.balances["דור לירז"]).toBe(100);
    expect(opening.balances["דן ינקלויץ"]).toBe(100);
    expect(opening.balances[POT_SINK_NAME]).toBe(93); // הקופה לא נחתכת
    expect(opening.balances["עדן גיל"]).toBe(-530);
  });

  it("התקרה היא min(חוב, זכאות נטו) — אי אפשר לרשום מעבר לזכאות", () => {
    const { balances } = editorBalancesWithPot(players, 2, 93, POT_SINK_NAME, { shortfallMap: MAP });
    expect(maxPayable(balances, "עדן גיל", "אופיר סנה")).toBe(480);
    expect(maxPayable(balances, "עדן גיל", "אורן גיל")).toBe(307);
    // הברוטו (515) נחסם — זו בדיוק התלונה של עדן
    expect(() =>
      applyManualPayment(balances, { from: "עדן גיל", to: "אופיר סנה", amount: 515 })
    ).toThrow(/מגיע לאופיר סנה/);
    // הנטו המלא עובר, ואחריו המקבל סגור
    const after = applyManualPayment(balances, { from: "עדן גיל", to: "אופיר סנה", amount: 480 });
    expect(maxPayable(after, "קובי סעדה", "אופיר סנה")).toBe(0);
    expect(() =>
      applyManualPayment(after, { from: "קובי סעדה", to: "אופיר סנה", amount: 1 })
    ).toThrow(/לא אמור לקבל/);
  });

  it("התקרה מצטברת: שתי העברות לאותו מקבל לא עוברות יחד את הזכאות", () => {
    const { balances } = editorBalancesWithPot(players, 2, 93, POT_SINK_NAME, { shortfallMap: MAP });
    const step1 = applyManualPayment(balances, { from: "עדן גיל", to: "אורן גיל", amount: 200 });
    expect(maxPayable(step1, "עדן גיל", "אורן גיל")).toBe(107);
    expect(() =>
      applyManualPayment(step1, { from: "עדן גיל", to: "אורן גיל", amount: 200 })
    ).toThrow(/מגיע לאורן גיל/);
  });

  it("בלי מפה שמורה: החלוקה האוטומטית קובעת את הזכאויות בעורך (יחסית, קופה מוגנת)", () => {
    const { balances } = editorBalancesWithPot(players, 2, 93, POT_SINK_NAME, {});
    // חלוקת 58 יחסית כמו במסלול האוטומטי: אופיר 29, אורן 18, דור 6, דן 5
    expect(balances["אופיר סנה"]).toBe(486);
    expect(balances["אורן גיל"]).toBe(302);
    expect(balances["דור לירז"]).toBe(104);
    expect(balances["דן ינקלויץ"]).toBe(95);
    expect(balances[POT_SINK_NAME]).toBe(93);
    expect(maxPayable(balances, "עדן גיל", "אופיר סנה")).toBe(486);
  });

  it("applyShortfallMap: הכיור מוגן, קיצוץ נחתם ב־0, חייבים לא נגעים", () => {
    const out = applyShortfallMap(
      { "אופיר סנה": 100, "עדן גיל": -50, [POT_SINK_NAME]: 93 },
      { "אופיר סנה": 250, "עדן גיל": 10, [POT_SINK_NAME]: 40 },
      POT_SINK_NAME
    );
    expect(out["אופיר סנה"]).toBe(0);
    expect(out["עדן גיל"]).toBe(-50);
    expect(out[POT_SINK_NAME]).toBe(93);
  });
});
