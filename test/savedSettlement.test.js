import { describe, expect, it, vi } from "vitest";
import { saveManualPayments, paymentPlan, markTransfer, markReceipt } from "../lib/paymentTracking";
import { playersFromSession, settlementTextForSession } from "../lib/nightShare";
import { savedSettlement, settlementVersionLabel } from "../lib/savedSettlement";
import { settlementEditNotice } from "../lib/settlementEditNotice";
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
  it("preserves preferred creditors through later manual-payment saves", () => {
    const shortfallSession = {
      id: "s-prefer",
      iso: "2026-09-09",
      entries: [
        { name: "א", amount: 100 },
        { name: "ב", amount: 100 },
        { name: "ג", amount: -150 },
      ],
    };
    const preferred = saveManualPayments(shortfallSession, [], {
      preferCreditors: ["א"],
      now: "2026-10-01T09:00:00.000Z",
    });
    expect(preferred.manualSettlement.preferCreditors).toEqual(["א"]);
    expect(savedSettlement(playersFromSession(preferred), 1, preferred.manualSettlement).balances).toEqual({
      א: 100,
      ב: 50,
      ג: -150,
    });

    const later = saveManualPayments(preferred, [{ from: "ג", to: "א", amount: 25, id: "p-prefer" }], {
      now: "2026-10-01T09:05:00.000Z",
    });
    expect(later.manualSettlement.preferCreditors).toEqual(["א"]);
    expect(savedSettlement(playersFromSession(later), 1, later.manualSettlement).preferCreditors).toEqual(["א"]);
  });
  it("increments the settlement version and update time only when the saved settlement changes", () => {
    const first = saveManualPayments(session, [payment], { now: "2026-10-01T09:00:00.000Z" });
    expect(first.manualSettlement.settlementVersion).toBe(2);
    expect(first.manualSettlement.settlementUpdatedAt).toBe("2026-10-01T09:00:00.000Z");
    expect(settlementVersionLabel(first)).toMatch(/^עודכן \d{2}:\d{2} · גרסה 2$/);

    const unchanged = saveManualPayments(first, [payment], { now: "2026-10-01T09:10:00.000Z" });
    expect(unchanged).toBe(first);

    const second = saveManualPayments(first, [], { now: "2026-10-01T09:15:00.000Z" });
    expect(second.manualSettlement.settlementVersion).toBe(3);
    expect(second.manualSettlement.settlementUpdatedAt).toBe("2026-10-01T09:15:00.000Z");
  });
  it("keeps marks on unchanged transfers and resets marks on changed transfers", () => {
    const marked = markReceipt(markTransfer(session, 0, true, "א"), 1, true, "ג");
    const before = paymentPlan(marked);
    expect(before.transfers).toEqual([
      expect.objectContaining({ from: "א", to: "ב", amount: 60 }),
      expect.objectContaining({ from: "א", to: "ג", amount: 40 }),
    ]);

    const edited = saveManualPayments(marked, [{ from: "א", to: "ב", amount: 25, id: "p-change" }], {
      now: "2026-10-01T09:20:00.000Z",
    });
    const plan = paymentPlan(edited);
    const unchangedIndex = plan.transfers.findIndex((t) => t.from === "א" && t.to === "ג" && t.amount === 40);
    const changedRemainderIndex = plan.transfers.findIndex(
      (t) => t.from === "א" && t.to === "ב" && t.amount === 35 && !t.manual
    );

    expect(unchangedIndex).toBeGreaterThan(-1);
    expect(plan.received[unchangedIndex]).toBe(true);
    expect(changedRemainderIndex).toBeGreaterThan(-1);
    expect(plan.paid[changedRemainderIndex]).toBeFalsy();
    expect(plan.received[changedRemainderIndex]).toBeFalsy();
    expect(plan.confirmations).toEqual([
      expect.objectContaining({ index: unchangedIndex, action: "received", by: "ג" }),
    ]);
  });
  it("builds an edit notice when marks exist and when stale manual payments would be dropped", () => {
    const marked = markTransfer(session, 0, true, "א");
    const notice = settlementEditNotice(marked);
    expect(notice.show).toBe(true);
    expect(notice.markedCount).toBe(1);
    expect(notice.text).toContain("אפשר לערוך את החלוקה");
    expect(notice.text).toContain("יאופס");

    const withManual = saveManualPayments(session, [payment]);
    const stale = {
      ...withManual,
      entries: [
        { name: "א", amount: -50 },
        { name: "ב", amount: 50 },
      ],
    };
    const staleNotice = settlementEditNotice(stale);
    expect(staleNotice.droppedManualPayments).toBe(true);
    expect(staleNotice.text).toContain("לא יישמרו בשמירה הבאה");
  });
});
