import { describe, it, expect } from "vitest";
import {
  isoInIsrael,
  lastMonthIso,
  sameTimeLastMonth,
  moneyMoved,
  monthTotalsAsOf,
  yearTotalsAsOf,
  allTimeTotalsAsOf,
  compareToLastMonth,
  playerAllTimeDelta,
  deltaMap,
} from "../components/poker/monthCompare.js";

function db() {
  return {
    aliases: {},
    roster: ["עדן גיל", "דן ינקלויץ"],
    yearly: [
      {
        y: 2025,
        official: true,
        entries: [
          { name: "עדן גיל", amount: 200 },
          { name: "דן ינקלויץ", amount: -200 },
        ],
      },
    ],
    sessions: [
      {
        iso: "2026-07-10",
        y: 2026,
        mo: 7,
        d: 10,
        entries: [
          { name: "עדן", amount: 80 },
          { name: "דן", amount: -80 },
        ],
      },
      {
        iso: "2026-07-20",
        y: 2026,
        mo: 7,
        d: 20,
        entries: [
          { name: "עדן", amount: 40 },
          { name: "דן", amount: -40 },
        ],
      },
      {
        iso: "2026-08-08",
        y: 2026,
        mo: 8,
        d: 8,
        entries: [
          { name: "עדן", amount: 100 },
          { name: "דן", amount: -100 },
        ],
      },
    ],
  };
}

describe("anchors", () => {
  it("isoInIsrael formats YYYY-MM-DD", () => {
    expect(isoInIsrael(new Date(2026, 7, 22, 16, 30))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("lastMonthIso clamps end-of-month", () => {
    expect(lastMonthIso(new Date("2026-03-31T18:00:00+03:00"))).toBe("2026-02-28");
  });

  it("lastMonthIso keeps the day when it exists", () => {
    expect(lastMonthIso(new Date("2026-08-22T16:05:00+03:00"))).toBe("2026-07-22");
  });

  it("sameTimeLastMonth stays in the previous calendar month", () => {
    const d = sameTimeLastMonth(new Date("2026-08-22T16:05:00+03:00"));
    expect(d.getMonth()).toBe(6);
  });
});

describe("snapshots from session ledger", () => {
  it("monthTotalsAsOf ignores later nights", () => {
    const t = monthTotalsAsOf(db(), 2026, 7, "2026-07-15");
    expect(t.find((x) => x.name === "עדן גיל").amount).toBe(80);
  });

  it("yearTotalsAsOf uses sessions for the open year, official for closed years", () => {
    const open = yearTotalsAsOf(db(), 2026, "2026-07-15");
    expect(open.official).toBe(false);
    expect(open.totals.find((x) => x.name === "עדן גיל").amount).toBe(80);

    const closed = yearTotalsAsOf(db(), 2025, "2026-07-15");
    expect(closed.official).toBe(true);
    expect(closed.totals.find((x) => x.name === "עדן גיל").amount).toBe(200);
  });

  it("allTimeTotalsAsOf sums closed official + open year up to date", () => {
    const t = allTimeTotalsAsOf(db(), "2026-07-15");
    expect(t.find((x) => x.name === "עדן גיל").amount).toBe(280);
  });

  it("moneyMoved sums winners only", () => {
    expect(moneyMoved([{ amount: 80 }, { amount: -80 }, { amount: 0 }])).toBe(80);
  });
});

describe("compareToLastMonth", () => {
  const now = new Date(2026, 7, 22, 16, 0); // 22 Aug 2026

  it("all-time: now includes August, last month stops at 22 Jul", () => {
    const c = compareToLastMonth(db(), "all", 2026, 8, now);
    expect(c.asOfIso).toBe("2026-07-22");
    expect(c.deltas["עדן גיל"].current).toBe(420); // 200 + 80 + 40 + 100
    expect(c.deltas["עדן גיל"].previous).toBe(320); // 200 + 80 + 40
    expect(c.deltas["עדן גיל"].delta).toBe(100);
    expect(c.moved.delta).toBe(100);
  });

  it("current month vs last month to the same day", () => {
    const c = compareToLastMonth(db(), "month", 2026, 8, now);
    expect(c.deltas["עדן גיל"].current).toBe(100);
    expect(c.deltas["עדן גיל"].previous).toBe(120); // Jul 10+20
    expect(c.deltas["עדן גיל"].delta).toBe(-20);
  });

  it("year-to-date vs year as of last month", () => {
    const c = compareToLastMonth(db(), "year", 2026, 8, now);
    expect(c.deltas["עדן גיל"].current).toBe(220);
    expect(c.deltas["עדן גיל"].previous).toBe(120);
    expect(c.deltas["עדן גיל"].delta).toBe(100);
  });

  it("past month compares to the previous full calendar month", () => {
    const c = compareToLastMonth(db(), "month", 2026, 7, now);
    expect(c.deltas["עדן גיל"].current).toBe(120);
    expect(c.deltas["עדן גיל"].previous ?? 0).toBe(0);
  });

  it("playerAllTimeDelta reads one player", () => {
    const d = playerAllTimeDelta(db(), "עדן גיל", now);
    expect(d.delta).toBe(100);
    expect(d.previous).toBe(320);
  });

  it("deltaMap treats missing previous as 0", () => {
    const map = deltaMap([{ name: "חדש", amount: 30 }], []);
    expect(map["חדש"]).toMatchObject({ current: 30, previous: 0, delta: 30, hadPrevious: false });
  });
});
