import { describe, it, expect } from "vitest";
import { buildReport, partitionByNet, formatExitBlocks, sortByBuyinDesc } from "../lib/report.js";

describe("sortByBuyinDesc — kilometer", () => {
  it("orders active players by buy-in descending", () => {
    const players = [
      { name: "עדן", buyin: 100, cashout: "" },
      { name: "קובי", buyin: 150, cashout: "" },
      { name: "נתנאל", buyin: 50, cashout: "" },
    ];
    expect(sortByBuyinDesc(players).map((p) => p.name)).toEqual(["קובי", "עדן", "נתנאל"]);
  });

  it("reorders after another buy-in", () => {
    const players = [
      { name: "עדן", buyin: 200, cashout: "" },
      { name: "קובי", buyin: 150, cashout: "" },
      { name: "נתנאל", buyin: 50, cashout: "" },
    ];
    const text = buildReport({ players, now: Date.parse("2026-08-27T21:00:00+03:00") });
    const bit = text.split("\n\n").find((b) => b.includes("ביט"));
    const names = bit.split("\n").map((l) => l.split(" ")[0]);
    expect(names).toEqual(["עדן", "קובי", "נתנאל"]);
  });
});

describe("partitionByNet / formatExitBlocks", () => {
  const cps = 2;
  const players = [
    { name: "עדן", buyin: 100, cashout: "80" }, // 40-100 = -60
    { name: "דור", buyin: 150, cashout: "0" }, // 0-150 = -150
    { name: "קובי", buyin: 50, cashout: "140" }, // 70-50 = +20
    { name: "פתוח", buyin: 50, cashout: "" },
  ];

  it("winners first, then losers least-loss-first; open last", () => {
    const { winners, losers, open } = partitionByNet(players, cps);
    expect(winners.map((x) => x.p.name)).toEqual(["קובי"]);
    expect(losers.map((x) => x.p.name)).toEqual(["עדן", "דור"]);
    expect(open.map((p) => p.name)).toEqual(["פתוח"]);
  });

  it("inserts a blank line between winners and losers", () => {
    const text = formatExitBlocks(players, cps);
    expect(text).toContain("קובי מגיע 20₪");
    expect(text).toContain("עדן חייב 60₪");
    expect(text).toContain("דור חייב 150₪");
    const kobi = text.indexOf("קובי");
    const eden = text.indexOf("עדן");
    const dor = text.indexOf("דור");
    expect(kobi).toBeLessThan(eden);
    expect(eden).toBeLessThan(dor);
    expect(text.slice(kobi, eden)).toMatch(/\n\n/);
  });
});
