import { describe, it, expect } from "vitest";
import { applyCommands } from "../lib/whatsapp.js";

/* ============================================================================
   אין תקרה ואין תור אישור לפקודות כסף בבוט (החלטת עדן 2026-11-09,
   מבטלת את תקרת השפיות של 4.5 ואת תור ה־op של 4.5ב): הקבוצה היא רק
   כניסות/יציאות/טיפים, ומה שרושמים זה מה שהיה — כל פקודת כסף בכל סכום
   חלה מיד בנתיב הרגיל. תיקון נעשה בעריכת ההודעה (ביטול+החלה־מחדש)
   או באתר. הממתין היחיד שנשאר הוא של שחקן לא־מוכר (לא של סכום) —
   וממתיני־op היסטוריים מגל 4ב שעדיין פתוחים בלייב ממשיכים להיות
   ניתנים לאישור/דחייה עד שהתור מתרוקן (תאימות לאחור של הנתונים).
   ============================================================================ */

const known = ["עדן גיל", "קובי סעדה", "אורן גיל", "דוד בני גיל"];
const T0 = 1_700_000_000_000;
const apply = (live, cmds, msgId, extra = {}) =>
  applyCommands(live, cmds, msgId, 2, { knownNames: known, now: T0, ...extra });
const P = (live, name = "קובי סעדה") => live.players.find((p) => p.name === name);
const ops = (live, op) => (live.pendingApprovals || []).filter((p) => p.op === op);

describe("קנייה ענקית חלה מיד — בלי תקרה ובלי ממתין", () => {
  it("קנייה ראשונה של ₪5,000 לשחקן מוכר מושיבה מיד", () => {
    const out = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "a1");
    expect(P(out.live).buyin).toBe(5000);
    expect(P(out.live).buyinEvents).toHaveLength(1);
    expect(out.live.pendingApprovals || []).toHaveLength(0);
    expect(out.reply).not.toContain("חריג");
    expect(out.reply).not.toContain("ממתין לאישור");
  });

  it("קנייה ראשונה של ₪50,000 מושיבה מיד", () => {
    const out = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 50000 }], "a2");
    expect(P(out.live).buyin).toBe(50000);
    expect(out.live.pendingApprovals || []).toHaveLength(0);
  });

  it("תוספת ענקית לשחקן יושב נחתמת מיד", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "a3a").live;
    const out = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "a3b");
    expect(P(out.live).buyin).toBe(5100);
    expect(out.live.pendingApprovals || []).toHaveLength(0);
    expect(out.ownerDm == null).toBe(true);
  });

  it("עריכת הודעת קנייה ענקית לסכום אחר מעדכנת במדויק (ביטול+החלה־מחדש)", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "a4").live;
    expect(P(live).buyin).toBe(5000);
    live = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 50 }], "a4").live;
    expect(P(live).buyin).toBe(50);
    expect(P(live).buyinEvents).toHaveLength(1);
    expect(P(live).buyinEvents[0].amount).toBe(50);
    expect(live.pendingApprovals || []).toHaveLength(0);
  });

  it("מסירה חוזרת של אותה הודעה לא מכפילה את הקנייה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "a5").live;
    live = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "a5").live;
    expect(P(live).buyin).toBe(5000);
    expect(P(live).buyinEvents).toHaveLength(1);
  });
});

describe("טיפ ענק חל מיד — מחמאה + דלתא מזומן 4.2 כרגיל", () => {
  it("טיפ של 99,999 ג'יטונים חל מיד, בלי ממתין", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "b1a").live;
    const out = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 99999 }], "b1b");
    expect(P(out.live).tipsGiven).toBe(99999);
    expect((out.live.tips || []).filter((t) => t.name === "קובי סעדה")).toHaveLength(1);
    expect(ops(out.live, "tip")).toHaveLength(0);
    expect(out.reply).not.toContain("ממתין לאישור");
  });

  it("טיפ ענק על שחקן שכבר סגור מוריד מהיציאה (דלתא, קלאמפ ב־0)", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "b2a").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 500 }], "b2b").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 3000 }], "b2c").live;
    expect(P(live).tipsGiven).toBe(3000);
    expect(P(live).cashout).toBe("0"); // 500 − 3000, קלאמפ ב־0 — בדיוק כמו טיפ רגיל
    expect(live.pendingApprovals || []).toHaveLength(0);
  });
});

