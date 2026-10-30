import { describe, it, expect } from "vitest";
import { applyCommands } from "../lib/whatsapp.js";
import { playerChips } from "../lib/liveView";
import { computeLiveRebuys } from "../lib/poker/liveRebuys.js";

/* מסירה חוזרת של אותה הודעת וואטסאפ (Whapi מנסה שוב / הודעה נערכת)
   מריצה undo+reapply על הרשומה של ההודעה. הביטול חייב להיות היפוך מדויק
   של חותמת הקנייה (stampBuyin): חוב, אירוע חתום ו־pot ב־savingsPot —
   אחרת כל ניסיון־חוזר מנפח את הקופה, יוצר אירועי רפאים ומכפיל קניות.
   הבדיקות כאן נכשלות על הקוד שלפני תיקון ה־undo (גל 2ב, המשך ממצא 4). */

const known = ["עדן גיל", "קובי סעדה", "דוד בני גיל"];
const T0 = 1_700_000_000_000;

function apply(live, cmds, msgId, cps = 2) {
  return applyCommands(live, cmds, msgId, cps, { knownNames: known, now: T0 }).live;
}

function expectPotInvariant(live) {
  const sumPots = live.players.reduce(
    (s, p) => s + (p.buyinEvents || []).reduce((a, e) => a + (Number(e.pot) || 0), 0),
    0,
  );
  expect(live.savingsPot).toBeCloseTo(sumPots, 10);
}

function expectPlayer(live, idx, { buyin, events, chips }) {
  const p = live.players[idx];
  expect(p.buyin).toBe(buyin);
  expect(p.buyinEvents).toHaveLength(events);
  expect(playerChips(p, 2)).toBe(chips);
  return p;
}

describe("wa buyin redelivery — undo is an exact reversal of the stamp", () => {
  it("ישיבה חוזרת: אותה הודעה פעמיים ושלוש — הקופה לא מתנפחת", () => {
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "r1");
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "r1");
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "r1");
    expect(live.players).toHaveLength(1);
    const p = expectPlayer(live, 0, { buyin: 50, events: 1, chips: 95 });
    expect(p.buyinEvents[0]).toMatchObject({ amount: 50, total: 50, pot: 2.5 });
    expect(live.savingsPot).toBe(2.5); // לפני התיקון: 5
    expectPotInvariant(live);
  });

  it("ריביי חוזר: אין אירוע רפאים, אין pot כפול, כניסות אמיתיות", () => {
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "r2a");
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "r2b");
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "r2b");
    const p = expectPlayer(live, 0, { buyin: 100, events: 2, chips: 190 });
    expect(p.buyinEvents.map((e) => e.total)).toEqual([50, 100]);
    // לפני התיקון: 3 אירועים, savingsPot ‏7.5, ג'יטונים 185
    expect(live.savingsPot).toBe(5);
    const rb = computeLiveRebuys(live.players);
    expect(rb.rows[0]).toMatchObject({ entries: 2, rebuys: 1 });
    expect(rb.totalEntries).toBe(2);
    expectPotInvariant(live);
  });

  it("אישור שחקן חדש חוזר: שחקן אחד, קנייה אחת, pot אחד", () => {
    let live = apply(null, [{ kind: "add", name: "יוסי", amount: 100 }], "r3a");
    expect(live.players).toHaveLength(0);
    live = apply(live, [{ kind: "approve", name: "יוסי" }], "r3b");
    live = apply(live, [{ kind: "approve", name: "יוסי" }], "r3b");
    expect(live.players).toHaveLength(1);
    const p = expectPlayer(live, 0, { buyin: 100, events: 1, chips: 190 });
    expect(p.buyinEvents[0]).toMatchObject({ amount: 100, total: 100, pot: 5 });
    expect(live.savingsPot).toBe(5); // לפני התיקון: 10
    expect(live.pendingApprovals).toHaveLength(0);
    expect(live.approvedNames.filter((n) => n === p.name)).toHaveLength(1);
    expectPotInvariant(live);
  });

  it("אישור לשחקן קיים חוזר: הקנייה לא נכפלת", () => {
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
    let live = apply(liveIn, [{ kind: "approve", name: "יוסי" }], "r4");
    live = apply(live, [{ kind: "approve", name: "יוסי" }], "r4");
    const p = expectPlayer(live, 0, { buyin: 100, events: 2, chips: 190 });
    expect(p.buyinEvents.map((e) => e.total)).toEqual([50, 100]);
    // לפני התיקון: buyin ‏150, ‏3 אירועים, ג'יטונים 285, savingsPot ‏7.5
    expect(live.savingsPot).toBe(5);
    const rb = computeLiveRebuys(live.players);
    expect(rb.totalEntries).toBe(2);
    expect(live.pendingApprovals).toHaveLength(0);
    expectPotInvariant(live);
  });

  it("עריכת הודעה 50→100: אירוע אחד עם הסכום החדש וה־pot שלו בלבד", () => {
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "r5");
    live = apply(live, [{ kind: "add", name: "קובי", amount: 100 }], "r5");
    const p = expectPlayer(live, 0, { buyin: 100, events: 1, chips: 190 });
    expect(p.buyinEvents[0]).toMatchObject({ amount: 100, total: 100, pot: 5 });
    expect(live.savingsPot).toBe(5); // לפני התיקון: 7.5
    expectPotInvariant(live);
  });

  it("רשומת ביטול ישנה בלי צילום אירוע: נפילה לאחור לפי סכום עדיין הופכת נכון", () => {
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "r6a");
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "r6b");
    // מדמה רשומה שנכתבה לפני שה־undo שמר צילום אירוע
    for (const e of live.applied["r6b"]) delete e.ev;
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "r6b");
    const p = expectPlayer(live, 0, { buyin: 100, events: 2, chips: 190 });
    expect(p.buyinEvents.map((e) => e.total)).toEqual([50, 100]);
    expect(live.savingsPot).toBe(5);
    expectPotInvariant(live);
  });

  it("savings5 כבוי: מסירה חוזרת לא ממציאה pot", () => {
    let live = apply({ savings5: false }, [{ kind: "add", name: "קובי", amount: 50 }], "r7");
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "r7");
    const p = expectPlayer(live, 0, { buyin: 50, events: 1, chips: 100 });
    expect(p.buyinEvents[0].pot).toBeUndefined();
    expect(live.savingsPot).toBe(0);
    expectPotInvariant(live);
  });
});

