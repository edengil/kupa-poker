import { describe, it, expect } from "vitest";
import {
  applyCommands,
  botMoneyCeilingIls,
  BOT_MONEY_CEILING_FALLBACK_ILS,
} from "../lib/whatsapp.js";

/* ============================================================================
   גל 4 · פריט 4.5 — תקרת שפיות לפקודות כסף של הבוט (החלטת עדן 7).
   קנייה מעל תקרה נגזרת־היסטוריה לא חלה ומנותבת לתור אישור עדן (אותו
   תור של שחקן לא־מוכר); טיפ/יציאה חריגים נחסמים עם הודעה מפורשת.
   ============================================================================ */

const known = ["עדן גיל", "קובי סעדה", "אורן גיל", "דוד בני גיל"];
const T0 = 1_700_000_000_000;
const apply = (live, cmds, msgId, extra = {}) =>
  applyCommands(live, cmds, msgId, 2, { knownNames: known, now: T0, ...extra });
const P = (live, name = "קובי סעדה") => live.players.find((p) => p.name === name);

describe("התקרה עצמה — נגזרת מהיסטוריה עם רצפת גיבוי", () => {
  it("בלי היסטוריה: רצפת הגיבוי המתועדת", () => {
    expect(BOT_MONEY_CEILING_FALLBACK_ILS).toBe(1000);
    expect(botMoneyCeilingIls(null)).toBe(1000);
    expect(botMoneyCeilingIls({ players: [] })).toBe(1000);
  });

  it("אירוע בודד של 100 לא מרים את הרצפה; 300 מרים ל־1,200", () => {
    const s100 = { players: [{ buyinEvents: [{ amount: 100 }] }] };
    expect(botMoneyCeilingIls(s100)).toBe(1000);
    const s300 = { players: [{ buyinEvents: [{ amount: 100 }, { amount: 300 }] }] };
    expect(botMoneyCeilingIls(s300)).toBe(1200);
  });

  it("הערב האחרון שנסגר נספר גם הוא", () => {
    const last = { players: [{ buyinEvents: [{ amount: 500 }] }] };
    expect(botMoneyCeilingIls({ players: [] }, last)).toBe(2000);
  });
});

describe("קנייה חריגה — לא חלה, ממתינה לאישור", () => {
  it("יושב: +5000 לא נחתם, נכנס לתור עם סימון, ובעל הבית מקבל פנייה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "s1").live;
    const out = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "big1");
    live = out.live;
    expect(P(live).buyin).toBe(100);
    expect(P(live).buyinEvents).toHaveLength(1);
    expect(live.pendingApprovals).toEqual([
      expect.objectContaining({ name: "קובי סעדה", amount: 5000 }),
    ]);
    expect(out.reply).toContain("סכום חריג");
    expect(out.ownerDm).toBeTruthy();
  });

  it("שחקן מוכר שעוד לא יושב: לא מושיב — ממתין, בלי שחקן ובלי קופה", () => {
    const out = apply(null, [{ kind: "add", name: "דוד בני גיל", amount: 5000 }], "big2");
    expect(out.live.players).toHaveLength(0);
    expect(out.live.pendingApprovals).toEqual([
      expect.objectContaining({ name: "דוד בני גיל", amount: 5000 }),
    ]);
    // שום אירוע קנייה לא נוצר — אין קופת־פנטום מאחורי הממתין
    expect(JSON.stringify(out.live)).not.toContain("buyinEvents\":[{");
  });

  it("אישור עדן מחיל את הסכום החריג כמו שהוא", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "big3").live;
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "ok3").live;
    expect(P(live).buyin).toBe(5000);
    expect(live.pendingApprovals).toHaveLength(0);
  });

  it("מסירה חוזרת של אותה הודעה לא מכפילה את הממתין", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "big4").live;
    live = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "big4").live;
    expect(live.pendingApprovals).toEqual([
      expect.objectContaining({ name: "קובי סעדה", amount: 5000 }),
    ]);
    expect(live.players).toHaveLength(0);
  });

  it("עריכת ההודעה למטה מהתקרה: הממתין מתבטל והסכום הנכון חל", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 5000 }], "big5").live;
    live = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 200 }], "big5").live;
    expect(live.pendingApprovals).toHaveLength(0);
    expect(P(live).buyin).toBe(200);
  });
});

describe("סכומי גבול לגיטימיים עוברים", () => {
  it("בדיוק התקרה חל; אחד מעליה ממתין", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "s2").live;
    // ההיסטוריה עדיין 100 → התקרה 1,000: 1001 ממתין
    live = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 1001 }], "edge2").live;
    expect(P(live).buyin).toBe(100);
    expect(live.pendingApprovals).toEqual([
      expect.objectContaining({ name: "קובי סעדה", amount: 1001 }),
    ]);
    // ובדיוק 1,000 חל
    live = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 1000 }], "edge1").live;
    expect(P(live).buyin).toBe(1100);
  });

  it("היסטוריה מרים את התקרה: אחרי אירוע 300 התקרה 1,200", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 300 }], "s3").live;
    live = apply(live, [{ kind: "add", name: "קובי סעדה", amount: 1100 }], "h1").live;
    expect(P(live).buyin).toBe(1400);

    let live2 = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 300 }], "s3b").live;
    live2 = apply(live2, [{ kind: "add", name: "קובי סעדה", amount: 1300 }], "h2").live;
    expect(P(live2).buyin).toBe(300);
    expect(live2.pendingApprovals).toEqual([
      expect.objectContaining({ name: "קובי סעדה", amount: 1300 }),
    ]);
  });

  it("הפחתה (תיקון רישום) לא נחסמת גם כשהיא גדולה מהתקרה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "s4").live;
    live = apply(live, [{ kind: "approve", name: "קובי סעדה" }], "x").live; // no-op בטוח
    const seated = apply(null, [{ kind: "add", name: "דוד בני גיל", amount: 900 }], "s5").live;
    const out = apply(seated, [{ kind: "add", name: "דוד בני גיל", amount: -50 }], "neg1");
    expect(P(out.live, "דוד בני גיל").buyin).toBe(850);
  });
});

describe("טיפ ויציאה חריגים — נחסמים עם הודעה, לא מוחלים", () => {
  it("טיפ ענק נחסם; טיפ רגיל עובר", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "s6").live;
    const out = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 99999 }], "tipbig");
    expect(P(out.live).tipsGiven || 0).toBe(0);
    expect(out.reply).toContain("חורג מתקרת השפיות");
    const ok = apply(out.live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tipok");
    expect(P(ok.live).tipsGiven).toBe(50);
  });

  it("יציאה לגיטימית (ערימה מצטברת) עוברת; יציאה אבסורדית נחסמת", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 500 }], "s7").live;
    // 1,400 ג'יטונים = 700₪ ≤ תקרה 1,000 + קניות 500
    const ok = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 1400 }], "co1");
    expect(P(ok.live).cashout).toBe("1400");
    const bad = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 999999 }], "co2");
    expect(P(bad.live).cashout).toBe("");
    expect(bad.reply).toContain("חורגת מתקרת השפיות");
  });
});
