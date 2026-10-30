import { describe, it, expect } from "vitest";
import { applyCommands } from "../lib/whatsapp.js";
import { playerChips } from "../lib/liveView";
import { computeLiveRebuys } from "../lib/poker/liveRebuys.js";

/* גל 2ב (ממצא ביקורת 6): כל נתיבי הקנייה בבוט עוברים דרך חותמת מרכזית אחת,
   זהה לאפליקציה — החוב נשאר מלא, 5% מהקנייה נרשם כ־pot על האירוע (בשקלים)
   ומצטבר ב־savingsPot, ואירוע קנייה אחד בדיוק נוצר לכל קנייה.
   הג'יטונים נאמתים מול playerChips של האפליקציה עצמה:
   (buyin − Σ pot) × cps. */

const known = ["עדן גיל", "קובי סעדה", "דוד בני גיל"];
const T0 = 1_700_000_000_000;

function seatDirect(live, name, amount, msgId, cps = 2) {
  return applyCommands(live, [{ kind: "add", name, amount }], msgId, cps, {
    knownNames: known,
    now: T0,
  }).live;
}

function expectPotInvariant(live) {
  const sumPots = live.players.reduce(
    (s, p) => s + (p.buyinEvents || []).reduce((a, e) => a + (Number(e.pot) || 0), 0),
    0,
  );
  expect(live.savingsPot).toBeCloseTo(sumPots, 10);
}

