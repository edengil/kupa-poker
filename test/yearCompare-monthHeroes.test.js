import { describe, it, expect } from "vitest";
import { computeMonthHeroes, currentCalendarMonth } from "../lib/poker/monthHeroes.js";
import { playerBalanceBreakdown, availableYears } from "../lib/poker/totals.js";
import { computePersonalStats } from "../lib/poker/personalStats.js";

function dbMulti() {
  return {
    aliases: {},
    roster: ["עדן גיל", "קובי סעדה"],
    yearly: [
      {
        id: "y25",
        y: 2025,
        official: true,
        entries: [
          { name: "עדן גיל", amount: 200 },
          { name: "קובי סעדה", amount: -200 },
        ],
      },
    ],
    sessions: [
      {
        id: "a",
        iso: "2025-03-10",
        y: 2025,
        mo: 3,
        d: 10,
        entries: [
          { name: "עדן", amount: 80 },
          { name: "קובי", amount: -80 },
        ],
      },
      {
        id: "b",
        iso: "2025-08-15",
        y: 2025,
        mo: 8,
        d: 15,
        entries: [
          { name: "עדן", amount: 40 },
          { name: "קובי", amount: -40 },
        ],
      },
      {
        id: "c",
        iso: "2026-03-10",
        y: 2026,
        mo: 3,
        d: 10,
        entries: [
          { name: "עדן", amount: 100 },
          { name: "קובי", amount: -100 },
        ],
      },
      {
        id: "d",
        iso: "2026-08-20",
        y: 2026,
        mo: 8,
        d: 20,
        entries: [
          { name: "עדן", amount: 50 },
          { name: "קובי", amount: -50 },
        ],
      },
    ],
  };
}

describe("monthHeroes", () => {
  const db = dbMulti();

  it("picks hero and flop for calendar month", () => {
    const h = computeMonthHeroes(db, 2026, 8);
    expect(h.hero).toEqual({ name: "עדן גיל", amount: 50 });
    expect(h.flop).toEqual({ name: "קובי סעדה", amount: -50 });
    expect(h.label).toContain("2026");
  });

  it("returns nulls when no sessions that month", () => {
    const h = computeMonthHeroes(db, 2026, 1);
    expect(h.hero).toBeNull();
    expect(h.flop).toBeNull();
  });

  it("currentCalendarMonth uses now", () => {
    const c = currentCalendarMonth({ now: new Date(2026, 7, 1) });
    expect(c).toEqual({ y: 2026, mo: 8 });
  });
});

describe("year filter — balance + personal stats", () => {
  const db = dbMulti();

  it("availableYears lists descending", () => {
    expect(availableYears(db)).toEqual([2026, 2025]);
  });

  it("playerBalanceBreakdown scopes to one year with official", () => {
    const b = playerBalanceBreakdown(db, "עדן", { year: 2025 });
    expect(b.sessionsNet).toBe(120);
    expect(b.tableNet).toBe(200);
    expect(b.gap).toBe(80);
    expect(b.adjustments).toHaveLength(1);
    expect(b.adjustments[0].y).toBe(2025);
  });

  it("playerBalanceBreakdown for year without official", () => {
    const b = playerBalanceBreakdown(db, "עדן", { year: 2026 });
    expect(b.sessionsNet).toBe(150);
    expect(b.tableNet).toBe(150);
    expect(b.gap).toBe(0);
    expect(b.adjustments).toEqual([]);
  });

  it("computePersonalStats filters nights by year", () => {
    const s = computePersonalStats(db, "עדן גיל", { chat: false, year: 2026 });
    expect(s.nights).toBe(2);
    expect(s.year).toBe(2026);
    expect(s.totalNet).toBe(150);
    expect(s.bestNight.amount).toBe(100);
  });
});
