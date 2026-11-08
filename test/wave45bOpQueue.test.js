import { describe, it, expect } from "vitest";
import { applyCommands } from "../lib/whatsapp.js";

/* ============================================================================
   גל 4ב · המשך פריט 4.5 — טיפ ויציאה חריגים מעל תקרת הבוט מנותבים לתור
   האישור (החלטת עדן 2026-11-08), במקום החסימה־עם־הודעה של גל 4.
   מחזור חיים מלא: ממתין נוצר ולא מוחל · אישור מחיל פעם אחת בדיוק (טיפ
   כולל שקית מחמאות + דלתא מזומן) · דחייה לא מחילה · מסירה חוזרת לא
   מכפילה · עריכה־למטה מבטלת את הממתין ומחילה רגיל · ביטול אחרי אישור
   (עריכת ההודעה הממתינה/המאשרת) הופך את ההחלה ולא משאיר רפאים.
   ============================================================================ */

const known = ["עדן גיל", "קובי סעדה", "אורן גיל", "דוד בני גיל"];
const T0 = 1_700_000_000_000;
const apply = (live, cmds, msgId, extra = {}) =>
  applyCommands(live, cmds, msgId, 2, { knownNames: known, now: T0, ...extra });
const P = (live, name = "קובי סעדה") => live.players.find((p) => p.name === name);
const ops = (live, op) => (live.pendingApprovals || []).filter((p) => p.op === op);

/* תקרה 1,000 (אין היסטוריה מעל 100) → טיפ חריג = מעל 2,000 ג'יטונים
   (CPS=2); יציאה חריגה = מעל (1,000 + קניות) שקלים. */

describe("טיפ חריג — ממתין, לא מוחל לפני אישור", () => {
  it("ממתין־טיפ נוצר עם צילום; שום טיפ לא הוחל; DM לבעלים עם פרטי הטיפ", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "t1a").live;
    const out = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 99999 }], "t1b");
    live = out.live;
    expect(P(live).tipsGiven || 0).toBe(0);
    expect(live.tips || []).toHaveLength(0);
    expect(ops(live, "tip")).toEqual([
      expect.objectContaining({ name: "קובי סעדה", amount: 99999, op: "tip" }),
    ]);
    expect(out.reply).toContain("ממתין לאישור עדן");
    expect(out.ownerDm).toBeTruthy();
    expect(out.ownerDm).toContain("קובי סעדה");
    expect(out.ownerDm).toContain("99999");
    expect(out.ownerDm).toContain("ג'יטונים");
  });

  it("אישור מחיל את הטיפ פעם אחת בדיוק — tipsGiven + רשומת טיפ אחת + מחמאה; מסירה חוזרת של האישור לא מכפילה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "t2a").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 3000 }], "t2b").live;
    const ok = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "t2c");
    live = ok.live;
    expect(P(live).tipsGiven).toBe(3000);
    expect((live.tips || []).filter((t) => t.name === "קובי סעדה")).toHaveLength(1);
    expect(live.pendingApprovals).toHaveLength(0);
    expect(ok.reply).toContain("אושר");
    // מסירה חוזרת של הודעת האישור — אין הכפלה
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "t2c").live;
    expect(P(live).tipsGiven).toBe(3000);
    expect((live.tips || []).filter((t) => t.name === "קובי סעדה")).toHaveLength(1);
  });

  it("טיפ מאושר על שחקן שכבר סגור מוריד מהיציאה (דלתא מזומן 4.2)", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "t3a").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 500 }], "t3b").live;
    expect(P(live).cashout).toBe("500");
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 3000 }], "t3c").live;
    expect(P(live).cashout).toBe("500"); // עדיין לא הוחל
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "t3d").live;
    expect(P(live).tipsGiven).toBe(3000);
    expect(P(live).cashout).toBe("0"); // 500 − 3000, קלאמפ ב־0
  });

  it("דחייה: שום שינוי — לא טיפ, לא רשומה, הממתין נצרך", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "t4a").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 3000 }], "t4b").live;
    const out = apply(live, [{ kind: "reject", name: "קובי סעדה" }], "t4c");
    live = out.live;
    expect(P(live).tipsGiven || 0).toBe(0);
    expect(live.tips || []).toHaveLength(0);
    expect(live.pendingApprovals).toHaveLength(0);
    expect(out.reply).toContain("נדחה");
  });

  it("מסירה חוזרת של פקודת הטיפ החריגה לא מכפילה ממתין", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "t5a").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 3000 }], "t5b").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 3000 }], "t5b").live;
    expect(ops(live, "tip")).toHaveLength(1);
    expect(ops(live, "tip")[0].amount).toBe(3000);
  });

  it("עריכה־למטה של הטיפ מתחת לתקרה מבטלת את הממתין ומחילה רגיל", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "t6a").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 3000 }], "t6b").live;
    expect(ops(live, "tip")).toHaveLength(1);
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "t6b").live;
    expect(live.pendingApprovals).toHaveLength(0);
    expect(P(live).tipsGiven).toBe(50);
  });

  it("ביטול הודעת־האישור הופך את ההחלה ומשיב את הממתין; עריכת הודעת־הממתין אז מבטלת אותו", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "t7a").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 3000 }], "t7b").live;
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "t7c").live;
    expect(P(live).tipsGiven).toBe(3000);
    // מסירה חוזרת של הודעת האישור עצמה: ההחלה מתהפכת והממתין חוזר לתור
    // (אותה סמנטיקה של ביטול־אישור בקניות)
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "t7c").live;
    expect(P(live).tipsGiven).toBe(3000); // ההחלה־מחדש מחילה שוב — נטו זהה
    expect(ops(live, "tip")).toHaveLength(0);
    // עריכת הודעת־האישור לפקודת דחייה: הביטול הופך את ההחלה, הדחייה צורכת את הממתין שהוחזר
    live = apply(live, [{ kind: "reject", name: "קובי סעדה" }], "t7c").live;
    expect(P(live).tipsGiven || 0).toBe(0);
    expect((live.tips || []).filter((t) => t.name === "קובי סעדה")).toHaveLength(0);
    expect(live.pendingApprovals).toHaveLength(0);
  });
});