describe("wa buyin stamp — central pot stamping (finding 6)", () => {
  it("ישיבה ישירה: pot על האירוע, 95 ג'יטונים על ₪50 ב־cps=2", () => {
    const live = seatDirect(null, "קובי", 50, "s1");
    const p = live.players[0];
    expect(p.buyin).toBe(50);
    expect(p.buyinEvents).toHaveLength(1);
    expect(p.buyinEvents[0]).toMatchObject({ amount: 50, total: 50, pot: 2.5 });
    expect(live.savingsPot).toBe(2.5);
    expect(playerChips(p, 2)).toBe(95); // כמו באפליקציה: (50 − 2.5) × 2
    expectPotInvariant(live);
  });

  it("אישור שחקן חדש: אותה חותמת בדיוק", () => {
    const pending = applyCommands(
      null,
      [{ kind: "add", name: "יוסי", amount: 100 }],
      "s2a",
      2,
      { knownNames: known, now: T0 },
    ).live;
    expect(pending.players).toHaveLength(0);
    const live = applyCommands(
      pending,
      [{ kind: "approve", name: "יוסי" }],
      "s2b",
      2,
      { knownNames: known, now: T0 },
    ).live;
    const p = live.players[0];
    expect(p.buyin).toBe(100);
    expect(p.buyinEvents).toHaveLength(1);
    expect(p.buyinEvents[0]).toMatchObject({ amount: 100, total: 100, pot: 5 });
    expect(live.savingsPot).toBe(5);
    expect(playerChips(p, 2)).toBe(190);
    expectPotInvariant(live);
  });

  it("אישור לשחקן קיים: אירוע אחד לקנייה — בלי הכפילות שהייתה", () => {
    const liveIn = {
      savings5: true,
      savingsPot: 2.5,
      players: [
        {
          name: "יוסי",
          buyin: 50,
          cashout: "",
          buyinEvents: [{ amount: 50, at: 1, total: 50, pot: 2.5 }],
        },
      ],
      pendingApprovals: [{ name: "יוסי", amount: 50, at: 2 }],
    };
    const live = applyCommands(liveIn, [{ kind: "approve", name: "יוסי" }], "s3", 2, {
      knownNames: known,
      now: 5000,
    }).live;
    const p = live.players[0];
    expect(p.buyin).toBe(100);
    // לפני התיקון נוצרו 3 אירועים על 2 קניות (אחד כפול בלי pot)
    expect(p.buyinEvents).toHaveLength(2);
    expect(p.buyinEvents[1]).toMatchObject({ amount: 50, total: 100, pot: 2.5 });
    expect(live.savingsPot).toBe(5);
    expect(playerChips(p, 2)).toBe(190);
    // ספירת כניסות משקפת קניות אמיתיות: 2 כניסות, ריבאי 1
    const rb = computeLiveRebuys(live.players);
    expect(rb.rows[0]).toMatchObject({ entries: 2, rebuys: 1 });
    expect(rb.totalEntries).toBe(2);
    expectPotInvariant(live);
  });

  it("ריביי שני ושלישי: כל קנייה חותמת pot ומצטברת", () => {
    let live = seatDirect(null, "קובי", 50, "s4a");
    live = seatDirect(live, "קובי", 50, "s4b");
    live = seatDirect(live, "קובי", 50, "s4c");
    const p = live.players[0];
    expect(p.buyin).toBe(150);
    expect(p.buyinEvents).toHaveLength(3);
    expect(p.buyinEvents.map((e) => e.total)).toEqual([50, 100, 150]);
    expect(p.buyinEvents.map((e) => e.pot)).toEqual([2.5, 2.5, 2.5]);
    expect(live.savingsPot).toBe(7.5);
    expect(playerChips(p, 2)).toBe(285); // (150 − 7.5) × 2
    const rb = computeLiveRebuys(live.players);
    expect(rb.rows[0]).toMatchObject({ entries: 3, rebuys: 2 });
    expectPotInvariant(live);
  });

  it("ערבוב נתיבים על אותו שחקן: ישיבה + ריביי + אישור־קיים עקביים", () => {
    let live = seatDirect(null, "קובי", 50, "s5a");
    live = seatDirect(live, "קובי", 50, "s5b");
    live = {
      ...live,
      pendingApprovals: [{ name: "קובי סעדה", amount: 50, at: 3 }],
    };
    live = applyCommands(live, [{ kind: "approve", name: "קובי" }], "s5c", 2, {
      knownNames: known,
      now: T0,
    }).live;
    const p = live.players[0];
    expect(p.buyin).toBe(150);
    expect(p.buyinEvents).toHaveLength(3);
    expect(p.buyinEvents.every((e) => e.pot === 2.5)).toBe(true);
    expect(live.savingsPot).toBe(7.5);
    expect(playerChips(p, 2)).toBe(285);
    expectPotInvariant(live);
  });

  it("cps שונה מ־2: ה־pot בשקלים ולא תלוי cps — הג'יטונים כן", () => {
    const live = seatDirect(null, "קובי", 50, "s6", 4);
    const p = live.players[0];
    expect(p.buyinEvents[0].pot).toBe(2.5);
    expect(live.savingsPot).toBe(2.5);
    expect(playerChips(p, 4)).toBe(190); // (50 − 2.5) × 4
    expect(playerChips(p, 2)).toBe(95);
  });

  it("savings5 כבוי: אין pot, אין צבירה, ג'יטונים מלאים", () => {
    const live = applyCommands(
      { savings5: false },
      [{ kind: "add", name: "קובי", amount: 50 }],
      "s7",
      2,
      { knownNames: known, now: T0 },
    ).live;
    const p = live.players[0];
    expect(p.buyin).toBe(50);
    expect(p.buyinEvents).toHaveLength(1);
    expect(p.buyinEvents[0].pot).toBeUndefined();
    expect(live.savingsPot).toBe(0);
    expect(playerChips(p, 2)).toBe(100);
  });

  it("הפחתה: מורידה חוב בלבד — בלי אירוע חדש ובלי שינוי בקופה", () => {
    let live = seatDirect(null, "קובי", 100, "s8a");
    expect(live.savingsPot).toBe(5);
    live = seatDirect(live, "קובי", -30, "s8b");
    const p = live.players[0];
    expect(p.buyin).toBe(70);
    expect(p.buyinEvents).toHaveLength(1);
    expect(live.savingsPot).toBe(5);
    expect(playerChips(p, 2)).toBe(130); // (70 − 5) × 2
    expectPotInvariant(live);
  });
});
