import { describe, expect, it } from "vitest";
import { markTransfer, paymentPlan } from "../lib/paymentTracking.js";
import { settlementTextForSession } from "../lib/nightShare.js";

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
    const paid = markTransfer(session, 0, true);
    expect(paymentPlan({ ...paid, entries: [{ name: "א", amount: 50 }, { name: "ב", amount: -50 }] }).paid).toEqual({});
  });
  it("uses the saved chip ratio and original date", () => {
    const custom = { ...session, cps: 4, entries: [{ name: "א", amount: 25, buyin: 50, chips: 300 }, { name: "ב", amount: -25, buyin: 50, chips: 100 }] };
    expect(paymentPlan(custom).transfers[0].amount).toBe(25);
    expect(settlementTextForSession(custom)).toContain("26/07/2026");
    expect(settlementTextForSession(custom)).toContain("25");
  });
});