describe("wa buyin creation undo — stamp-level across messages and renames", () => {
  it("מסירה חוזרת של הודעת היצירה אחרי ריביי מהודעה אחרת לא מוחקת את הריביי", () => {
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "c1");
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "c2");
    expectPlayer(live, 0, { buyin: 100, events: 2, chips: 190 });
    expect(live.savingsPot).toBe(5);

    // מסירה חוזרת של היצירה: רק האירוע שלה מתהפך, הריביי נשאר —
    // ואז ההחלה מחדש מחזירה בדיוק את אותה תמונה.
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "c1");
    expect(live.players).toHaveLength(1);
    let p = expectPlayer(live, 0, { buyin: 100, events: 2, chips: 190 });
    expect(p.buyinEvents.map((e) => e.amount)).toEqual([50, 50]);
    expect(live.savingsPot).toBe(5);
    expectPotInvariant(live);

    // ומסירה חוזרת של הריביי אחר כך לא מרפאה ולא שוברת — אותה תמונה בדיוק.
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "c2");
    expect(live.players).toHaveLength(1);
    p = expectPlayer(live, 0, { buyin: 100, events: 2, chips: 190 });
    expect(p.buyinEvents.map((e) => e.amount)).toEqual([50, 50]);
    expect(live.savingsPot).toBe(5);
    expect(computeLiveRebuys(live.players).totalEntries).toBe(2);
    expectPotInvariant(live);
  });

  it("עריכת הודעת היצירה אחרי ריביי משנה רק את חלק היצירה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "e1");
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "e2");

    // אותה הודעת יצירה, סכום ערוך 50→100: הריביי של ההודעה השנייה נשאר.
    live = apply(live, [{ kind: "add", name: "קובי", amount: 100 }], "e1");
    expect(live.players).toHaveLength(1);
    const p = expectPlayer(live, 0, { buyin: 150, events: 2, chips: 285 });
    expect(p.buyinEvents.map((e) => e.amount)).toEqual([50, 100]);
    expect(live.savingsPot).toBe(7.5);
    expectPotInvariant(live);
  });

  it("מסירה חוזרת של אישור־יצירה אחרי ריביי לא מוחקת את הריביי", () => {
    let live = apply(null, [{ kind: "add", name: "יוסי", amount: 100 }], "a1");
    live = apply(live, [{ kind: "approve", name: "יוסי" }], "a2");
    live = apply(live, [{ kind: "add", name: "יוסי", amount: 50 }], "a3");
    expectPlayer(live, 0, { buyin: 150, events: 2, chips: 285 });
    expect(live.savingsPot).toBe(7.5);

    // מסירה חוזרת של האישור שיצר את השחקן: רק חותמת האישור מתהפכת.
    live = apply(live, [{ kind: "approve", name: "יוסי" }], "a2");
    expect(live.players).toHaveLength(1);
    const p = expectPlayer(live, 0, { buyin: 150, events: 2, chips: 285 });
    expect(p.buyinEvents.map((e) => e.amount)).toEqual([50, 100]);
    expect(live.savingsPot).toBe(7.5);
    expect(live.pendingApprovals).toHaveLength(0);
    expect(live.approvedNames.filter((n) => n === p.name)).toHaveLength(1);
    expectPotInvariant(live);
  });

  it("שינוי שם בין החלה למסירה חוזרת לא מכפיל את הקנייה", () => {
    const knownPlus = [...known, "דני"];
    const applyD = (live, cmds, msgId) =>
      applyCommands(live, cmds, msgId, 2, { knownNames: knownPlus, now: T0 }).live;

    let live = applyD(null, [{ kind: "add", name: "דני", amount: 50 }], "n1");
    expect(live.players).toHaveLength(1);
    expect(live.players[0].buyin).toBe(50);

    live = applyD(live, [{ kind: "rename", from: "דני", to: "דני לוי" }], "n2");
    expect(live.players[0].name).toBe("דני לוי");

    // הרשומה של n1 עדיין מפותחת בשם הישן — הביטול חייב למצוא את השחקן
    // לפי צילום האירוע, אחרת ההחלה מחדש חותמת עליו שוב.
    live = applyD(live, [{ kind: "add", name: "דני", amount: 50 }], "n1");
    expect(live.players).toHaveLength(1);
    const p = expectPlayer(live, 0, { buyin: 50, events: 1, chips: 95 });
    expect(p.buyinEvents[0]).toMatchObject({ amount: 50, pot: 2.5 });
    expect(live.savingsPot).toBe(2.5);
    expectPotInvariant(live);
  });
});
