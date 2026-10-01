import { describe, it, expect } from "vitest";
import {
  newManualTipId,
  isManualTip,
  playerTipEvents,
  applyManualTip,
  removeManualTip,
} from "../lib/manualTips.js";
import { mergeTipLogs, tipShownFor } from "../lib/liveMerge.js";

const basePlayers = () => [
  { name: "אופיר סנה", buyin: 50, cashout: "", tipsGiven: 0 },
  { name: "דור לירז", buyin: 50, cashout: "300", tipsGiven: 0 },
];

describe("manual tip ids", () => {
  it("are unique and never collide with bot-style ids", () => {
    const ids = new Set();
    for (let k = 0; k < 200; k++) ids.add(newManualTipId(1700000000000));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id.startsWith("app_")).toBe(true);
  });
});

describe("applyManualTip", () => {
  it("adds an app event and accumulates tipsGiven without touching an empty cashout", () => {
    const players = basePlayers();
    const res = applyManualTip({ players, tips: [], name: "אופיר", amount: 50, now: 1000 });
    expect(res.ok).toBe(true);
    expect(res.event).toMatchObject({ name: "אופיר סנה", amount: 50, at: 1000, src: "app" });
    expect(res.event.fromCashout).toBeUndefined();
    expect(res.players[0]).toMatchObject({ tipsGiven: 50, cashout: "" });
    expect(res.tips).toHaveLength(1);
    // הקלט לא נדרס
    expect(players[0].tipsGiven).toBe(0);
  });

  it("subtracts from a numeric cashout, like the bot", () => {
    const res = applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount: 50, now: 1000 });
    expect(res.ok).toBe(true);
    expect(res.event.fromCashout).toBe(true);
    expect(res.event.cashDelta).toBe(50);
    expect(res.players[1].cashout).toBe("250");
    expect(res.players[1].tipsGiven).toBe(50);
  });

  it("clamps at zero and records only what actually came off the stack", () => {
    const res = applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount: 350, now: 1000 });
    expect(res.players[1].cashout).toBe("0");
    expect(res.event.cashDelta).toBe(300);
  });

  it("blocks zero, empty and negative amounts", () => {
    for (const amount of [0, "", null, -20, "abc"]) {
      expect(applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount }).ok).toBe(false);
      expect(applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount }).reason).toBe("zero");
    }
  });

  it("rejects a player who is not at the table", () => {
    expect(applyManualTip({ players: basePlayers(), tips: [], name: "לא קיים", amount: 10 })).toMatchObject({ ok: false, reason: "missing" });
  });

  it("accumulates on top of bot events from the same night", () => {
    const tips = [{ id: "wamid_1", name: "דור לירז", amount: 40, at: 1 }];
    const players = [{ name: "דור לירז", buyin: 50, cashout: "300", tipsGiven: 40 }];
    const res = applyManualTip({ players, tips, name: "דור לירז", amount: 10, now: 2 });
    expect(res.players[0].tipsGiven).toBe(50);
    expect(tipShownFor(res.players[0], res.tips)).toBe(50);
  });
});

describe("removeManualTip", () => {
  it("restores the cashout and rolls tipsGiven back", () => {
    const add = applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount: 50, now: 1000 });
    const rm = removeManualTip({ players: add.players, tips: add.tips, tipId: add.event.id });
    expect(rm.ok).toBe(true);
    expect(rm.tips).toHaveLength(0);
    expect(rm.players[1]).toMatchObject({ cashout: "300", tipsGiven: 0 });
  });

  it("restores exactly the clamped delta when the tip exceeded the stack", () => {
    const add = applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount: 350, now: 1000 });
    expect(add.players[1].cashout).toBe("0");
    const rm = removeManualTip({ players: add.players, tips: add.tips, tipId: add.event.id });
    expect(rm.players[1].cashout).toBe("300");
  });

  it("removing one of two tips keeps the other (log-derived total)", () => {
    const a = applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount: 50, now: 1 });
    const b = applyManualTip({ players: a.players, tips: a.tips, name: "דור לירז", amount: 30, now: 2 });
    expect(b.players[1]).toMatchObject({ cashout: "220", tipsGiven: 80 });
    const rm = removeManualTip({ players: b.players, tips: b.tips, tipId: b.event.id });
    expect(rm.players[1]).toMatchObject({ cashout: "250", tipsGiven: 50 });
    expect(rm.tips).toHaveLength(1);
    expect(tipShownFor(rm.players[1], rm.tips)).toBe(50);
  });

  it("refuses to delete a bot event", () => {
    const tips = [{ id: "wamid_1", name: "דור לירז", amount: 40, at: 1 }];
    const res = removeManualTip({ players: basePlayers(), tips, tipId: "wamid_1" });
    expect(res).toMatchObject({ ok: false, reason: "bot_event" });
  });

  it("reports a missing event id", () => {
    expect(removeManualTip({ players: basePlayers(), tips: [], tipId: "app_none" })).toMatchObject({ ok: false, reason: "missing" });
  });

  it("still removes the event if the player already left the table", () => {
    const add = applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount: 50, now: 1 });
    const rm = removeManualTip({ players: [add.players[0]], tips: add.tips, tipId: add.event.id });
    expect(rm.ok).toBe(true);
    expect(rm.tips).toHaveLength(0);
  });
});

