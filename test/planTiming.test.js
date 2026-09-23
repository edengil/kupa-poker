import { describe, expect, it } from "vitest";
import { isPlanStale } from "../lib/planTiming";

describe("isPlanStale", () => {
  it("keeps today and future plans even if a session exists that day", () => {
    expect(isPlanStale({ iso: "2026-09-23" }, "2026-09-23")).toBe(false);
    expect(isPlanStale({ iso: "2026-09-24" }, "2026-09-23")).toBe(false);
  });

  it("marks only past dates as stale", () => {
    expect(isPlanStale({ iso: "2026-09-22" }, "2026-09-23")).toBe(true);
    expect(isPlanStale(null, "2026-09-23")).toBe(false);
  });
});
