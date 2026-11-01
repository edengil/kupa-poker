import { describe, expect, it } from "vitest";
import { parseBuyinEditInput, applyBuyinEdit, MAX_BUYIN_EDIT } from "../lib/liveBuyinEdit.js";
import { appendAction, labelAction, undoLast } from "../lib/liveActionLog.js";
import { playerChips } from "../lib/liveView";
import { computeLiveRebuys } from "../lib/poker/liveRebuys.js";

/* שחקן כמו בצילום של עדן: קנה 50+50+60 = 160₪, מתג 5% דלוק (pot לכל אירוע) */
const eden = () => ({
  name: "עדן גיל",
  buyin: 160,
  cashout: "",
  buyinEvents: [
    { amount: 50, at: 1000, total: 50, pot: 2.5 },
    { amount: 50, at: 2000, total: 100, pot: 2.5 },
    { amount: 60, at: 3000, total: 160, pot: 3 },
  ],
});

const sum = (evs, k) => evs.reduce((s, e) => s + (+e[k] || 0), 0);

describe("parseBuyinEditInput", () => {
  it("accepts integers and decimals within the cap", () => {
    expect(parseBuyinEditInput("150")).toEqual({ ok: true, value: 150 });
    expect(parseBuyinEditInput("150.5")).toEqual({ ok: true, value: 150.5 });
    expect(parseBuyinEditInput(" 0 ")).toEqual({ ok: true, value: 0 });
    expect(parseBuyinEditInput(String(MAX_BUYIN_EDIT))).toEqual({
      ok: true,
      value: MAX_BUYIN_EDIT,
    });
  });

  it("rejects empty, non-numeric, negative and over-cap input", () => {
    for (const bad of ["", "   ", "abc", "12a", "-5", "1e3", ".5", "1.234", null, undefined]) {
      expect(parseBuyinEditInput(bad).ok).toBe(false);
    }
    expect(parseBuyinEditInput(String(MAX_BUYIN_EDIT + 1)).ok).toBe(false);
  });
});

describe("applyBuyinEdit", () => {
  it("edits down (160→150): last event absorbs the delta, count and pot stay consistent", () => {
    const p = eden();
    const out = applyBuyinEdit(p, 150, { savings5: true });
    expect(out.buyin).toBe(150);
    expect(out.buyinEvents).toHaveLength(3);
    expect(out.buyinEvents.map((e) => e.amount)).toEqual([50, 50, 50]);
    expect(out.buyinEvents.map((e) => e.total)).toEqual([50, 100, 150]);
    expect(sum(out.buyinEvents, "amount")).toBe(150);
    expect(sum(out.buyinEvents, "pot")).toBe(7.5);
    /* תצוגת הג'יטונים נגזרת מהאירועים — (150 − 7.5) × 2 */
    expect(playerChips(out, 2)).toBe(285);
    /* המקור לא שונה */
    expect(p.buyin).toBe(160);
    expect(p.buyinEvents[2].amount).toBe(60);
  });

  it("edits up (160→200): last event grows, no new entry is fabricated", () => {
    const out = applyBuyinEdit(eden(), 200, { savings5: true });
    expect(out.buyin).toBe(200);
    expect(out.buyinEvents.map((e) => e.amount)).toEqual([50, 50, 100]);
    expect(out.buyinEvents.map((e) => e.total)).toEqual([50, 100, 200]);
    expect(sum(out.buyinEvents, "pot")).toBe(10);
    const before = computeLiveRebuys([eden()]);
    const after = computeLiveRebuys([out]);
    expect(after.rows[0].entries).toBe(before.rows[0].entries);
    expect(after.rows[0].rebuys).toBe(before.rows[0].rebuys);
  });

  it("edits down across events (160→40): reduction walks backwards LIFO", () => {
    const out = applyBuyinEdit(eden(), 40, { savings5: true });
    expect(out.buyin).toBe(40);
    expect(out.buyinEvents).toHaveLength(1);
    expect(out.buyinEvents[0].amount).toBe(40);
    expect(out.buyinEvents[0].total).toBe(40);
    expect(out.buyinEvents[0].pot).toBe(2);
    expect(sum(out.buyinEvents, "amount")).toBe(40);
  });

  it("edits to zero: a single zeroed first event remains", () => {
    const out = applyBuyinEdit(eden(), 0, { savings5: true });
    expect(out.buyin).toBe(0);
    expect(out.buyinEvents).toHaveLength(1);
    expect(out.buyinEvents[0].amount).toBe(0);
    expect(out.buyinEvents[0].total).toBe(0);
    expect(out.buyinEvents[0].pot).toBeUndefined();
  });

  it("keeps events pot-free when the savings toggle is off and none had pot", () => {
    const p = eden();
    p.buyinEvents = p.buyinEvents.map(({ pot, ...e }) => e);
    const out = applyBuyinEdit(p, 150, { savings5: false });
    expect(out.buyinEvents.map((e) => e.amount)).toEqual([50, 50, 50]);
    expect(out.buyinEvents.every((e) => e.pot === undefined)).toBe(true);
    expect(playerChips(out, 2)).toBe(300);
  });

  it("player without events: only buyin changes, no history is fabricated", () => {
    const p = { name: "דן", buyin: 160, cashout: "" };
    const out = applyBuyinEdit(p, 150, { savings5: true });
    expect(out.buyin).toBe(150);
    expect(out.buyinEvents).toBeUndefined();
  });

  it("same value is a no-op returning the identical object", () => {
    const p = eden();
    expect(applyBuyinEdit(p, 160, { savings5: true })).toBe(p);
  });

  it("works after a cashout was entered — buyin changes, cashout untouched", () => {
    const p = { ...eden(), cashout: "500" };
    const out = applyBuyinEdit(p, 150, { savings5: true });
    expect(out.buyin).toBe(150);
    expect(out.cashout).toBe("500");
  });
});

describe("buyinEdit undo + label", () => {
  it("undo restores buyin and events exactly, including a cross-event edit", () => {
    const p = eden();
    const edited = applyBuyinEdit(p, 40, { savings5: true });
    const before = {
      buyin: p.buyin,
      buyinEvents: p.buyinEvents.map((e) => ({ ...e })),
    };
    const log = appendAction([], { t: "buyinEdit", name: p.name, before, after: 40 });
    const out = undoLast({ players: [edited], actionLog: log });
    expect(out.players[0].buyin).toBe(160);
    expect(out.players[0].buyinEvents).toEqual(p.buyinEvents);
    expect(out.actionLog).toHaveLength(0);
  });

  it("undo of an edit on an event-less player restores buyin and no events", () => {
    const p = { name: "דן", buyin: 150, cashout: "" };
    const log = appendAction([], {
      t: "buyinEdit",
      name: "דן",
      before: { buyin: 160, buyinEvents: undefined },
      after: 150,
    });
    const out = undoLast({ players: [p], actionLog: log });
    expect(out.players[0].buyin).toBe(160);
    expect(out.players[0].buyinEvents).toBeUndefined();
  });

  it("labels the correction with old and new totals", () => {
    const label = labelAction({
      t: "buyinEdit",
      name: "עדן גיל",
      before: { buyin: 160 },
      after: 150,
    });
    expect(label).toContain("150");
    expect(label).toContain("160");
  });
});
