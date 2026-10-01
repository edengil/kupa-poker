import { describe, it, expect } from "vitest";
import { computeLiveRebuys } from "../lib/poker/liveRebuys.js";

function ev(amount, total) {
  return [{ amount, at: 1, total }];
}

describe("computeLiveRebuys", () => {
  it("counts rebuys from buyinEvents and totals the pot", () => {
    const players = [
      { name: "עדן גיל", buyin: 150, buyinEvents: [...ev(50, 50), { amount: 50, at: 2, total: 100 }, { amount: 50, at: 3, total: 150 }] },
      { name: "קובי סעדה", buyin: 50, buyinEvents: ev(50, 50) },
    ];
    const r = computeLiveRebuys(players);
    expect(r.totalPot).toBe(200);
    expect(r.totalRebuys).toBe(2);
    expect(r.totalEntries).toBe(4);
    expect(r.topRebuyer.name).toBe("עדן גיל");
    expect(r.topRebuyer.rebuys).toBe(2);
    expect(r.rows[0].name).toBe("עדן גיל");
  });

  it("players without events get null rebuys, not an invented count", () => {
    const r = computeLiveRebuys([{ name: "עדן גיל", buyin: 200 }]);
    expect(r.rows[0].rebuys).toBeNull();
    expect(r.rows[0].entries).toBeNull();
    expect(r.knownEvents).toBe(false);
    expect(r.topRebuyer).toBeNull();
    expect(r.totalPot).toBe(200);
  });

  it("canonicalizes names via aliases", () => {
    const r = computeLiveRebuys(
      [{ name: "עדן", buyin: 50, buyinEvents: ev(50, 50) }],
      { "עדן": "עדן גיל" }
    );
    expect(r.rows[0].name).toBe("עדן גיל");
  });

  it("empty input is a clean zero board", () => {
    const r = computeLiveRebuys([]);
    expect(r.rows).toEqual([]);
    expect(r.totalPot).toBe(0);
    expect(r.topRebuyer).toBeNull();
  });
});
