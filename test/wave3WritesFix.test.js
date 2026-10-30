/* גל 3ב — סבב תיקון לפסילת בודק A (ממצא 9):
   1. ביטול־סימון לא קם לתחייה במיזוג flush (U1/U4 של הבודק): כששני
      הצדדים נושאים את אותו אירוע אישור אחרון והערכים שונים — הצד
      שביטל אחרי האירוע (לא־מסומן) גובר. בלי אירועים בכלל (legacy)
      המסומן גובר, ועותק קדם־סימון עדיין לא מוחק סימון קיים (U2/U3).
   2. כתיבת ה־live במסלול מיזוג־הקונפליקט של OwnerApp עוברת דרך
      updateGroupCas — אין בקובץ כתיבת update ישירה על live. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mergeSessionPayments } from "../lib/dataMerge.js";
import { markTransfer, markReceipt, markPotPaid, paymentPlan } from "../lib/paymentTracking.js";

/* ערב עם שתי העברות שחקנים בתוכנית (אינדקסים 0 ו־1) + העברת קופה:
   מיכל (−260) מול רוני (+120) וטל (+140), קופה 9. */
const night = {
  id: "s-fix",
  iso: "2026-11-06",
  entries: [
    { name: "רוני", amount: 120 },
    { name: "מיכל", amount: -260 },
    { name: "טל", amount: 140 },
  ],
  savingsPot: 9,
};

describe("ביטול־סימון שורד מיזוג flush — אירוע אחרון זהה בשני הצדדים", () => {
  it("U1: ביטול paid אחרי הסימון גובר על עותק שעדיין מסומן", () => {
    const marked = markTransfer(night, 1, true, "מיכל");
    const unmarked = markTransfer(marked, 1, false, "מיכל");
    /* תנאי־המקדים של התרחיש: שני הצדדים נושאים את אותו אירוע אישור */
    expect(unmarked.payments.confirmations).toHaveLength(1);
    expect(unmarked.payments.confirmations).toEqual(marked.payments.confirmations);
    expect(mergeSessionPayments(marked, unmarked).paid[1]).toBe(false);
    expect(mergeSessionPayments(unmarked, marked).paid[1]).toBe(false);
    /* האירוע עצמו נשמר במפה הממוזגת */
    expect(mergeSessionPayments(marked, unmarked).confirmations).toHaveLength(1);
  });

  it("U1-מקביל: ביטול received אחרי הסימון גובר על עותק שעדיין מסומן", () => {
    const marked = markReceipt(night, 0, true, "רוני");
    const unmarked = markReceipt(marked, 0, false, "רוני");
    expect(unmarked.payments.confirmations).toHaveLength(1);
    expect(mergeSessionPayments(marked, unmarked).received[0]).toBe(false);
    expect(mergeSessionPayments(unmarked, marked).received[0]).toBe(false);
  });

  it("U4: ביטול potPaid אחרי הסימון גובר על עותק שעדיין מסומן", () => {
    const marked = markPotPaid(night, true, "רוני");
    const unmarked = markPotPaid(marked, false, "רוני");
    expect(marked.payments.potPaid).toBe(true);
    expect(unmarked.payments.potPaid).toBeUndefined();
    expect(unmarked.payments.confirmations).toEqual(marked.payments.confirmations);
    expect(mergeSessionPayments(marked, unmarked).potPaid).toBeFalsy();
    expect(mergeSessionPayments(unmarked, marked).potPaid).toBeFalsy();
  });
});

describe("הגנות U2/U3 ו־legacy נשארות בתוקף", () => {
  it("עותק קדם־סימון (בלי האירוע) לא מוחק סימון קיים", () => {
    const marked = markTransfer(night, 1, true, "מיכל");
    const preMark = {
      ...night,
      payments: {
        plan: paymentPlan(night).fingerprint,
        paid: {},
        received: {},
        confirmations: [],
      },
    };
    expect(mergeSessionPayments(preMark, marked).paid[1]).toBe(true);
    expect(mergeSessionPayments(marked, preMark).paid[1]).toBe(true);
  });

  it("legacy בלי אירועים בכלל: המסומן גובר בשני הכיוונים", () => {
    const fp = paymentPlan(night).fingerprint;
    const legacyMarked = {
      ...night,
      payments: { plan: fp, paid: { 1: true }, received: {}, confirmations: [] },
    };
    const legacyUnmarked = {
      ...night,
      payments: { plan: fp, paid: { 1: false }, received: {}, confirmations: [] },
    };
    expect(mergeSessionPayments(legacyMarked, legacyUnmarked).paid[1]).toBe(true);
    expect(mergeSessionPayments(legacyUnmarked, legacyMarked).paid[1]).toBe(true);
  });
});

describe("OwnerApp — כתיבת live של מיזוג־הקונפליקט עוברת דרך CAS", () => {
  it("אין update ישיר על live; המיזוג נבנה בתוך updateGroupCas", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../components/OwnerApp.jsx", import.meta.url)),
      "utf8"
    );
    expect(src).toContain("updateGroupCas(supabase, row.id");
    expect(src).not.toContain(".update({ live");
  });
});
