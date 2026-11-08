import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  applyBuyinEdit,
  applyBuyinEditWithChanges,
} from "../lib/liveBuyinEdit.js";
import { undoLast, labelAction } from "../lib/liveActionLog.js";

/* ============================================================================
   גל 4 · פריטים 4.3+4.4 — מינוס בלייב דרך מנגנון עריכת הקנייה, וביטול
   לפי זהות (לא לפי מיקום):
   • 4.3: bump שלילי היה מקטין buyin בלי לגעת באירועים — Σevents ≠ buyin,
     לוח הריבאיים ובדיקת האיזון שיקרו. עכשיו המינוס מתכווץ דרך
     applyBuyinEditWithChanges והאירועים מתכווצים איתו.
   • 4.4: undo של buyin הסיר את האירוע האחרון אם הסכום התאים — אירוע
     בוט שנוסף אחרי פעולת אפליקציה באותו סכום נמחק במקומה; undo של
     fill חתך את המילוי האחרון ברשימה — מילוי ממכשיר שני נמחק בטעות;
     ו־waFail נבלע בביטול בלי שום סימן.
   ============================================================================ */

const ev = (amount, at, pot) => ({
  amount,
  at,
  total: 0,
  ...(pot != null ? { pot } : {}),
});
const withTotals = (events) => {
  let run = 0;
  return events.map((e) => ({ ...e, total: (run += e.amount) }));
};
const sum = (events) => events.reduce((s, e) => s + e.amount, 0);

describe("4.3 — מינוס דרך applyBuyinEditWithChanges: האירועים מתכווצים עם ה־buyin", () => {
  it("מינוס חלקי: האירוע האחרון מתכווץ, Σevents = buyin, השינוי נרשם בזהות", () => {
    const p = { name: "דן", buyin: 200, cashout: "", buyinEvents: withTotals([ev(100, 1, 5), ev(100, 2, 5)]) };
    const { player, changes } = applyBuyinEditWithChanges(p, 150, { savings5: true });
    expect(player.buyin).toBe(150);
    expect(sum(player.buyinEvents)).toBe(150);
    expect(player.buyinEvents.map((e) => e.amount)).toEqual([100, 50]);
    expect(player.buyinEvents[1].pot).toBe(2.5);
    expect(changes).toEqual([
      { at: 2, index: 1, before: 100, after: 50, event: expect.objectContaining({ at: 2, amount: 100 }) },
    ]);
  });

  it("מינוס עמוק: אירוע שהתאפס נמחק (חוץ מהראשון) ונרשם עם after: null", () => {
    const p = { name: "דן", buyin: 200, cashout: "", buyinEvents: withTotals([ev(100, 1), ev(100, 2)]) };
    const { player, changes } = applyBuyinEditWithChanges(p, 50, {});
    expect(player.buyin).toBe(50);
    expect(player.buyinEvents.map((e) => e.amount)).toEqual([50]);
    expect(changes).toEqual([
      { at: 1, index: 0, before: 100, after: 50, event: expect.objectContaining({ at: 1 }) },
      { at: 2, index: 1, before: 100, after: null, event: expect.objectContaining({ at: 2 }) },
    ]);
  });

  it("מינוס עד אפס: האירוע הראשון נשאר על 0, Σ = 0", () => {
    const p = { name: "דן", buyin: 100, cashout: "", buyinEvents: withTotals([ev(100, 1)]) };
    const { player } = applyBuyinEditWithChanges(p, 0, {});
    expect(player.buyin).toBe(0);
    expect(player.buyinEvents).toHaveLength(1);
    expect(sum(player.buyinEvents)).toBe(0);
  });

  it("שחקן בלי אירועים (רשומה ישנה): רק ה־buyin משתנה, בלי שינויים", () => {
    const p = { name: "דן", buyin: 100, cashout: "" };
    const { player, changes } = applyBuyinEditWithChanges(p, 40, {});
    expect(player.buyin).toBe(40);
    expect(changes).toEqual([]);
  });

  it("applyBuyinEdit הקיים מתנהג זהה דרך אותה ליבה", () => {
    const p = { name: "דן", buyin: 200, cashout: "", buyinEvents: withTotals([ev(100, 1), ev(100, 2)]) };
    expect(applyBuyinEdit(p, 150, {})).toEqual(applyBuyinEditWithChanges(p, 150, {}).player);
  });
});

