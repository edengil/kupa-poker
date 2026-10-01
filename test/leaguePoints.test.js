import { describe, it, expect } from "vitest";
import { computeLeague, nightPlacements, pointsForRank } from "../lib/poker/leaguePoints.js";

function night(iso, entries) {
  const [y, mo, d] = iso.split("-").map(Number);
  return {
    id: iso,
    iso,
    d,
    mo,
    y,
    entries: Object.entries(entries).map(([name, amount]) => ({ name, amount })),
  };
}

const db = {
  aliases: {},
  roster: [],
  yearly: [],
  sessions: [
    night("2026-01-01", { "עדן גיל": 300, "קובי סעדה": 100, "דור לירז": -50, "נתנאל כהן": -350 }),
    night("2026-01-08", { "עדן גיל": -100, "קובי סעדה": 250, "דור לירז": 50, "נתנאל כהן": -200 }),
    night("2025-12-31", { "עדן גיל": 999, "קובי סעדה": -999 }),
  ],
};

describe("pointsForRank", () => {
  it("10/7/5/3/1 then zero", () => {
    expect([1, 2, 3, 4, 5, 6].map(pointsForRank)).toEqual([10, 7, 5, 3, 1, 0]);
  });
});

describe("nightPlacements", () => {
  it("ties share rank and points", () => {
    const s = night("2026-02-01", { a: 100, b: 100, c: -50, d: -150 });
    const rows = nightPlacements(s, {});
    expect(rows.map((r) => [r.name, r.rank, r.points])).toEqual([
      ["a", 1, 10],
      ["b", 1, 10],
      ["c", 3, 5],
      ["d", 4, 3],
    ]);
  });
});

describe("computeLeague", () => {
  it("aggregates one season, ignores other years", () => {
    const league = computeLeague(db, 2026);
    expect(league.nights).toBe(2);
    const eden = league.rows.find((r) => r.name === "עדן גיל");
    const kobi = league.rows.find((r) => r.name === "קובי סעדה");
    expect(eden.points).toBe(10 + 5); // מקום 1 ואז מקום 3
    expect(kobi.points).toBe(7 + 10);
    expect(kobi.wins).toBe(1);
    expect(eden.podiums).toBe(2);
    expect(league.rows[0].name).toBe("קובי סעדה");
  });

  it("returns null for a year without nights", () => {
    expect(computeLeague(db, 2024)).toBeNull();
    expect(computeLeague(null, 2026)).toBeNull();
  });
});
