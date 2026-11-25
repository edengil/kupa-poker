import { describe, it, expect } from "vitest";
import { mergeGroupDataOnFlush, mergeSessionPayments, preferSession } from "../lib/dataMerge.js";
import { paymentPlan, markTransfer } from "../lib/paymentTracking.js";
import { NIGHT_17_11 } from "./fixtures/night-2026-11-17.js";

describe("mergeGroupDataOnFlush", () => {
  it("rescues sessions that exist only on the server", () => {
    const remote = {
      sessions: [
        { id: "old", iso: "2026-09-02", entries: [{ name: "א", amount: 1 }] },
        { id: "new", iso: "2026-09-14", entries: [{ name: "ב", amount: 2 }] },
      ],
      roster: ["א"],
    };
    const local = {
      sessions: [
        {
          id: "old",
          iso: "2026-09-02",
          entries: [{ name: "א", amount: 1 }],
          payments: { plan: "x", paid: { 0: true } },
        },
      ],
      roster: ["א", "ב"],
    };
    const { data, adopted, rescuedIds } = mergeGroupDataOnFlush(local, remote);
    expect(adopted).toBe(true);
    expect(rescuedIds).toEqual(["new"]);
    expect(data.sessions.map((s) => s.id).sort()).toEqual(["new", "old"]);
    expect(data.sessions.find((s) => s.id === "old").payments.paid[0]).toBe(true);
    expect(data.roster).toEqual(expect.arrayContaining(["א", "ב"]));
  });

  it("honors deletedSessionIds so intentional deletes stay deleted", () => {
    const remote = {
      sessions: [
        { id: "keep", iso: "2026-09-01", entries: [] },
        { id: "gone", iso: "2026-09-02", entries: [] },
      ],
    };
    const local = {
      sessions: [{ id: "keep", iso: "2026-09-01", entries: [] }],
      deletedSessionIds: ["gone"],
    };
    const { data } = mergeGroupDataOnFlush(local, remote);
    expect(data.sessions.map((s) => s.id)).toEqual(["keep"]);
    expect(data.deletedSessionIds).toContain("gone");
  });
});

/* סבב תיקון 2 — פסילת בודק B: מיזוג flush החליף את התוכנית השמורה של ערב
   ששולם בתוכנית מחושבת־חי של עותק ישן לא־מסומן (כלל ברזל 8 / B1).
   השחזור המדויק של הבודק על נתוני הייצור של 17.11. */
