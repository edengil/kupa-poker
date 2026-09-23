import { describe, expect, it } from "vitest";
import { allTransfersPaid, buildSettlementClosedText } from "../lib/settlementClosed";

function session(paid = false) {
  return {
    id: "s1",
    iso: "2026-09-14",
    d: 14,
    mo: 9,
    y: 2026,
    cps: 1,
    entries: [
      { name: "א", amount: -100 },
      { name: "ב", amount: 100 },
    ],
    payments: paid
      ? {
          plan: JSON.stringify([{ from: "א", to: "ב", amount: 100 }]),
          paid: { 0: true },
        }
      : undefined,
  };
}

describe("settlement closed", () => {
  it("is closed only when every transfer is marked", () => {
    expect(allTransfersPaid(session(false))).toBe(false);
    expect(allTransfersPaid(session(true))).toBe(true);
  });

  it("announces with the night link", () => {
    const text = buildSettlementClosedText(session(true), {
      siteUrl: "https://example.com",
      slug: "kupa",
    });
    expect(text).toContain("החלוקה סגורה");
    expect(text).toContain("כולם סימנו שהעבירו");
    expect(text).toContain("https://example.com/g/kupa/n/s1");
  });
});
