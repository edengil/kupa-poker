import { describe, expect, it, vi } from "vitest";
import { saveManualPayments, paymentPlan, markTransfer } from "../lib/paymentTracking";
import { playersFromSession, settlementTextForSession } from "../lib/nightShare";
import { savedSettlement } from "../lib/savedSettlement";
import { fetchSnapshot } from "../lib/realtime";

const session = { id: "s1", iso: "2026-09-09", entries: [{ name: "א", amount: -100 }, { name: "ב", amount: 60 }, { name: "ג", amount: 40 }] };
const payment = { from: "א", to: "ב", amount: 25, id: "p1" };
describe("persisted manual settlement", () => {
  it("survives JSON persistence and reduces outstanding amount while marking paid", () => {
    const next = JSON.parse(JSON.stringify(saveManualPayments(session, [payment])));
    const plan = paymentPlan(next);
    expect(plan.transfers[0]).toMatchObject({ from: "א", to: "ב", amount: 25, manual: true });
    expect(plan.paid[0]).toBe(true);
    expect(plan.transfers.reduce((s, t, i) => s + (plan.paid[i] ? 0 : t.amount), 0)).toBe(75);
    expect(savedSettlement(playersFromSession(next), 1, next.manualSettlement).balances).toEqual({ א: -75, ב: 35, ג: 40 });
    expect(settlementTextForSession(next)).toContain("25");
    expect(next.entries).toEqual(session.entries);
  });
  it("undo through either editor or checkbox restores the debt", () => {
    const next = saveManualPayments(session, [payment]);
    for (const undo of [saveManualPayments(next, []), markTransfer(next, 0, false)]) {
      expect(paymentPlan(undo).transfers.reduce((s, t, i) => s + (paymentPlan(undo).paid[i] ? 0 : t.amount), 0)).toBe(100);
    }
  });
  it("invalidates manual payments after editing results", () => {
    const next = saveManualPayments(session, [payment]);
    next.entries = [{ name: "א", amount: -50 }, { name: "ב", amount: 50 }];
    expect(paymentPlan(next).transfers.some((t) => t.manual)).toBe(false);
    expect(paymentPlan(next).paid).toEqual({});
  });
  it("rejects overpayment and non-finite amounts before changing the session", () => {
    for (const amount of [200, Infinity, NaN, 0, 1.5]) expect(() => saveManualPayments(session, [{ ...payment, amount }])).toThrow();
  });
  it("loads the filtered versioned RPC including public configuration", async () => {
    const row = { id: "g", data: { sessions: [] }, live: null, config: { shareHistory: false, chipsPerShekel: 4 } };
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    expect(await fetchSnapshot({ rpc }, "slug")).toMatchObject(row);
    expect(rpc).toHaveBeenCalledWith("public_group_v2", { p_slug: "slug" });
  });
});
