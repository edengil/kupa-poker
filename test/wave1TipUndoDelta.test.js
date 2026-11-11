import { describe, it, expect } from "vitest";
import { applyCommands } from "../lib/whatsapp.js";
import { undo, blank } from "../lib/wa/state.ts";

/* ============================================================================
   רגרסיית שער 0.3 (A7) — עודכנה לסמנטיקת «טיפ הוא רישום בלבד» (עדן, 11.11):
   טיפ לא משנה את ה־cashout בשום מצב, וה־undo שלו הופך רק את ה־tipsGiven
   ואת רשומת היומן. החריג היחיד: רשומות מורשת מהמשטר הישן — עם cashDelta
   ה־undo מחזיר את הדלתא על הערך הנוכחי, ועם cashoutBefore הוא משחזר את
   הצילום — בדיוק כפי שהתנהגו לפני השינוי.
   ============================================================================ */

const known = ["עדן גיל", "קובי סעדה", "דוד בני גיל"];
const T0 = 1_700_000_000_000;
const apply = (live, cmds, msgId) =>
  applyCommands(live, cmds, msgId, 2, { knownNames: known, now: T0 });
const P = (live, name = "קובי סעדה") => live.players.find((p) => p.name === name);
const seated = () => {
  let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "seat").live;
  live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 500 }], "out").live;
  return live;
};

describe("undo טיפ — רישום בלבד (היציאה לא זזה לעולם)", () => {
  it("שני טיפים + undo של הראשון: רק ה־tipsGiven מתהפך", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 30 }], "tip2").live;
    expect(P(live).cashout).toBe("500");
    expect(P(live).tipsGiven).toBe(80);

    const state = blank(live);
    undo(state, state.applied["tip1"]);
    expect(P(state).cashout).toBe("500");
    expect(P(state).tipsGiven).toBe(30);
    expect(state.tips).toHaveLength(1);
    expect(state.tips[0].amount).toBe(30);
  });

  it("מסירה חוזרת זהה של הודעת הטיפ הראשון אחרי השני — אידמפוטנטית", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 30 }], "tip2").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    expect(P(live).cashout).toBe("500");
    expect(P(live).tipsGiven).toBe(80);
    expect(live.tips).toHaveLength(2);
  });

  it("טיפ ואז תיקון cashout ידני: ה־undo לא נוגע ביציאה המתוקנת", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 600 }], "fix").live;
    expect(P(live).cashout).toBe("600");
    expect(P(live).tipsGiven).toBe(50);

    const state = blank(live);
    undo(state, state.applied["tip1"]);
    expect(P(state).cashout).toBe("600");
    expect(P(state).tipsGiven).toBe(0);
  });

  it("טיפ יחיד + undo דרך עריכת ההודעה ל־0 (מקרה C5): שחזור מדויק", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    expect(P(live).cashout).toBe("500");
    expect(P(live).tipsGiven).toBe(50);
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 0 }], "tip1").live;
    expect(P(live).cashout).toBe("500");
    expect(P(live).tipsGiven).toBe(0);
    expect(live.tips).toHaveLength(0);
  });

  it("עריכת טיפ 50→80 (החלה־מחדש) ואז undo: היציאה 500, ה־tipsGiven מתאפס", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 80 }], "tip1").live;
    expect(P(live).cashout).toBe("500");
    expect(P(live).tipsGiven).toBe(80);
    const state = blank(live);
    undo(state, state.applied["tip1"]);
    expect(P(state).cashout).toBe("500");
    expect(P(state).tipsGiven).toBe(0);
    expect(state.tips).toHaveLength(0);
  });

  it("טיפ גדול מהערימה (40, טיפ 50): אין קלאמפ — היציאה נשארת 40", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "seat").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 40 }], "out").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    expect(P(live).cashout).toBe("40");
    expect(P(live).tipsGiven).toBe(50);
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 0 }], "tip1").live;
    expect(P(live).cashout).toBe("40");
    expect(P(live).tipsGiven).toBe(0);
  });
});

describe("undo טיפ — רשומות מורשת מהמשטר הישן", () => {
  it("רשומה עם cashDelta: ה־undo מחזיר את הדלתא על הערך הנוכחי", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    /* מדמה מצב שהמשטר הישן השאיר: היציאה כבר הופחתה ל־450 והרשומה
       נושאת את הדלתא. הביטול חייב להחזיר אותה — לא ליצור ג'יטונים. */
    live.players[0].cashout = "450";
    const rec = live.applied["tip1"].map((e) =>
      e.t === "tip" ? { ...e, cashDelta: 50 } : e
    );
    const state = blank(live);
    undo(state, rec);
    expect(P(state).cashout).toBe("500");
    expect(P(state).tipsGiven).toBe(0);
    expect(state.tips).toHaveLength(0);
  });

  it("רשומה ישנה עם cashoutBefore (לפני הדלתא) עדיין משוחזרת כצילום", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    /* מצב מורשת: היציאה כבר הופחתה, והרשומה שומרת צילום־מוחלט */
    live.players[0].cashout = "450";
    const rec = live.applied["tip1"].map((e) => {
      if (e.t !== "tip") return e;
      const { cashDelta, ...rest } = e;
      return { ...rest, cashoutBefore: "500" };
    });
    const state = blank(live);
    undo(state, rec);
    expect(P(state).cashout).toBe("500");
    expect(P(state).tipsGiven).toBe(0);
  });
});