describe("יציאה חריגה חלה מיד — זוכה־ענק", () => {
  it("קנייה 100₪ ויציאת 5,000 ג'יטונים (=2,500₪) נסגרת מיד, בלי תור", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "c1a").live;
    const out = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 5000 }], "c1b");
    expect(P(out.live).cashout).toBe("5000");
    expect(ops(out.live, "cashout")).toHaveLength(0);
    expect(out.reply).not.toContain("ממתין לאישור");
  });

  it("יציאת 999,999 ג'יטונים חלה מיד", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 500 }], "c2a").live;
    const out = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 999999 }], "c2b");
    expect(P(out.live).cashout).toBe("999999");
    expect(out.live.pendingApprovals || []).toHaveLength(0);
  });
});

describe("שום פקודת סכום לא יוצרת pendingApprovals", () => {
  it("רצף פקודות־ענק מעורב משאיר את התור ריק לגמרי", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "d1").live;
    live = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 50000 }], "d2").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 99999 }], "d3").live;
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 999999 }], "d4").live;
    expect(live.pendingApprovals || []).toHaveLength(0);
  });

  it("הפחתה גדולה (תיקון רישום) חלה כרגיל", () => {
    let live = apply(null, [{ kind: "add", name: "דוד בני גיל", amount: 900 }], "d5").live;
    const out = apply(live, [{ kind: "add", name: "דוד בני גיל", amount: -50 }], "d6");
    expect(P(out.live, "דוד בני גיל").buyin).toBe(850);
  });
});

describe("ממתין של שחקן לא־מוכר — נשאר (לא קשור לסכום)", () => {
  it("שם לא־מוכר ממתין לאישור בכל סכום — גם 50₪ וגם 5,000₪; אישור מושיב", () => {
    const small = apply(null, [{ kind: "add", name: "זר מוחלט", amount: 50 }], "e1");
    expect(small.live.players).toHaveLength(0);
    expect(small.live.pendingApprovals).toEqual([
      expect.objectContaining({ name: "זר מוחלט", amount: 50 }),
    ]);
    const big = apply(null, [{ kind: "add", name: "זר מוחלט", amount: 5000 }], "e2");
    expect(big.live.players).toHaveLength(0);
    expect(big.live.pendingApprovals).toEqual([
      expect.objectContaining({ name: "זר מוחלט", amount: 5000 }),
    ]);
    const ok = apply(big.live, [{ kind: "approve", name: "זר מוחלט" }], "e3");
    expect(P(ok.live, "זר מוחלט").buyin).toBe(5000);
    expect(ok.live.pendingApprovals).toHaveLength(0);
  });
});

describe("תאימות לאחור — ממתיני־op היסטוריים מגל 4ב בלייב קיים", () => {
  /* לייב מדומה כפי שנכתב במשטר הישן: הממתינים נבנים ידנית בצורת
     הפריטים שהמנגנון הישן כתב (op + צילומי־לפני). */
  const legacyLive = (pendings) => ({
    players: [{ name: "קובי סעדה", buyin: 100, cashout: "", buyinEvents: [{ amount: 100, at: T0 }] }],
    pendingApprovals: pendings,
    applied: {},
    tips: [],
  });

  it("ממתין־טיפ היסטורי עדיין ניתן לאישור — הטיפ מוחל פעם אחת", () => {
    const live = legacyLive([
      { name: "קובי סעדה", amount: 3000, at: T0, op: "tip", tipBagBefore: [], tipLastBefore: null, tipFemale: false },
    ]);
    const out = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "f1");
    expect(P(out.live).tipsGiven).toBe(3000);
    expect((out.live.tips || []).filter((t) => t.name === "קובי סעדה")).toHaveLength(1);
    expect(out.live.pendingApprovals).toHaveLength(0);
    expect(out.reply).toContain("אושר");
  });

  it("ממתין־טיפ היסטורי עדיין ניתן לדחייה — שום טיפ לא מוחל", () => {
    const live = legacyLive([
      { name: "קובי סעדה", amount: 3000, at: T0, op: "tip", tipBagBefore: [], tipLastBefore: null, tipFemale: false },
    ]);
    const out = apply(live, [{ kind: "reject", name: "קובי סעדה" }], "f2");
    expect(P(out.live).tipsGiven || 0).toBe(0);
    expect(out.live.pendingApprovals).toHaveLength(0);
    expect(out.reply).toContain("נדחה");
  });

  it("ממתין־יציאה היסטורי עדיין ניתן לאישור ולדחייה", () => {
    const item = { name: "קובי סעדה", amount: 5000, at: T0, op: "cashout", wasPending: false };
    const ok = apply(legacyLive([item]), [{ kind: "approve", name: "קובי סעדה" }], "f3");
    expect(P(ok.live).cashout).toBe("5000");
    expect(ok.live.pendingApprovals).toHaveLength(0);
    const no = apply(legacyLive([item]), [{ kind: "reject", name: "קובי סעדה" }], "f4");
    expect(P(no.live).cashout).toBe("");
    expect(no.live.pendingApprovals).toHaveLength(0);
  });
});
