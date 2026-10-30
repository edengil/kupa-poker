/* תשלום ידני לקופת החיסכון מתוך עורך החלוקה: העורך מציע את הקופה כמקבל
   ומאמת מול יתרות שכוללות את הכיור, אבל recordManualPayments (שכבת השמירה)
   אימת מול יתרות בלי קופה — וכל תשלום ידני לקופה נזרק עם
   "קופת חיסכון לא אמור לקבל יותר" והלך לאיבוד. הבדיקות נועלות שהוולידציה
   בשמירה זהה לזו של ה־resolver (נטו גולמי + כיור + מפת חוסר שמורה). */
import { describe, it, expect } from "vitest";
import { recordManualPayments, savedSettlement } from "../lib/savedSettlement.js";
import { saveManualPayments, paymentPlan } from "../lib/paymentTracking.js";
import { POT_SINK_NAME } from "../lib/manualSettlement.js";

/* כמו POT_NIGHT ב־potPlan.test.js, בצורת שחקני־חלוקה: עדן −280, אורן +100,
   דן +180, קופה 25 (cps=2) */
const PLAYERS = [
  { name: "עדן גיל", buyin: 300, cashout: "40" },
  { name: "אורן גיל", buyin: 100, cashout: "400" },
  { name: "דן ינקלויץ", buyin: 100, cashout: "560" },
];
const POT_OPTS = { potAmount: 25, potSinkName: POT_SINK_NAME };

const POT_NIGHT = {
  id: "live_pot_manual_test",
  iso: "2026-10-24",
  cps: 2,
  savings5: true,
  savingsPot: 25,
  entries: [
    { name: "עדן גיל", buyin: 300, chips: 40 },
    { name: "אורן גיל", buyin: 100, chips: 400 },
    { name: "דן ינקלויץ", buyin: 100, chips: 560 },
  ],
};

describe("recordManualPayments — ערבי קופה", () => {
  it("מקבל תשלום ידני לקופת החיסכון עד גובה הזכאות", () => {
    const recorded = recordManualPayments(PLAYERS, 2, [
      { from: "עדן גיל", to: POT_SINK_NAME, amount: 25 },
    ], POT_OPTS);
    expect(recorded.manualPayments).toEqual([
      { from: "עדן גיל", to: POT_SINK_NAME, amount: 25 },
    ]);
  });

  it("מקבל רצף תשלומים ידניים שכולל את הקופה", () => {
    const recorded = recordManualPayments(PLAYERS, 2, [
      { from: "עדן גיל", to: "אורן גיל", amount: 90 },
      { from: "עדן גיל", to: POT_SINK_NAME, amount: 25 },
    ], POT_OPTS);
    expect(recorded.manualPayments).toHaveLength(2);
  });

  it("דוחה תשלום לקופה מעבר לזכאותה", () => {
    expect(() =>
      recordManualPayments(PLAYERS, 2, [
        { from: "עדן גיל", to: POT_SINK_NAME, amount: 26 },
      ], POT_OPTS)
    ).toThrow("הסכום גדול ממה שמגיע");
  });

  it("בלי אפשרויות קופה (ערב רגיל) תשלום לכיור עדיין נדחה — ההתנהגות הישנה נשמרת", () => {
    expect(() =>
      recordManualPayments(PLAYERS, 2, [
        { from: "עדן גיל", to: POT_SINK_NAME, amount: 25 },
      ])
    ).toThrow("לא אמור לקבל יותר");
  });

  it("מפת חוסר שמורה חלה בוולידציה: זוכה חתוך לא יכול לקבל מעבר לנטו שלו", () => {
    // מפה שחותכת את אורן ב־20 → זכאותו בוולידציה 80 (כמו ב־resolver)
    expect(() =>
      recordManualPayments(PLAYERS, 2, [
        { from: "עדן גיל", to: "אורן גיל", amount: 90 },
      ], { ...POT_OPTS, shortfall: { "אורן גיל": 20 } })
    ).toThrow("הסכום גדול ממה שמגיע");
    const ok = recordManualPayments(PLAYERS, 2, [
      { from: "עדן גיל", to: "אורן גיל", amount: 80 },
    ], { ...POT_OPTS, shortfall: { "אורן גיל": 20 } });
    expect(ok.manualPayments).toHaveLength(1);
  });
});

describe("saveManualPayments — תשלום ידני לקופה נשמר מקצה לקצה", () => {
  it("לא זורק, שומר את התשלום, והוא מופיע בתוכנית כהעברה ידנית לקופה", () => {
    const saved = saveManualPayments(POT_NIGHT, [
      { from: "עדן גיל", to: POT_SINK_NAME, amount: 25 },
    ]);
    expect(saved.manualSettlement.manualPayments).toEqual([
      { from: "עדן גיל", to: POT_SINK_NAME, amount: 25 },
    ]);
    const resolved = savedSettlement(PLAYERS, 2, saved.manualSettlement, POT_OPTS);
    const manualPot = resolved.transfers.find((t) => t.manual && t.to === POT_SINK_NAME);
    expect(manualPot).toEqual(expect.objectContaining({ from: "עדן גיל", amount: 25 }));
    // בתוכנית: ההעברה הידנית לקופה נוכחת, ואין בעיית ולידציה על הקופה עצמה.
    // (בעיות הוולידטור על זוכים בערב ידני בלי מפת חוסר קפואה הן התנהגות
    // קיימת גם לתשלומים בין שחקנים — לא חלק מהבאג הזה.)
    const plan = paymentPlan(saved);
    expect(plan.transfers).toContainEqual(
      expect.objectContaining({ from: "עדן גיל", to: POT_SINK_NAME, amount: 25, manual: true })
    );
    expect(plan.problems.some((p) => p.includes(POT_SINK_NAME))).toBe(false);
  });
});