describe("4.4 — undo של buyin לפי זהות האירוע", () => {
  it("אירוע בוט באותו סכום שנוסף אחרי פעולת האפליקציה לא הופך לרפאים", () => {
    // האפליקציה הוסיפה 100 (אירוע at=10); הבוט הוסיף אחר כך עוד 100 (at=20)
    const players = [
      { name: "דן", buyin: 300, cashout: "", buyinEvents: withTotals([ev(100, 1), ev(100, 10), ev(100, 20)]) },
    ];
    const log = [{ t: "buyin", name: "דן", amount: 100, eventAt: 10, id: "a1" }];
    const out = undoLast({ players, actionLog: log });
    expect(out.players[0].buyin).toBe(200);
    // האירוע של הבוט (at=20) שרד; האירוע של הפעולה (at=10) הוסר
    expect(out.players[0].buyinEvents.map((e) => e.at)).toEqual([1, 20]);
    expect(sum(out.players[0].buyinEvents)).toBe(200);
  });

  it("ביטול מינוס משחזר את האירועים לפי זהות — כולל אירוע שנמחק", () => {
    const before = { name: "דן", buyin: 200, cashout: "", buyinEvents: withTotals([ev(100, 1), ev(100, 2)]) };
    const { player: afterMinus, changes } = applyBuyinEditWithChanges(before, 50, {});
    const log = [{ t: "buyin", name: "דן", amount: -150, eventChanges: changes, id: "a1" }];
    const out = undoLast({ players: [afterMinus], actionLog: log });
    expect(out.players[0].buyin).toBe(200);
    expect(out.players[0].buyinEvents.map((e) => [e.at, e.amount])).toEqual([[1, 100], [2, 100]]);
    expect(sum(out.players[0].buyinEvents)).toBe(200);
  });

  it("ביטול מינוס עם אירוע בוט שהתערב בינתיים: מסתיים מסונכרן Σevents = buyin", () => {
    const before = { name: "דן", buyin: 200, cashout: "", buyinEvents: withTotals([ev(100, 1), ev(100, 2)]) };
    const { player: afterMinus, changes } = applyBuyinEditWithChanges(before, 150, {});
    // הבוט הוסיף אירוע 100 (at=99) אחרי המינוס של האפליקציה
    const interfered = {
      ...afterMinus,
      buyin: 250,
      buyinEvents: withTotals([...afterMinus.buyinEvents, ev(100, 99)]),
    };
    const log = [{ t: "buyin", name: "דן", amount: -50, eventChanges: changes, id: "a1" }];
    const out = undoLast({ players: [interfered], actionLog: log });
    expect(out.players[0].buyin).toBe(300);
    expect(sum(out.players[0].buyinEvents)).toBe(300);
    // אירוע הבוט שרד
    expect(out.players[0].buyinEvents.some((e) => e.at === 99)).toBe(true);
  });

  it("רשומת מורשת בלי חותמת: ההתנהגות הישנה נשמרת (אחרון תואם־סכום יורד)", () => {
    const players = [
      { name: "דן", buyin: 150, cashout: "", buyinEvents: withTotals([ev(50, 1), ev(100, 2)]) },
    ];
    const log = [{ t: "buyin", name: "דן", amount: 100, id: "a1" }];
    const out = undoLast({ players, actionLog: log });
    expect(out.players[0].buyin).toBe(50);
    expect(out.players[0].buyinEvents.map((e) => e.amount)).toEqual([50]);
  });
});

describe("4.4 — undo של fill לפי זהות המילוי", () => {
  it("מילוי ממכשיר שני שנרשם אחר כך לא נמחק — רק המילוי של הפעולה", () => {
    const players = [
      { name: "עדן גיל", buyin: 100, cashout: "", stackAdj: -60 },
      { name: "אורן גיל", buyin: 100, cashout: "", stackAdj: 60 },
    ];
    const fills = [
      { from: "עדן גיל", to: "אורן גיל", chips: 30, at: 111 },
      { from: "עדן גיל", to: "אורן גיל", chips: 30, at: 222 }, // מכשיר שני
    ];
    const log = [{ t: "fill", from: "עדן גיל", to: "אורן גיל", chips: 30, fillAt: 111, id: "a1" }];
    const out = undoLast({ players, coupleFills: fills, actionLog: log });
    expect(out.coupleFills).toEqual([{ from: "עדן גיל", to: "אורן גיל", chips: 30, at: 222 }]);
    // התאמת הערימות התהפכה פעם אחת בלבד
    expect(out.players[0].stackAdj).toBe(-30);
    expect(out.players[1].stackAdj).toBe(30);
  });

  it("מילוי שכבר איננו ברשימה: שום מילוי זר לא נמחק", () => {
    const players = [
      { name: "עדן גיל", buyin: 100, cashout: "", stackAdj: -30 },
      { name: "אורן גיל", buyin: 100, cashout: "", stackAdj: 30 },
    ];
    const fills = [{ from: "אורן גיל", to: "עדן גיל", chips: 30, at: 999 }];
    const log = [{ t: "fill", from: "עדן גיל", to: "אורן גיל", chips: 30, fillAt: 111, id: "a1" }];
    const out = undoLast({ players, coupleFills: fills, actionLog: log });
    expect(out.coupleFills).toHaveLength(1);
  });
});

describe("4.4 — waFail בביטול: case מפורש, לא נבלע", () => {
  it("undo על רשומת waFail מחזיר notice ולא משנה מצב", () => {
    const players = [{ name: "דן", buyin: 100, cashout: "" }];
    const log = [{ t: "waFail", where: "reply", id: "a1" }];
    const out = undoLast({ players, actionLog: log });
    expect(out.players).toEqual(players);
    expect(out.actionLog).toHaveLength(0);
    expect(out.notice).toContain("לא נשלחה");
    expect(labelAction({ t: "waFail", where: "reply" })).toContain("לא נשלחה");
  });

  it("undo רגיל לא מחזיר notice", () => {
    const players = [{ name: "דן", buyin: 100, cashout: "300" }];
    const log = [{ t: "cashout", name: "דן", chips: "300", before: "", id: "a1" }];
    const out = undoLast({ players, actionLog: log });
    expect(out.notice).toBeNull();
  });
});

describe("4.3 — ביטול־משחק מחווט לאיפוס האחד", () => {
  it("onCancelGame ב־LiveTab קורא ל־resetLiveState ולא לרשימת איפוס ידנית", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/poker/LiveTab.jsx"),
      "utf8"
    );
    const start = src.indexOf("onCancelGame");
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, start + 700);
    expect(block).toContain("resetLiveState()");
    // הרשימה הידנית החלקית שהחסירה startedAt/entriesCount/savings5 איננה
    expect(block).not.toContain("setPlayers([])");
    expect(block).not.toContain("setActionLog([])");
  });
});
