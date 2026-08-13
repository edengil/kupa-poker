import { describe, it, expect } from "vitest";
import { settle, isCashOnly, transferVerb } from "../lib/settlement.js";

/* cps=2 → net = cashout/2 - buyin. */

describe("settle — basic balance", () => {
  it("moves the whole loss from the loser to the single winner", () => {
    // A: net +100, B: net -100
    const players = [
      { name: "A", buyin: 100, cashout: "400" }, // 400/2-100 = +100
      { name: "B", buyin: 100, cashout: "0" }, // 0/2-100 = -100
    ];
    const { transfers, shortfall, surplus } = settle(players, 2);
    expect(shortfall).toBe(0);
    expect(surplus).toBe(0);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ from: "B", to: "A", amount: 100 });
  });

  it("every transfer amount is positive and winners are fully paid", () => {
    const players = [
      { name: "A", buyin: 0, cashout: "200" }, // +100
      { name: "B", buyin: 0, cashout: "100" }, // +50
      { name: "C", buyin: 100, cashout: "0" }, // -100
    ];
    const { transfers, shortfall, nets } = settle(players, 2);
    // total = +50 → shortfall distributed among winners
    expect(shortfall).toBe(50);
    for (const t of transfers) expect(t.amount).toBeGreaterThan(0);
    // each winner receives exactly their adjusted net
    for (const { name, net } of nets) {
      if (net > 0) {
        const received = transfers.filter((t) => t.to === name).reduce((s, t) => s + t.amount, 0);
        expect(received).toBe(net);
      }
    }
  });
});

describe("settle — biggest loser pays biggest winner", () => {
  it("routes the biggest loss straight to the biggest win, no fixed-pair detour", () => {
    // cps=1 so net = cashout - buyin
    const players = [
      { name: "קובי", buyin: 200, cashout: "0" }, // -200 biggest loser
      { name: "אורן", buyin: 0, cashout: "200" }, // +200 biggest winner
      { name: "עדן", buyin: 50, cashout: "0" }, // -50
      { name: "דנה", buyin: 0, cashout: "50" }, // +50
    ];
    const { transfers } = settle(players, 1);
    expect(transfers).toHaveLength(2);
    // biggest loser -> biggest winner, in full
    expect(transfers[0]).toMatchObject({ from: "קובי", to: "אורן", amount: 200 });
    expect(transfers[1]).toMatchObject({ from: "עדן", to: "דנה", amount: 50 });
    // the old fixed-pair flag is gone
    expect(transfers.every((t) => !("pair" in t))).toBe(true);
  });
});

describe("settle — unfinished players", () => {
  it("lists players without a cashout as unfinished", () => {
    const players = [
      { name: "A", buyin: 100, cashout: "" },
      { name: "B", buyin: 100, cashout: "200" },
    ];
    const { unfinished } = settle(players, 2);
    expect(unfinished).toContain("A");
    expect(unfinished).not.toContain("B");
  });
});

describe("helpers", () => {
  it("isCashOnly matches exact names only", () => {
    expect(isCashOnly("עדן")).toBe(true);
    expect(isCashOnly("אורן")).toBe(true);
    expect(isCashOnly("עדן לירז")).toBe(false);
    expect(isCashOnly("קובי")).toBe(false);
  });

  it("transferVerb uses feminine form for configured names", () => {
    expect(transferVerb("אורן")).toBe("מעבירה");
    expect(transferVerb("עדן לירז")).toBe("מעבירה");
    expect(transferVerb("דן")).toBe("מעביר");
  });
});
