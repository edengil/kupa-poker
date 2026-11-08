import { describe, it, expect } from "vitest";
import { preferSession } from "../lib/dataMerge.js";

/* ============================================================================
   רגרסיית פריט 1.3 (B4) אחרי תיקון גל 1א — עריכת־סכום מקומית על רשומה קיימת
   (בלי שינוי מבני) לא הולכת לאיבוד כשהעותק בשרת עשיר יותר מבנית.
   sessionScore סופר מבנה בלבד (payments/entries/endedAt/manualSettlement/
   tips) ולכן לפני התיקון הכריע לטובת השרת גם כשהמקומי נשא את הסכום המעודכן.
   ============================================================================ */

const richRemote = () => ({
  id: "s1",
  date: "2026-11-07",
  endedAt: 1762470000000,
  payments: { plan: "p", paid: {}, received: {} },
  manualSettlement: { transfers: [] },
  tips: [{ amount: 10 }],
  entries: [{ id: "e1", name: "קובי סעדה", amount: 100 }],
});

describe("B4 — עריכת־סכום ב־preferSession", () => {
  it("רפרו: entries amount 100→250 מקומית מול שרת עשיר מבנית — המקומי מנצח", () => {
    const remote = richRemote(); // score 118
    const local = {
      id: "s1",
      date: "2026-11-07",
      entries: [{ id: "e1", name: "קובי סעדה", amount: 250 }],
    };
    expect(preferSession(remote, local)).toBe(local);
  });

  it("עריכת buyin בלבד (250→400) מול שרת עשיר — המקומי מנצח", () => {
    const remote = { ...richRemote(), players: [{ name: "קובי סעדה", buyin: 100, cashout: "0" }] };
    const local = {
      id: "s1",
      date: "2026-11-07",
      entries: [{ id: "e1", name: "קובי סעדה", amount: 100 }],
      players: [{ name: "קובי סעדה", buyin: 400, cashout: "0" }],
    };
    expect(preferSession(remote, local)).toBe(local);
  });

  it("עריכת cashout בלבד (500→650) מול שרת עשיר — המקומי מנצח", () => {
    const remote = { ...richRemote(), players: [{ name: "קובי סעדה", buyin: 100, cashout: "500" }] };
    const local = {
      id: "s1",
      date: "2026-11-07",
      entries: [{ id: "e1", name: "קובי סעדה", amount: 100 }],
      players: [{ name: "קובי סעדה", buyin: 100, cashout: "650" }],
    };
    expect(preferSession(remote, local)).toBe(local);
  });

  it("עריכת־סכום בשרת (ולא מקומית) עדיין מנצחת כשהיא גבוהה יותר", () => {
    const remote = {
      id: "s1",
      date: "2026-11-07",
      entries: [{ id: "e1", name: "קובי סעדה", amount: 250 }],
    };
    const local = richRemote(); // עשיר מבנית אבל עם amount ישן 100
    expect(preferSession(remote, local)).toBe(remote);
  });

  it("בלי שדות־סכום בכלל — ההכרעה הישנה נשמרת (שרת עשיר מנצח)", () => {
    const remote = richRemote();
    delete remote.entries;
    const local = { id: "s1", date: "2026-11-07" };
    expect(preferSession(remote, local)).toBe(remote);
  });

  it("שני הצדדים ערכו רשומות שונות — אין הכרעת־סכום, נופלים לציון המבני", () => {
    const remote = {
      ...richRemote(),
      entries: [
        { id: "e1", name: "קובי סעדה", amount: 300 },
        { id: "e2", name: "דוד בני גיל", amount: 100 },
      ],
    };
    const local = {
      id: "s1",
      date: "2026-11-07",
      entries: [
        { id: "e1", name: "קובי סעדה", amount: 100 },
        { id: "e2", name: "דוד בני גיל", amount: 200 },
      ],
    };
    expect(preferSession(remote, local)).toBe(remote);
  });
});