describe("יציאה חריגה — ממתין, לא מוחל לפני אישור", () => {
  it("ממתין־יציאה נוצר; השחקן נשאר פתוח; DM לבעלים עם פרטי היציאה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "c1a").live;
    const out = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 999999 }], "c1b");
    live = out.live;
    expect(P(live).cashout).toBe("");
    expect(ops(live, "cashout")).toEqual([
      expect.objectContaining({ name: "קובי סעדה", amount: 999999, op: "cashout" }),
    ]);
    expect(out.reply).toContain("ממתין לאישור עדן");
    expect(out.ownerDm).toBeTruthy();
    expect(out.ownerDm).toContain("יציאה");
  });

  it("אישור מחיל את היציאה פעם אחת; מסירה חוזרת לא משנה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "c2a").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 5000 }], "c2b").live;
    const ok = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "c2c");
    live = ok.live;
    expect(P(live).cashout).toBe("5000");
    expect(live.pendingApprovals).toHaveLength(0);
    expect(ok.reply).toContain("אושר");
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "c2c").live;
    expect(P(live).cashout).toBe("5000");
  });

  it("דחייה: השחקן נשאר בשולחן בלי שינוי", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "c3a").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 5000 }], "c3b").live;
    const out = apply(live, [{ kind: "reject", name: "קובי סעדה" }], "c3c");
    live = out.live;
    expect(P(live).cashout).toBe("");
    expect(live.pendingApprovals).toHaveLength(0);
    expect(out.reply).toContain("נדחתה");
  });

  it("מסירה חוזרת של פקודת היציאה החריגה לא מכפילה ממתין", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "c4a").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 5000 }], "c4b").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 5000 }], "c4b").live;
    expect(ops(live, "cashout")).toHaveLength(1);
  });

  it("עריכה־למטה של היציאה מתחת לתקרה מבטלת את הממתין ומחילה רגיל", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "c5a").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 5000 }], "c5b").live;
    expect(ops(live, "cashout")).toHaveLength(1);
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 400 }], "c5b").live;
    expect(live.pendingApprovals).toHaveLength(0);
    expect(P(live).cashout).toBe("400");
  });

  it("ביטול הודעת־האישור פותח את השחקן ומשיב את הממתין; עריכת הודעת־הממתין אז מחילה יציאה רגילה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "c6a").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 5000 }], "c6b").live;
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "c6c").live;
    expect(P(live).cashout).toBe("5000");
    // עריכת הודעת־האישור לדחייה: הביטול פותח את השחקן ומשיב את הממתין,
    // והדחייה צורכת אותו — השחקן נשאר פתוח
    live = apply(live, [{ kind: "reject", name: "קובי סעדה" }], "c6c").live;
    expect(P(live).cashout).toBe("");
    expect(live.pendingApprovals).toHaveLength(0);
    // ויציאה רגילה אחר כך עובדת כרגיל
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 300 }], "c6d").live;
    expect(P(live).cashout).toBe("300");
  });
});

