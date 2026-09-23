import { describe, expect, it } from "vitest";
import { canMarkTransfer, isGroupAdmin } from "../lib/paymentAccess";

const transfer = (from) => ({ from, to: "שגיא גיל", amount: 40 });

describe("canMarkTransfer", () => {
  it("lets the payer mark their own transfer", () => {
    expect(canMarkTransfer({ viewerName: "אורן", transfer: transfer("אורן גיל") })).toBe(true);
  });

  it("lets a couple mark each other", () => {
    expect(canMarkTransfer({ viewerName: "עדן גיל", transfer: transfer("אורן גיל") })).toBe(true);
    expect(canMarkTransfer({ viewerName: "דור לירז", transfer: transfer("עדן לירז") })).toBe(true);
  });

  it("blocks everyone else", () => {
    expect(canMarkTransfer({ viewerName: "שגיא גיל", transfer: transfer("אורן גיל") })).toBe(false);
    expect(canMarkTransfer({ viewerName: null, transfer: transfer("אורן גיל") })).toBe(false);
  });

  it("lets the admin mark any transfer", () => {
    expect(isGroupAdmin({ email: "edengil94@gmail.com" })).toBe(true);
    expect(
      canMarkTransfer({
        viewerName: "מישהו",
        isAdmin: true,
        transfer: transfer("שגיא גיל"),
      })
    ).toBe(true);
  });
});
