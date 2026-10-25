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
  it("invalidates checkmarks when the transfer plan changes", () => {
    const paid = markReceipt(markTransfer(session, 0, true), 0, true);
    const next = paymentPlan({ ...paid, entries: [{ name: "א", amount: 50 }, { name: "ב", amount: -50 }] });
    expect(next.paid).toEqual({});
    expect(next.received).toEqual({});
    expect(next.confirmations).toEqual([]);
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
  it("carries marks on identical transfers when the plan around them changes", () => {
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
    // א→ב 60 זהה בשתי התוכניות — הסימונים והאישורים עוברים; א→ג השתנתה (40→60) — בלי וי
    expect(plan.transfers).toEqual([
      { from: "א", to: "ב", amount: 60 },
      { from: "א", to: "ג", amount: 60 },
    ]);
    expect(plan.paid).toEqual({ 0: true });
    expect(plan.received).toEqual({ 0: true });
    expect(plan.confirmations).toHaveLength(2);
    expect(plan.confirmations.every((e) => e.index === 0)).toBe(true);
  });
  it("remaps marks and confirmations when an identical transfer moves index", () => {
    const before = {
      iso: "2026-07-26",
      entries: [{ name: "א", amount: -100 }, { name: "ב", amount: 60 }, { name: "ג", amount: 40 }],
    };
    const marked = markTransfer(before, 1, true, "א"); // א→ג 40 באינדקס 1
    const after = { ...marked, entries: [{ name: "א", amount: -40 }, { name: "ג", amount: 40 }] };
    const plan = paymentPlan(after);
    expect(plan.transfers).toEqual([{ from: "א", to: "ג", amount: 40 }]);
    expect(plan.paid).toEqual({ 0: true });
    expect(plan.confirmations[0]).toMatchObject({ index: 0, action: "paid", by: "א" });
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
    const idx = plan.transfers.findIndex((t) => t.from === "נתנאל כהן" && t.to === "אופיר סנה" && t.amount === 150);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(plan.paid[idx]).toBe(true);
    expect(plan.received[idx]).toBe(true);
    expect(plan.confirmations).toEqual([
      { index: idx, action: "paid", by: "נתנאל כהן", at: "2026-10-25T00:00:00.000Z" },
    ]);
    // קובי→אופיר 365 וקובי→אורן 35 לא קיימות בתוכנית החדשה — הסימונים שלהן לא נדבקים להעברה אחרת
    const kobiIdx = plan.transfers.findIndex((t) => t.from === "קובי סעדה");
    expect(plan.paid[kobiIdx]).toBeUndefined();
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
    expect(settlementTextForSession(custom)).toContain("26/07/2026");
    expect(settlementTextForSession(custom)).toContain("25");
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

  it("F1: paid/received על נתנאל→אופיר 150 שורדים בתצוגה למרות דגל manual שונה", () => {
    const plan = paymentPlan(NIGHT_24_10);
    expect(plan.transfers).toEqual(EXPECTED_TRANSFERS);
    expect(plan.potTransfer).toEqual(
      expect.objectContaining({ from: "עדן גיל", to: "קופת חיסכון", amount: 70, pot: true })
    );
    expect(plan.problems).toEqual([]);
    // בשמורה סומנו אינדקסים 0–2; רק נתנאל→אופיר 150 קיימת זהה בתוכנית החדשה (אינדקס 1).
    // קובי→אופיר 365 וקובי→אורן 35 אינן קיימות עוד — הסימונים לא נדבקים לאחרות.
    expect(plan.paid).toEqual({ 1: true });
    expect(plan.received).toEqual({ 1: true });
  });

  it("F1: rpcMarkTarget מחזיר יעד תקין (לא null) להעברה הזהה — מנהל וצופה", () => {
    const storedPlan = NIGHT_24_10.payments.plan;
    expect(rpcMarkTarget(NIGHT_24_10, 1)).toEqual({ fingerprint: storedPlan, index: 0 });
    // העברה חדשה שלא הייתה בשמורה (קובי→דן 70) — עדיין אין יעד חוקי
    expect(rpcMarkTarget(NIGHT_24_10, 5)).toBeNull();

    const snap = { id: "g1", data: { sessions: [NIGHT_24_10] }, config: { shareHistory: true } };
    const viewerSession = snapshotForViewer(snap).data.sessions[0];
    const viewerPlan = paymentPlan(viewerSession);
    expect(viewerPlan.transfers).toEqual(EXPECTED_TRANSFERS);
    const target = rpcMarkTarget(viewerSession, 1);
    // הצופה מחזיק את ההקרנה (בלי שורת הקופה) — היעד הוא ההקרנה, אינדקס 0
    expect(target).not.toBeNull();
    expect(target.index).toBe(0);
    expect(target.fingerprint).toBe(viewerSession.payments.plan);
    expect(target.fingerprint).not.toContain("קופת חיסכון");
  });

  it("F1: סימון חדש אחרי ה־carry לא מוחק את הסימונים ששרדו", () => {
    const marked = markTransfer(NIGHT_24_10, 5, true, "קובי סעדה");
    const plan = paymentPlan(marked);
    expect(plan.paid).toEqual({ 1: true, 5: true });
    expect(plan.received).toEqual({ 1: true });
  });

  it("A(a): אישור תשלום הקופה (אינדקס רגיל בתוכנית השמורה) שורד כ־pot ב־carry-over", () => {
    const session = { ...NIGHT_24_10, payments: CURRENT_PAYMENTS_24_10 };
    const plan = paymentPlan(session);
    expect(plan.potPaid).toBe(true);
    // כל 7 האישורים של המנהל שורדים; של הקופה מומר לצורה הקנונית
    expect(plan.confirmations).toHaveLength(7);
    const potEvent = plan.confirmations.find((e) => e.pot);
    expect(potEvent).toMatchObject({ index: -1, action: "paid", by: "עדן גיל", at: "2026-10-25T08:25:59.112Z" });
    // ושאר האירועים ממופים לאינדקסים של התוכנית הנוכחית (קובי→דן: 6→5)
    const kobiDan = plan.confirmations.find((e) => e.at === "2026-10-25T08:22:15.119Z");
    expect(kobiDan.index).toBe(5);
  });
});
