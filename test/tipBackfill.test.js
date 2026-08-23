import { describe, it, expect } from "vitest";
import { applyTipBackfill, TIP_BACKFILL } from "../components/poker/tipBackfill.js";
import { tipSummaryForSession } from "../lib/nightShare.js";
import { sessionTips } from "../components/poker/tipRecords.js";

describe("tip backfill Eden → Oren 30 on 2026-08-23", () => {
  it("defines the one-shot Eden tip for 23.8.2026", () => {
    expect(TIP_BACKFILL).toEqual([
      expect.objectContaining({
        id: "tip-backfill:2026-08-23:eden-gil-30",
        nightIso: "2026-08-23",
        name: "עדן גיל",
        amount: 30,
        to: "אורן גיל",
      }),
    ]);
  });

  it("adds tipsGiven on matching session and is idempotent", () => {
    const db = {
      aliases: {},
      sessions: [
        {
          iso: "2026-08-23",
          d: 23,
          mo: 8,
          y: 2026,
          entries: [
            { name: "עדן גיל", amount: 40, tipsGiven: 0 },
            { name: "אורן גיל", amount: -40, tipsGiven: 0 },
          ],
        },
      ],
    };
    expect(applyTipBackfill(db)).toBe(true);
    expect(db.sessions[0].entries[0].tipsGiven).toBe(30);
    expect(db.sessions[0].tipBackfills).toContain("tip-backfill:2026-08-23:eden-gil-30");
    expect(applyTipBackfill(db)).toBe(false);
    expect(db.sessions[0].entries[0].tipsGiven).toBe(30);
  });

  it("matches session saved after midnight (iso next day)", () => {
    const db = {
      aliases: {},
      sessions: [
        {
          iso: "2026-08-24",
          entries: [{ name: "עדן", amount: 10 }],
        },
      ],
    };
    expect(applyTipBackfill(db)).toBe(true);
    expect(db.sessions[0].entries[0].tipsGiven).toBe(30);
  });

  it("pushes tip event when tips[] already has history", () => {
    const db = {
      aliases: {},
      sessions: [
        {
          iso: "2026-08-23",
          tips: [{ name: "אופיר סנה", amount: 10, at: 1 }],
          entries: [
            { name: "עדן גיל", amount: 20, tipsGiven: 0 },
            { name: "אופיר סנה", amount: -20, tipsGiven: 10 },
          ],
        },
      ],
    };
    expect(applyTipBackfill(db)).toBe(true);
    expect(db.sessions[0].tips).toHaveLength(2);
    expect(db.sessions[0].tips[1]).toMatchObject({
      id: "tip-backfill:2026-08-23:eden-gil-30",
      name: "עדן גיל",
      amount: 30,
      to: "אורן גיל",
    });
    expect(db.sessions[0].entries[0].tipsGiven).toBe(30);
  });

  it("shows Eden in night tip summary via tipsGiven", () => {
    const session = {
      iso: "2026-08-23",
      entries: [
        { name: "עדן גיל", amount: 50, tipsGiven: 0 },
        { name: "אורן גיל", amount: -50, tipsGiven: 0 },
      ],
    };
    const db = { aliases: {}, sessions: [session] };
    applyTipBackfill(db);
    const summary = tipSummaryForSession(session);
    expect(summary).toContain("עדן גיל");
    expect(summary).toContain("30");
    expect(sessionTips(session).some((t) => t.name === "עדן גיל" && t.amount === 30)).toBe(true);
  });
});