describe("merge על ערב מסומן — התוכנית השמורה של הצד המסומן היא הקנונית", () => {
  const freshNight = () => structuredClone(NIGHT_17_11);
  /* העותק הישן של הבודק: אותם נתוני ערב, הסימונים הופשטו, ושדה לא־קשור נערך */
  const staleNight = () => {
    const s = structuredClone(NIGHT_17_11);
    s.payments = { plan: s.payments.plan, paid: {}, received: {}, confirmations: [] };
    s.location = "עריכה לא קשורה ממכשיר ישן";
    return s;
  };

  it("שחזור הבודק: fresh בשרת מול stale מקומי זוכה — plan זהה בייטית לטרי, סימונים 7/7", () => {
    const fresh = freshNight();
    const { data } = mergeGroupDataOnFlush(
      { sessions: [staleNight()], roster: [] },
      { sessions: [fresh], roster: [] }
    );
    const merged = data.sessions.find((s) => s.id === fresh.id);
    expect(merged.payments.plan).toBe(fresh.payments.plan);
    expect(Object.values(merged.payments.paid).filter(Boolean)).toHaveLength(7);
    expect(merged.payments.received).toEqual({ 0: true, 3: true });
    expect(merged.payments.potPaid).toBe(true);
    const served = paymentPlan(merged);
    expect(served.frozen).toBe(true);
    expect(served.fingerprint).toBe(fresh.payments.plan);
    /* אינדקס 2 נשאר «עדן←קובי 137» — לא הופך ל«אופיר←קובי 135» המחושב */
    expect(served.transfers[2]).toMatchObject({ from: "עדן גיל", to: "קובי סעדה", amount: 137 });
  });

  it("גם בכיוון ההפוך ובקריאה ישירה: הצד המסומן מכתיב את ה־plan", () => {
    const fresh = freshNight();
    const stale = staleNight();
    expect(mergeSessionPayments(stale, fresh).plan).toBe(fresh.payments.plan);
    expect(mergeSessionPayments(fresh, stale).plan).toBe(fresh.payments.plan);
    const { data } = mergeGroupDataOnFlush(
      { sessions: [fresh], roster: [] },
      { sessions: [staleNight()], roster: [] }
    );
    expect(data.sessions[0].payments.plan).toBe(fresh.payments.plan);
  });

  it("שני הצדדים מסומנים עם אותה תוכנית שמורה: ה־plan נשמר וסימוני העל־קבוצה שורדים", () => {
    const fresh = freshNight();
    const more = freshNight();
    more.payments = {
      ...more.payments,
      received: { ...more.payments.received, 1: true },
      confirmations: [
        ...more.payments.confirmations,
        { index: 1, action: "received", by: "דור לירז", at: "2026-11-20T10:00:00.000Z" },
      ],
    };
    const merged = mergeSessionPayments(staleNight(), fresh);
    expect(merged.plan).toBe(fresh.payments.plan);
    const both = mergeSessionPayments(more, fresh);
    expect(both.plan).toBe(fresh.payments.plan);
    expect(both.received).toMatchObject({ 0: true, 1: true, 3: true });
  });

  it("שני הצדדים מסומנים עם תוכניות שונות: הצד שסימוניו על־קבוצה מכתיב את ה־plan", () => {
    const fresh = freshNight();
    /* צד מסומן שני עם תוכנית מחושבת אחרת וסימון יחיד — מול 7+pot של הטרי */
    const other = markTransfer(staleNight(), 0, true, "עדן גיל");
    expect(other.payments.plan).not.toBe(fresh.payments.plan);
    expect(mergeSessionPayments(other, fresh).plan).toBe(fresh.payments.plan);
    expect(mergeSessionPayments(fresh, other).plan).toBe(fresh.payments.plan);
  });

  it("אף צד לא מסומן: ההתנהגות הקודמת — טביעת־האצבע החיה של הזוכה", () => {
    const a = staleNight();
    const b = staleNight();
    b.location = "עותק שני";
    const merged = mergeSessionPayments(a, b);
    expect(merged.plan).toBe(paymentPlan(a).fingerprint);
    expect(Object.values(merged.paid || {}).filter(Boolean)).toHaveLength(0);
  });

  it("שדות הקפאה של הצד המסומן שורדים זכייה של עותק ישן (frozenPot/frozenActual)", () => {
    const fresh = freshNight();
    fresh.manualSettlement = { ...fresh.manualSettlement, frozenPot: 60, frozenActual: 60 };
    const stale = staleNight();
    stale.manualSettlement = { ...stale.manualSettlement, frozenPot: 999 };
    const { data } = mergeGroupDataOnFlush(
      { sessions: [stale], roster: [] },
      { sessions: [fresh], roster: [] }
    );
    const merged = data.sessions.find((s) => s.id === fresh.id);
    expect(merged.payments.plan).toBe(fresh.payments.plan);
    expect(merged.manualSettlement.frozenPot).toBe(60);
    expect(merged.manualSettlement.frozenActual).toBe(60);
  });
});

describe("preferSession", () => {
  it("keeps local payment marks over plain remote copy", () => {
    const remote = { id: "s", entries: [{ name: "א", amount: 1 }] };
    const local = {
      id: "s",
      entries: [{ name: "א", amount: 1 }],
      payments: { plan: "p", paid: { 0: true } },
    };
    expect(preferSession(remote, local).payments.paid[0]).toBe(true);
  });
});
