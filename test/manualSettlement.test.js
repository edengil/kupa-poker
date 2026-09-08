import { describe, expect, it } from "vitest";
import {
  openingBalances,
  debtorsOf,
  creditorsOf,
  applyManualPayment,
  settleFromBalances,
  buildManualSettlementText,
  maxPayable,
} from "../lib/manualSettlement.js";

/* קופה מאוזנת: חוב 100+50 מול זכייה 150 */
const players = [
  { name: "נתנאל כהן", buyin: 100, cashout: "0" },
  { name: "דור לירז", buyin: 50, cashout: "0" },
  { name: "ירין מלאך", buyin: 50, cashout: "400" },
];

describe("manualSettlement", () => {
  it("lists debtors with full amounts and creditors", () => {
    const { balances } = openingBalances(players, 2);
    expect(debtorsOf(balances).find((d) => d.name === "נתנאל כהן").owe).toBe(100);
    expect(creditorsOf(balances).find((c) => c.name === "ירין מלאך").due).toBe(150);
  });

  it("records a full debt payment and removes the debtor from remaining transfers", () => {
    const { balances } = openingBalances(players, 2);
    const after = applyManualPayment(balances, {
      from: "נתנאל כהן",
      to: "ירין מלאך",
      amount: 100,
    });
    expect(after["נתנאל כהן"]).toBe(0);
    expect(after["ירין מלאך"]).toBe(50);
    const left = settleFromBalances(after, 2);
    expect(left.transfers.every((t) => !String(t.from).includes("נתנאל"))).toBe(true);
    expect(left.transfers.some((t) => t.from === "דור לירז" && t.to === "ירין מלאך" && t.amount === 50)).toBe(
      true
    );
  });

  it("allows a partial editable amount", () => {
    const { balances } = openingBalances(players, 2);
    const after = applyManualPayment(balances, {
      from: "נתנאל כהן",
      to: "ירין מלאך",
      amount: 40,
    });
    expect(after["נתנאל כהן"]).toBe(-60);
    expect(maxPayable(after, "נתנאל כהן", "ירין מלאך")).toBe(60);
  });

  it("rejects overpaying a debtor", () => {
    const { balances } = openingBalances(players, 2);
    expect(() =>
      applyManualPayment(balances, { from: "נתנאל כהן", to: "ירין מלאך", amount: 200 })
    ).toThrow();
  });

  it("builds WhatsApp text with manual lines first", () => {
    const text = buildManualSettlementText({
      manualPayments: [{ from: "נתנאל כהן", to: "ירין מלאך", amount: 100 }],
      remaining: {
        transfers: [{ from: "דור לירז", to: "ירין מלאך", amount: 50 }],
        shortfall: 0,
      },
      now: Date.parse("2026-09-02T01:00:00+03:00"),
    });
    expect(text.indexOf("נתנאל")).toBeLessThan(text.indexOf("דור"));
  });
});
