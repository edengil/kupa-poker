import { describe, expect, it } from "vitest";
import { latestSession, sessionsForViewer } from "../lib/lastSession.js";

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
