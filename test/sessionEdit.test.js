import { describe, it, expect } from "vitest";
import { applySessionEdit } from "../lib/sessionEdit.js";

describe("applySessionEdit", () => {
  it("replaces the same session and keeps tips / settlement", () => {
    const session = {
      id: "s1",
      d: 14,
      mo: 9,
      y: 2026,
      iso: "2026-09-14",
      tips: [{ name: "עדן", amount: 5 }],
      manualSettlement: { transfers: [] },
      entries: [
        { name: "עדן", amount: 100 },
        { name: "אורן", amount: -100 },
      ],
    };
    const db = {
      sessions: [session, { id: "s0", iso: "2026-09-02", entries: [] }],
      deletedSessionIds: ["s1"],
    };
    const next = applySessionEdit(db, session, {
      raw: "סיכום פוקר 14.9\nעדן מגיע 50\nאורן חייבת 50",
      entries: [
        { name: "עדן", amount: 50 },
        { name: "אורן", amount: -50 },
      ],
      date: { d: 14, mo: 9, y: 2026, iso: "2026-09-14" },
    });
    expect(next.sessions).toHaveLength(2);
    const updated = next.sessions.find((s) => s.id === "s1");
    expect(updated.entries[0].amount).toBe(50);
    expect(updated.tips).toEqual([{ name: "עדן", amount: 5 }]);
    expect(updated.manualSettlement).toEqual({ transfers: [] });
    expect(next.deletedSessionIds).toEqual([]);
  });
});
