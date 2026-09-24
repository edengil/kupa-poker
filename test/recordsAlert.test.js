import { describe, it, expect } from "vitest";
import { normalizeRecordAlertLines } from "../lib/poker/recordsAlert.js";

describe("normalizeRecordAlertLines", () => {
  it("returns null for empty / invalid", () => {
    expect(normalizeRecordAlertLines(null)).toBeNull();
    expect(normalizeRecordAlertLines([])).toBeNull();
    expect(normalizeRecordAlertLines("x")).toBeNull();
  });

  it("keeps non-empty strings", () => {
    expect(normalizeRecordAlertLines(["🔥 שיא", "", "  ", "🐐 מלך"])).toEqual([
      "🔥 שיא",
      "🐐 מלך",
    ]);
  });
});
