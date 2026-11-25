import { describe, expect, it } from "vitest";
import { markReceipt, markTransfer, paymentPlan, rpcMarkTarget } from "../lib/paymentTracking.js";
import { settlementTextForSession } from "../lib/nightShare.js";
import { snapshotForViewer } from "../lib/publicShare.js";
import { NIGHT_24_10, CURRENT_PAYMENTS_24_10 } from "./fixtures/night-2026-10-24.js";

const session = { iso: "2026-07-26", entries: [{ name: "א", amount: 25 }, { name: "ב", amount: -25 }] };
describe("payment tracking", () => {
  it("persists a checkmark without changing game results and allows undo", () => {
    const paid = markTransfer(session, 0, true);
    expect(paymentPlan(paid).paid[0]).toBe(true);
    expect(paid.entries).toEqual(session.entries);
    expect(session.payments).toBeUndefined();
    expect(paymentPlan(markTransfer(paid, 0, false)).paid[0]).toBe(false);
  });
  it("ערב מסומן מוקפא: שינוי נתוני הערב לא מחשב מחדש ולא מוחק סימונים (הקפאת Pot Boost)", () => {
    /* לפני הגל: שינוי התוכנית איפס/מיפה סימונים מחדש. מהגל: ערב עם
       סימון כלשהו מוגש מהתוכנית השמורה כמות שהיא (§8.6 — מה ששולם עבר;
       לא מחשבים מחדש ולא נוגעים). */
    const paid = markReceipt(markTransfer(session, 0, true, "ב"), 0, true, "א");
    const next = paymentPlan({ ...paid, entries: [{ name: "א", amount: 50 }, { name: "ב", amount: -50 }] });
    expect(next.transfers).toEqual([{ from: "ב", to: "א", amount: 25 }]);
    expect(next.paid).toEqual({ 0: true });
    expect(next.received).toEqual({ 0: true });
    expect(next.confirmations).toHaveLength(2);
    expect(next.frozen).toBe(true);
  });
  it("stores who confirmed on the same payments object and skips a name when none was given", () => {
    const paid = markTransfer(session, 0, true, "אורן גיל");
    expect(paymentPlan(paid).confirmations[0]).toMatchObject({ index: 0, action: "paid", by: "אורן גיל" });
    expect(paymentPlan(markTransfer(session, 0, true)).confirmations).toEqual([]);
    expect(paymentPlan(markReceipt(session, 0, true, "קובי סעדה")).confirmations[0]).toMatchObject({
      index: 0,
      action: "received",
      by: "קובי סעדה",
    });
  });
  it("keeps payer and receiver marks on the same payment plan", () => {
    const both = markReceipt(markTransfer(session, 0, true), 0, true);
    const plan = paymentPlan(both);
    expect(plan.paid[0]).toBe(true);
    expect(plan.received[0]).toBe(true);
    expect(paymentPlan(markTransfer(both, 0, false)).received[0]).toBe(true);
    expect(paymentPlan(markReceipt(both, 0, false)).paid[0]).toBe(true);
  });
  it("ערב מסומן מוקפא: התוכנית המוצגת היא השמורה, גם אם הנתונים השתנו סביבה", () => {
    const before = {
      iso: "2026-07-26",
      entries: [{ name: "א", amount: -100 }, { name: "ב", amount: 60 }, { name: "ג", amount: 40 }],
    };
    const marked = markReceipt(markTransfer(before, 0, true, "א"), 0, true, "ב");
    const after = {
      ...marked,
      entries: [{ name: "א", amount: -120 }, { name: "ב", amount: 60 }, { name: "ג", amount: 60 }],
    };
    const plan = paymentPlan(after);
    // התוכנית השמורה כמות שהיא (א→ג נשארת 40, לא מחושבת מחדש ל־60)
    expect(plan.transfers).toEqual([
      { from: "א", to: "ב", amount: 60 },
      { from: "א", to: "ג", amount: 40 },
    ]);
    expect(plan.paid).toEqual({ 0: true });
    expect(plan.received).toEqual({ 0: true });
    expect(plan.confirmations).toHaveLength(2);
    expect(plan.confirmations.every((e) => e.index === 0)).toBe(true);
  });
  it("ערב מסומן מוקפא: סימון נשאר באינדקס השמור גם אם חישוב מחדש היה מזיז אותו", () => {
    const before = {
      iso: "2026-07-26",
      entries: [{ name: "א", amount: -100 }, { name: "ב", amount: 60 }, { name: "ג", amount: 40 }],
    };
    const marked = markTransfer(before, 1, true, "א"); // א→ג 40 באינדקס 1
    const after = { ...marked, entries: [{ name: "א", amount: -40 }, { name: "ג", amount: 40 }] };
    const plan = paymentPlan(after);
    expect(plan.transfers).toEqual([
      { from: "א", to: "ב", amount: 60 },
      { from: "א", to: "ג", amount: 40 },
    ]);
    expect(plan.paid).toEqual({ 1: true });
    expect(plan.confirmations[0]).toMatchObject({ index: 1, action: "paid", by: "א" });
  });
  it("marking after a plan change does not wipe carried marks", () => {
    const before = {
      iso: "2026-07-26",
      entries: [{ name: "א", amount: -100 }, { name: "ב", amount: 60 }, { name: "ג", amount: 40 }],
    };
    const marked = markTransfer(before, 0, true, "א");
    const after = {
      ...marked,
      entries: [{ name: "א", amount: -120 }, { name: "ב", amount: 60 }, { name: "ג", amount: 60 }],
    };
    const plan = paymentPlan(markTransfer(after, 1, true, "א"));
    expect(plan.paid).toEqual({ 0: true, 1: true });
  });
  it("24.10 reconstruction: marks stored on the old plan survive onto the identical נתנאל→אופיר 150", () => {
    const oldPlan = JSON.stringify([
      { from: "עדן גיל", to: "אורן גיל", amount: 285 },
      { from: "נתנאל כהן", to: "אופיר סנה", amount: 150 },
      { from: "קובי סעדה", to: "אופיר סנה", amount: 365 },
      { from: "קובי סעדה", to: "אורן גיל", amount: 35 },
    ]);
    const current = {
      iso: "2026-10-24",
      entries: [
        { name: "נתנאל כהן", amount: -150 },
        { name: "אופיר סנה", amount: 150 },
        { name: "קובי סעדה", amount: -70 },
        { name: "דן ינקלויץ", amount: 70 },
      ],
      payments: {
        plan: oldPlan,
        paid: { 0: true, 1: true, 2: true },
        received: { 0: true, 1: true, 2: true },
        confirmations: [{ index: 1, action: "paid", by: "נתנאל כהן", at: "2026-10-25T00:00:00.000Z" }],
      },
    };
    const plan = paymentPlan(current);
    /* הקפאה: התוכנית המוצגת היא השמורה מילה במילה — נתנאל→אופיר באינדקס
       1 כפי שנשמר, והסימונים של כל שורה נשארים על השורה שלה. */
    expect(plan.transfers).toEqual(JSON.parse(oldPlan));
    const idx = plan.transfers.findIndex((t) => t.from === "נתנאל כהן" && t.to === "אופיר סנה" && t.amount === 150);
    expect(idx).toBe(1);
    expect(plan.paid[idx]).toBe(true);
    expect(plan.received[idx]).toBe(true);
    expect(plan.confirmations).toEqual([
      { index: idx, action: "paid", by: "נתנאל כהן", at: "2026-10-25T00:00:00.000Z" },
    ]);
    expect(plan.paid[2]).toBe(true);
  });
  it("rpcMarkTarget translates a click to the stored plan when the plan changed", () => {
    const oldPlan = JSON.stringify([
      { from: "עדן גיל", to: "אורן גיל", amount: 285 },
      { from: "נתנאל כהן", to: "אופיר סנה", amount: 150 },
    ]);
    const current = {
      iso: "2026-10-24",
      entries: [
        { name: "נתנאל כהן", amount: -150 },
        { name: "אופיר סנה", amount: 150 },
        { name: "קובי סעדה", amount: -70 },
        { name: "דן ינקלויץ", amount: 70 },
      ],
      payments: { plan: oldPlan, paid: {}, received: {}, confirmations: [] },
    };
    const plan = paymentPlan(current);
    const identicalIdx = plan.transfers.findIndex((t) => t.from === "נתנאל כהן");
    expect(rpcMarkTarget(current, identicalIdx)).toEqual({ fingerprint: oldPlan, index: 1 });
    // העברה שלא הייתה בתוכנית השמורה — אין יעד שרת חוקי
    const newOnlyIdx = plan.transfers.findIndex((t) => t.from === "קובי סעדה");
    expect(rpcMarkTarget(current, newOnlyIdx)).toBeNull();
    // בלי תוכנית שמורה — שולחים את המחושבת כרגיל
    const { payments, ...noStored } = current;
    expect(rpcMarkTarget(noStored, identicalIdx)).toEqual({ fingerprint: plan.fingerprint, index: identicalIdx });
    // תוכנית שמורה זהה למחושבת — בלי תרגום
    const adopted = markTransfer(noStored, identicalIdx, true);
    expect(rpcMarkTarget(adopted, identicalIdx)).toEqual({
      fingerprint: paymentPlan(adopted).fingerprint,
      index: identicalIdx,
    });
  });
  it("uses the saved chip ratio and original date", () => {
    const custom = { ...session, cps: 4, entries: [{ name: "א", amount: 25, buyin: 50, chips: 300 }, { name: "ב", amount: -25, buyin: 50, chips: 100 }] };
    expect(paymentPlan(custom).transfers[0].amount).toBe(25);
    expect(settlementTextForSession(custom, { manager: true })).toContain("26/07/2026");
    expect(settlementTextForSession(custom, { manager: true })).toContain("25");
  });
});