describe("מתחת לתקרה — נתיב רגיל בלי ממתין", () => {
  it("טיפ בגבול התקרה בדיוק (2,000 ג'יטונים) חל מיד; אחד מעליו ממתין", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "u1a").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 2000 }], "u1b").live;
    expect(P(live).tipsGiven).toBe(2000);
    expect(live.pendingApprovals || []).toHaveLength(0);
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 2001 }], "u1c").live;
    expect(ops(live, "tip")).toHaveLength(1);
    expect(P(live).tipsGiven).toBe(2000);
  });

  it("יציאה בגבול (תקרה+קניות) בדיוק חלה מיד", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "u2a").live;
    // (1000+100)₪ × 2 = 2,200 ג'יטונים — בדיוק בגבול
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 2200 }], "u2b").live;
    expect(P(live).cashout).toBe("2200");
    expect(live.pendingApprovals || []).toHaveLength(0);
  });
});

describe("זוכה־ענק — קנייה 100₪, זכייה מעל ~2,100₪", () => {
  it("יציאת 5,000 ג'יטונים (=2,500₪) הולכת לתור; באישור מוחלת", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "w1a").live;
    const out = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 5000 }], "w1b");
    live = out.live;
    expect(P(live).cashout).toBe("");
    expect(ops(live, "cashout")).toEqual([
      expect.objectContaining({ name: "קובי סעדה", amount: 5000, op: "cashout" }),
    ]);
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "w1c").live;
    expect(P(live).cashout).toBe("5000");
    expect(live.pendingApprovals).toHaveLength(0);
  });
});

describe("רגרסיית קנייה חריגה לצד ממתיני־פעולה", () => {
  it("ממתין־קנייה וממתין־טיפ לאותו שחקן חיים יחד; אישור הקנייה לא נוגע בטיפ", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "r1a").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 3000 }], "r1b").live;
    live = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "r1c").live;
    expect(live.pendingApprovals).toHaveLength(2);
    expect(ops(live, "tip")).toHaveLength(1);
    const buys = (live.pendingApprovals || []).filter((p) => !p.op);
    expect(buys).toEqual([expect.objectContaining({ name: "קובי סעדה", amount: 5000 })]);
    // אישור אחד צורך את הראשון בתור (הטיפ) — הקנייה נשארת ממתינה
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "r1d").live;
    expect(P(live).tipsGiven).toBe(3000);
    expect(P(live).buyin).toBe(100);
    expect(live.pendingApprovals).toHaveLength(1);
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "r1e").live;
    expect(P(live).buyin).toBe(5100);
    expect(live.pendingApprovals).toHaveLength(0);
  });

  it("ממתין־קנייה ישן (בלי שדה op) מאושר כרגיל — תאימות לאחור של המבנה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "r2a").live;
    const item = live.pendingApprovals[0];
    expect(item.op).toBeUndefined();
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "r2b").live;
    expect(P(live).buyin).toBe(5000);
  });
});
