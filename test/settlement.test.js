import { describe, it, expect } from "vitest";
import { settle, isCashOnly, transferVerb, COUPLES } from "../lib/settlement.js";

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

describe("settle — couples cover each other first", () => {
  it("lists the expected fixed couples", () => {
    expect(COUPLES).toEqual([
      ["עדן גיל", "אורן גיל"],
      ["דור לירז", "עדן לירז"],
    ]);
  });

  it("Eden pays Oren first when he lost and she won, before others", () => {
    // cps=1 so net = cashout - buyin
    const players = [
      { name: "עדן גיל", buyin: 200, cashout: "0" }, // -200
      { name: "אורן גיל", buyin: 0, cashout: "150" }, // +150
      { name: "קובי", buyin: 0, cashout: "50" }, // +50
    ];
    const { transfers } = settle(players, 1);
    expect(transfers[0]).toMatchObject({
      from: "עדן גיל",
      to: "אורן גיל",
      amount: 150,
      pair: true,
    });
    expect(transfers[1]).toMatchObject({ from: "עדן גיל", to: "קובי", amount: 50 });
    expect(transfers).toHaveLength(2);
  });

  it("matches short names עדן/אורן to the Gil couple", () => {
    const players = [
      { name: "עדן", buyin: 100, cashout: "0" }, // -100
      { name: "אורן", buyin: 0, cashout: "100" }, // +100
      { name: "דן", buyin: 50, cashout: "0" }, // -50
      { name: "שגיא", buyin: 0, cashout: "50" }, // +50
    ];
    const { transfers } = settle(players, 1);
    expect(transfers[0]).toMatchObject({ from: "עדן", to: "אורן", amount: 100, pair: true });
    expect(transfers[1]).toMatchObject({ from: "דן", to: "שגיא", amount: 50 });
  });

  it("Dor and Eden Liraz cover each other first", () => {
    const players = [
      { name: "דור לירז", buyin: 80, cashout: "0" }, // -80
      { name: "עדן לירז", buyin: 0, cashout: "50" }, // +50
      { name: "איציק", buyin: 0, cashout: "30" }, // +30
    ];
    const { transfers } = settle(players, 1);
    expect(transfers[0]).toMatchObject({
      from: "דור לירז",
      to: "עדן לירז",
      amount: 50,
      pair: true,
    });
    expect(transfers[1]).toMatchObject({ from: "דור לירז", to: "איציק", amount: 30 });
  });

  it("does not confuse bare עדן with עדן לירז", () => {
    // עדן (=גיל) lost, עדן לירז won — they are NOT a couple
    const players = [
      { name: "עדן", buyin: 100, cashout: "0" }, // -100
      { name: "עדן לירז", buyin: 0, cashout: "100" }, // +100
    ];
    const { transfers } = settle(players, 1);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].pair).toBeUndefined();
    expect(transfers[0]).toMatchObject({ from: "עדן", to: "עדן לירז", amount: 100 });
  });

  it("skips couple cover when both are on the same side", () => {
    // both won — nothing between them; outsider pays both
    const players = [
      { name: "עדן גיל", buyin: 0, cashout: "50" }, // +50
      { name: "אורן גיל", buyin: 0, cashout: "50" }, // +50
      { name: "קובי", buyin: 100, cashout: "0" }, // -100
    ];
    const { transfers } = settle(players, 1);
    expect(transfers.every((t) => !t.pair)).toBe(true);
    expect(transfers).toHaveLength(2);
  });

  it("joint-pays when both couple members still owe", () => {
    const players = [
      { name: "דור לירז", buyin: 100, cashout: "0" }, // -100
      { name: "עדן לירז", buyin: 125, cashout: "0" }, // -125
      { name: "עדן גיל", buyin: 0, cashout: "160" }, // +160
      { name: "אופיר סנה", buyin: 0, cashout: "65" }, // +65
    ];
    const { transfers } = settle(players, 1);
    const joint = transfers.filter((t) => t.joint);
    expect(joint.length).toBeGreaterThan(0);
    expect(joint[0].from).toContain("ו");
    expect(transferVerb(joint[0].from)).toMatch(/מעביר/);
  });
});

describe("settle — Netanel avoids PayBox recipients when possible", () => {
  it("sends Netanel to Bit winners before Eden/Oren", () => {
    const players = [
      { name: "נתנאל כהן", buyin: 100, cashout: "0" }, // -100
      { name: "דן ינקלויץ", buyin: 0, cashout: "50" }, // +50
      { name: "עדן גיל", buyin: 0, cashout: "50" }, // +50 cash-only
    ];
    const { transfers } = settle(players, 1);
    expect(transfers[0]).toMatchObject({ from: "נתנאל כהן", to: "דן ינקלויץ", amount: 50 });
    expect(transfers[1]).toMatchObject({ from: "נתנאל כהן", to: "עדן גיל", amount: 50 });
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
    expect(isCashOnly("עדן גיל")).toBe(true);
    expect(isCashOnly("עדן לירז")).toBe(false);
    expect(isCashOnly("קובי")).toBe(false);
  });

  it("transferVerb uses feminine form for configured names", () => {
    expect(transferVerb("אורן")).toBe("מעבירה");
    expect(transferVerb("אורן גיל")).toBe("מעבירה");
    expect(transferVerb("עדן לירז")).toBe("מעבירה");
    expect(transferVerb("דן")).toBe("מעביר");
    expect(transferVerb("דור לירז ועדן לירז")).toBe("מעבירים");
  });
});