/* שחזור נאמן־ייצור של 24.10 (סבב תיקון 2 — פסילת בודק B): התוכנית השמורה
   היא של סוף הלילה, עם דגלי manual:true על שלוש ההעברות הראשונות ושורת
   קופה 60, וב־manualSettlement מפת חוסר. הפיקסצ'ר של סבב 1 החסיר את
   דגלי ה־manual ולכן עבר בטעות: זהות ההעברה כללה את הדגל, וההעברה
   נתנאל→אופיר 150 (manual שם, pair בחישוב) לא זוהתה. */
describe("24.10 faithful production reconstruction (round 2)", () => {
  const EXPECTED_TRANSFERS = [
    { from: "עדן גיל", to: "אורן גיל", amount: 307, pair: true },
    { from: "נתנאל כהן", to: "אופיר סנה", amount: 150, pair: true },
    { from: "קובי סעדה", to: "אופיר סנה", amount: 330 },
    { from: "עדן גיל", to: "דן ינקלויץ", amount: 30 },
    { from: "עדן גיל", to: "דור לירז", amount: 100 },
    { from: "קובי סעדה", to: "דן ינקלויץ", amount: 70 },
  ];

  /* גל Pot Boost: הערב מסומן (paid/received קיימים) ולכן מוקפא —
     התצוגה היא התוכנית השמורה מילה במילה, בלי חישוב מחדש ובלי מיפוי
     סימונים. EXPECTED_TRANSFERS (המחושבת) נשארת רק לבדיקת הערב הלא־מסומן. */
  const STORED_TRANSFERS = JSON.parse(NIGHT_24_10.payments.plan).filter((t) => !t.pot);

  it("F1: ערב מסומן מוקפא — התוכנית השמורה מוצגת כמות שהיא, עם כל הסימונים", () => {
    const plan = paymentPlan(NIGHT_24_10);
    expect(plan.transfers).toEqual(STORED_TRANSFERS);
    expect(plan.potTransfer).toEqual(
      expect.objectContaining({ from: "עדן גיל", amount: 60, pot: true })
    );
    expect(plan.problems).toEqual([]);
    expect(plan.paid).toEqual(NIGHT_24_10.payments.paid);
    expect(plan.received).toEqual(NIGHT_24_10.payments.received);
    expect(plan.frozen).toBe(true);
  });

  it("F1: rpcMarkTarget על ערב מוקפא מחזיר את הקואורדינטות השמורות עצמן — מנהל וצופה", () => {
    const storedPlan = NIGHT_24_10.payments.plan;
    // אין תרגום: המוצג הוא השמור, אז אינדקס 0 בשמורה הוא אינדקס 0 ביעד
    expect(rpcMarkTarget(NIGHT_24_10, 0)).toEqual({ fingerprint: storedPlan, index: 0 });
    expect(rpcMarkTarget(NIGHT_24_10, 5)).toEqual({ fingerprint: storedPlan, index: 5 });

    const approved = { ...NIGHT_24_10, settlementApprovedAt: "2026-11-08T00:00:00.000Z" };
    const snap = { id: "g1", data: { sessions: [approved] }, config: { shareHistory: true } };
    const viewerSession = snapshotForViewer(snap).data.sessions[0];
    const viewerPlan = paymentPlan(viewerSession);
    // הצופה מחזיק את הקרנת התוכנית השמורה (בלי שורת הקופה)
    expect(viewerPlan.transfers).toEqual(STORED_TRANSFERS.filter((t) => !t.pot));
    const target = rpcMarkTarget(viewerSession, 0);
    expect(target).not.toBeNull();
    expect(target.index).toBe(0);
    expect(target.fingerprint).toBe(viewerSession.payments.plan);
    expect(target.fingerprint).not.toContain("קופת חיסכון");
  });

  it("F1: סימון חדש על ערב מוקפא לא מוחק את הסימונים הקיימים", () => {
    const marked = markTransfer(NIGHT_24_10, 5, true, "קובי סעדה");
    const plan = paymentPlan(marked);
    expect(plan.paid).toEqual({ ...NIGHT_24_10.payments.paid, 5: true });
    expect(plan.received).toEqual(NIGHT_24_10.payments.received);
  });

  it("A(a): אישור תשלום הקופה (אינדקס רגיל בתוכנית השמורה) שורד כ־potPaid בהקפאה", () => {
    const session = { ...NIGHT_24_10, payments: CURRENT_PAYMENTS_24_10 };
    const plan = paymentPlan(session);
    expect(plan.potPaid).toBe(true);
    // כל 7 האישורים שורדים מילה במילה, בקואורדינטות השמורות
    expect(plan.confirmations).toEqual(CURRENT_PAYMENTS_24_10.confirmations);
    const potEvent = plan.confirmations.find((e) => e.at === "2026-10-25T08:25:59.112Z");
    expect(potEvent.index).toBe(5); // שורת הקופה בתוכנית השמורה
    const kobiDan = plan.confirmations.find((e) => e.at === "2026-10-25T08:22:15.119Z");
    expect(kobiDan.index).toBe(6); // קובי→דן 70 — אינדקס 6 בשמורה, בלי מיפוי
  });
});