describe("removeManualTip restoreCashout option", () => {
  it("restoreCashout:false removes the event and recomputes tipsGiven without touching cashout", () => {
    const add = applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount: 50, now: 1000 });
    expect(add.players[1].cashout).toBe("250");
    const rm = removeManualTip({ players: add.players, tips: add.tips, tipId: add.event.id, restoreCashout: false });
    expect(rm.ok).toBe(true);
    expect(rm.tips).toHaveLength(0);
    // האירוע נמחק, tipsGiven חזר ל־0, והיציאה נשארה כמו שנרשמה (250)
    expect(rm.players[1]).toMatchObject({ cashout: "250", tipsGiven: 0 });
  });

  it("explicit restoreCashout:true keeps the default restore behavior", () => {
    const add = applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount: 50, now: 1000 });
    const rm = removeManualTip({ players: add.players, tips: add.tips, tipId: add.event.id, restoreCashout: true });
    expect(rm.players[1]).toMatchObject({ cashout: "300", tipsGiven: 0 });
  });

  it("restoreCashout:false on an event that never touched cashout behaves like a plain delete", () => {
    const add = applyManualTip({ players: basePlayers(), tips: [], name: "אופיר", amount: 50, now: 1000 });
    expect(add.event.fromCashout).toBeUndefined();
    const rm = removeManualTip({ players: add.players, tips: add.tips, tipId: add.event.id, restoreCashout: false });
    expect(rm.players[0]).toMatchObject({ cashout: "", tipsGiven: 0 });
    expect(rm.tips).toHaveLength(0);
  });

  it("restoreCashout:false keeps the other events' totals intact", () => {
    const a = applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount: 50, now: 1 });
    const b = applyManualTip({ players: a.players, tips: a.tips, name: "דור לירז", amount: 30, now: 2 });
    expect(b.players[1].cashout).toBe("220");
    const rm = removeManualTip({ players: b.players, tips: b.tips, tipId: a.event.id, restoreCashout: false });
    // האירוע הראשון (50) נמחק בלי לגעת ביציאה; נשארו 30 מהיומן והיציאה 220
    expect(rm.tips).toHaveLength(1);
    expect(rm.players[1]).toMatchObject({ cashout: "220", tipsGiven: 30 });
  });
});

describe("playerTipEvents + merge with bot log", () => {
  it("lists one player's events chronologically", () => {
    const tips = [
      { id: "b", name: "דור לירז", amount: 10, at: 5 },
      { id: "a", name: "דור לירז", amount: 40, at: 1 },
      { id: "c", name: "אופיר סנה", amount: 99, at: 3 },
    ];
    expect(playerTipEvents(tips, "דור").map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("isManualTip separates app events from bot events", () => {
    expect(isManualTip({ src: "app" })).toBe(true);
    expect(isManualTip({ id: "wamid_1" })).toBe(false);
    expect(isManualTip(null)).toBe(false);
  });

  it("manual events merge by id with bot events — no loss, no duplicates when the bot returns", () => {
    const add = applyManualTip({ players: basePlayers(), tips: [], name: "דור לירז", amount: 50, now: 1000 });
    const botTip = { id: "wamid_9", name: "דור לירז", amount: 20, at: 900 };
    const union = mergeTipLogs([botTip], add.tips);
    expect(union).toHaveLength(2);
    // מיזוג חוזר של אותו יומן (הבוט קורא את מה שהאפליקציה שמרה) לא מכפיל
    const again = mergeTipLogs(union, add.tips);
    expect(again).toHaveLength(2);
    expect(tipShownFor({ name: "דור לירז", tipsGiven: 0 }, again)).toBe(70);
  });
});
