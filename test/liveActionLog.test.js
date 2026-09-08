import { describe, expect, it } from "vitest";
import { appendAction, labelAction, undoLast, pickActionLog } from "../lib/liveActionLog.js";

describe("liveActionLog", () => {
  it("undoes a seat without touching other players", () => {
    const players = [
      { name: "דן", buyin: 50, cashout: "" },
      { name: "אופיר", buyin: 50, cashout: "" },
    ];
    const log = appendAction([], { t: "seat", name: "אופיר", amount: 50 });
    const out = undoLast({ players, actionLog: log });
    expect(out.players.map((p) => p.name)).toEqual(["דן"]);
    expect(out.actionLog).toHaveLength(0);
  });

  it("undoes a buy-in and pops the matching event", () => {
    const players = [
      {
        name: "דן",
        buyin: 150,
        cashout: "",
        buyinEvents: [
          { amount: 50, total: 50 },
          { amount: 100, total: 150 },
        ],
      },
    ];
    const log = [{ t: "buyin", name: "דן", amount: 100, id: "1" }];
    const out = undoLast({ players, actionLog: log });
    expect(out.players[0].buyin).toBe(50);
    expect(out.players[0].buyinEvents).toHaveLength(1);
  });

  it("undoes cashout back to the previous value", () => {
    const players = [{ name: "דן", buyin: 100, cashout: "300" }];
    const log = [{ t: "cashout", name: "דן", chips: "300", before: "", id: "1" }];
    const out = undoLast({ players, actionLog: log });
    expect(out.players[0].cashout).toBe("");
  });

  it("restores a removed player at the original index", () => {
    const removed = { name: "קובי", buyin: 100, cashout: "" };
    const players = [{ name: "דן", buyin: 50, cashout: "" }];
    const log = [{ t: "remove", name: "קובי", at: 0, player: removed, id: "1" }];
    const out = undoLast({ players, actionLog: log });
    expect(out.players.map((p) => p.name)).toEqual(["קובי", "דן"]);
  });

  it("labels actions in Hebrew", () => {
    expect(labelAction({ t: "buyin", name: "דן", amount: 50 })).toContain("דן");
    expect(labelAction({ t: "cashout", name: "דן", chips: 200 })).toContain("יצא");
  });

  it("undoes couple fill via stackAdj when cashout is empty", () => {
    const players = [
      { name: "עדן גיל", buyin: 100, cashout: "", stackAdj: -30 },
      { name: "אורן גיל", buyin: 100, cashout: "", stackAdj: 30 },
    ];
    const log = [{ t: "fill", from: "עדן גיל", to: "אורן גיל", chips: 30, id: "1" }];
    const out = undoLast({
      players,
      coupleFills: [{ from: "עדן גיל", to: "אורן גיל", chips: 30 }],
      actionLog: log,
    });
    expect(out.players[0].stackAdj).toBe(0);
    expect(out.players[1].stackAdj).toBe(0);
    expect(out.coupleFills).toHaveLength(0);
  });

  it("prefers the longer local log unless remote is preferred", () => {
    expect(pickActionLog([{ id: 1 }, { id: 2 }], [{ id: 3 }], false)).toHaveLength(2);
    expect(pickActionLog([{ id: 1 }], [{ id: 3 }, { id: 4 }], true)).toHaveLength(2);
  });
});
