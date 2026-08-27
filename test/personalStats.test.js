import { describe, it, expect } from "vitest";
import {
  computePersonalStats,
  personalStatRows,
  rebuyGapsMs,
  formatGapMs,
} from "../components/poker/personalStats.js";

function dbOf(nights) {
  return {
    aliases: {},
    roster: ["עדן גיל", "קובי סעדה", "נתנאל כהן"],
    yearly: [],
    sessions: nights,
  };
}

describe("rebuyGapsMs / formatGapMs", () => {
  it("returns empty without two timestamps", () => {
    expect(rebuyGapsMs([])).toEqual([]);
    expect(rebuyGapsMs([{ at: 1 }])).toEqual([]);
  });

  it("averages gaps between extra buy-ins", () => {
    const gaps = rebuyGapsMs([
      { at: 0, amount: 50 },
      { at: 10 * 60000, amount: 50 },
      { at: 25 * 60000, amount: 50 },
    ]);
    expect(gaps).toEqual([10 * 60000, 15 * 60000]);
  });

  it("formats minutes and hours", () => {
    expect(formatGapMs(30 * 60000)).toBe("30 דק׳");
    expect(formatGapMs(90 * 60000)).toBe("שעה ו-30 דק׳");
  });
});

describe("computePersonalStats", () => {
  const db = dbOf([
    {
      iso: "2026-08-01",
      d: 1,
      mo: 8,
      y: 2026,
      entries: [
        { name: "עדן", amount: 400, buyin: 100 },
        { name: "קובי", amount: -400, buyin: 150 },
      ],
    },
    {
      iso: "2026-08-08",
      d: 8,
      mo: 8,
      y: 2026,
      entries: [
        { name: "עדן גיל", amount: -60, buyin: 200 },
        { name: "קובי סעדה", amount: 60, buyin: 50 },
      ],
    },
    {
      iso: "2026-08-15",
      d: 15,
      mo: 8,
      y: 2026,
      startedAt: 1,
      endedAt: 1 + 2 * 3600000,
      entries: [
        {
          name: "עדן גיל",
          amount: 80,
          buyin: 150,
          buyinEvents: [
            { amount: 50, at: 1000, total: 50 },
            { amount: 100, at: 1000 + 20 * 60000, total: 150 },
          ],
        },
        { name: "נתנאל", amount: -80, buyin: 50 },
      ],
    },
  ]);

  it("computes biggest win/loss, nights, win rate, avg entries", () => {
    const s = computePersonalStats(db, "עדן גיל", { chat: false });
    expect(s.nights).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.bestNight.amount).toBe(400);
    expect(s.worstNight.amount).toBe(-60);
    expect(s.avgEntries).toBeCloseTo((100 / 50 + 200 / 50 + 150 / 50) / 3);
    expect(s.mostEntries.entries).toBe(4); // 200/50
  });

  it("computes average rebuy gap when timestamps exist", () => {
    const s = computePersonalStats(db, "עדן גיל", { chat: false });
    expect(s.avgRebuyGapMs).toBe(20 * 60000);
    expect(s.rebuyGapNights).toBe(1);
  });

  it("is honest when there are no rebuy timestamps", () => {
    const s = computePersonalStats(db, "קובי סעדה", { chat: false });
    expect(s.avgRebuyGapMs).toBeNull();
    const rows = personalStatRows(s);
    const gap = rows.find((r) => r.title.includes("כניסה נוספת"));
    expect(gap.detail).toMatch(/אין חותמות/);
  });

  it("returns null for unknown player", () => {
    expect(computePersonalStats(db, "מישהו", { chat: false })).toBeNull();
  });

  it("personalStatRows always includes biggest win and avg entries", () => {
    const rows = personalStatRows(computePersonalStats(db, "עדן גיל", { chat: false }));
    expect(rows.some((r) => r.title === "הרווח הכי גדול")).toBe(true);
    expect(rows.some((r) => r.title === "ממוצע כניסות")).toBe(true);
    expect(rows.some((r) => r.title === "כל כמה זמן כניסה נוספת")).toBe(true);
  });

  it("fills rebuy gaps from chat timestamps when live has none", () => {
    const t0 = Date.parse("2024-09-20T21:00:00+03:00");
    const t1 = t0 + 40 * 60000;
    const s = computePersonalStats(db, "נתנאל כהן", {
      chatNights: {
        "2026-08-15": { n: 2, t: [t0, t1], a: [50, 50] },
      },
    });
    expect(s.avgRebuyGapMs).toBe(40 * 60000);
    expect(s.rebuyGapNights).toBe(1);
    expect(s.avgEntries).toBe(1);
  });
});
