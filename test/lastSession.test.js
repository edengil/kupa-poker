import { describe, expect, it } from "vitest";
import { latestSession, pastSettlementSessions, sessionsForViewer } from "../lib/lastSession.js";

describe("lastSession", () => {
  it("prefers endedAt over iso when choosing the latest night", () => {
    const sessions = [
      { id: "a", iso: "2026-09-12", endedAt: 100 },
      { id: "b", iso: "2026-09-10", endedAt: 500 },
    ];
    expect(latestSession(sessions).id).toBe("b");
  });

  it("falls back to iso when endedAt is missing", () => {
    const sessions = [
      { id: "a", iso: "2026-09-01" },
      { id: "b", iso: "2026-09-15" },
    ];
    expect(latestSession(sessions).id).toBe("b");
  });

  it("limits viewer sessions to the latest when history is hidden", () => {
    const sessions = [
      { id: "a", iso: "2026-09-01" },
      { id: "b", iso: "2026-09-15" },
    ];
    expect(sessionsForViewer(sessions, { shareHistory: false })).toEqual([
      { id: "b", iso: "2026-09-15" },
    ]);
    expect(sessionsForViewer(sessions, { shareHistory: true })).toHaveLength(2);
  });
});

describe("pastSettlementSessions — a newer night does not hide older settlements", () => {
  const night = (id, iso, endedAt, extra = {}) => ({ id, iso, endedAt, entries: [], ...extra });
  const sessions = [
    night("old", "2025-01-01", 1),
    night("s14", "2026-09-14", 14, { payments: { paid: {} } }),
    night("s23", "2026-09-23", 23, { payments: { paid: { 0: true } } }),
    night("s19", "2026-09-19", 19, { manualSettlement: { manualPayments: [] } }),
    night("s26", "2026-09-26", 26, { payments: { paid: {} } }),
  ];

  it("lists older tracked nights newest first, without the latest night", () => {
    expect(latestSession(sessions).id).toBe("s26");
    expect(pastSettlementSessions(sessions).map((s) => s.id)).toEqual(["s23", "s19", "s14"]);
  });

  it("keeps a fully paid night in the list", () => {
    const paidOff = sessions.map((s) =>
      s.id === "s23" ? { ...s, payments: { paid: { 0: true, 1: true }, received: {} } } : s
    );
    expect(pastSettlementSessions(paidOff).map((s) => s.id)).toContain("s23");
  });

  it("skips the night already shown by a night link", () => {
    expect(pastSettlementSessions(sessions, { excludeId: "s23" }).map((s) => s.id)).toEqual(["s19", "s14"]);
  });

  it("handles a missing list", () => {
    expect(pastSettlementSessions(undefined)).toEqual([]);
  });
});
