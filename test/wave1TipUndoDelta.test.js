import { describe, it, expect } from "vitest";
import { applyCommands } from "../lib/whatsapp.js";
import { undo, blank } from "../lib/wa/state.ts";

/* ============================================================================
   רגרסיית שער 0.3 (A7) אחרי תיקון גל 1א — undo של טיפ בבוט מחזיר דלתא על
   הערך הנוכחי, לא צילום־מוחלט. שלושת תרחישי ההפרה של השער חייבים כעת
   לשמור על הג'יטונים, ומקרי C5 התקינים (טיפ יחיד, עריכה, קלאמפ) נשארים
   מדויקים. "שימור" נמדד על cashout + tipsGiven של השחקן.
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

describe("undo טיפ בדלתא — תרחישי שער 0.3", () => {
  it("שני טיפים + undo של הראשון: אין יצירת ג'יטונים ואין ספירה כפולה", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 30 }], "tip2").live;
    expect(P(live).cashout).toBe("420");
    expect(P(live).tipsGiven).toBe(80);

    const state = blank(live);
    undo(state, state.applied["tip1"]);
    expect(P(state).cashout).toBe("470");
    expect(P(state).tipsGiven).toBe(30);
    expect((+P(state).cashout || 0) + (+P(state).tipsGiven || 0)).toBe(500);
    expect(state.tips).toHaveLength(1);
    expect(state.tips[0].amount).toBe(30);
  });

  it("מסירה חוזרת זהה של הודעת הטיפ הראשון אחרי השני — אידמפוטנטית", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 30 }], "tip2").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    expect(P(live).cashout).toBe("420");
    expect(P(live).tipsGiven).toBe(80);
    expect(live.tips).toHaveLength(2);
  });

  it("טיפ ואז תיקון cashout ידני: ה־undo שומר על סכום הג'יטונים הכולל", () => {
    /* לפני התיקון ה־undo החזיר צילום 500 ומחק במבטא 150 מהסכום (600+50).
       בדלתא: הטיפ חוזר לערימה — 650, והסכום cashout+tipsGiven נשמר. */
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 600 }], "fix").live;
    expect(P(live).cashout).toBe("600");
    expect((+P(live).cashout || 0) + (+P(live).tipsGiven || 0)).toBe(650);

    const state = blank(live);
    undo(state, state.applied["tip1"]);
    expect(P(state).cashout).toBe("650");
    expect(P(state).tipsGiven).toBe(0);
  });

  it("טיפ יחיד + undo דרך עריכת ההודעה ל־0 (מקרה C5): שחזור מדויק", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    expect(P(live).cashout).toBe("450");
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 0 }], "tip1").live;
    expect(P(live).cashout).toBe("500");
    expect(P(live).tipsGiven).toBe(0);
    expect(live.tips).toHaveLength(0);
  });

  it("עריכת טיפ 50→80 (החלה־מחדש) ואז undo: חוזר ל־500 בדיוק", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 80 }], "tip1").live;
    expect(P(live).cashout).toBe("420");
    expect(P(live).tipsGiven).toBe(80);
    const state = blank(live);
    undo(state, state.applied["tip1"]);
    expect(P(state).cashout).toBe("500");
    expect(P(state).tipsGiven).toBe(0);
    expect(state.tips).toHaveLength(0);
  });

  it("קלאמפ: טיפ גדול מהערימה (40, טיפ 50) — ה־undo מחזיר 40, לא 50", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "seat").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 40 }], "out").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    expect(P(live).cashout).toBe("0");
    expect(P(live).tipsGiven).toBe(50);
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 0 }], "tip1").live;
    expect(P(live).cashout).toBe("40");
    expect(P(live).tipsGiven).toBe(0);
  });

  it("רשומת undo ישנה עם cashoutBefore (לפני הדלתא) עדיין משוחזרת כצילום", () => {
    let live = seated();
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    /* מדמה רשומה שנשמרה בגרסה הקודמת: צילום במקום דלתא */
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
