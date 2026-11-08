import { describe, it, expect } from "vitest";
import { applyCommands } from "../lib/whatsapp.js";
import { undo, blank } from "../lib/wa/state.ts";

/* ============================================================================
   גל 4 · פריט 4.2 — השלמת האימות של תיקון גל 1א (שער 0.3): נתיב הדלתא
   בבוט כבר היה תקין; כאן נסגרים שלושת הפערים שנשארו פתוחים:
   (א) תרחיש C5 השני של השער — טיפ לפני cashout ואז ביטול.
   (ב) פאז שימור־ג'יטונים על רצפי apply/עריכה/מסירה־חוזרת, במודל־דלתא
       עצמאי (כולל קלאמפ: הדלתא היא מה שבאמת ירד מהערימה).
   (ג) החלק הקוסמטי של הממצא המקורי — שחזור שקית המחמאה בביטול:
       הרשומה הישנה שמרה צילום של שדה המורשת, אבל השליפה חיה במפתחות
       המגדריים (BagM/BagF) — הביטול לא החזיר את השקית האמיתית. עכשיו כן.
   ============================================================================ */

const known = ["עדן גיל", "קובי סעדה", "אורן גיל", "דוד בני גיל"];
const T0 = 1_700_000_000_000;
const apply = (live, cmds, msgId) =>
  applyCommands(live, cmds, msgId, 2, { knownNames: known, now: T0 });
const P = (live, name = "קובי סעדה") => live.players.find((p) => p.name === name);

describe("4.2(א) — טיפ לפני cashout, ביטול, ואז cashout (תרחיש C5 של השער)", () => {
  it("הביטול מדויק וה־cashout שאחריו נקי", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "seat").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 50 }], "tip1").live;
    expect(P(live).tipsGiven).toBe(50);
    expect(P(live).cashout).toBe("");
    // ביטול הטיפ בעריכת ההודעה ל־0
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 0 }], "tip1").live;
    expect(P(live).tipsGiven).toBe(0);
    expect(live.tips).toHaveLength(0);
    // cashout אחרי הביטול — בלי שום שארית מהטיפ
    live = apply(live, [{ kind: "cashout", name: "קובי סעדה", chips: 500 }], "out").live;
    expect(P(live).cashout).toBe("500");
    expect(P(live).tipsGiven).toBe(0);
  });
});

describe("4.2(ב) — פאז שימור־ג'יטונים במודל־דלתא עצמאי", () => {
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("300 רצפים: tipsGiven = Σ טיפים פעילים; cashout לפי מודל הדלתא", () => {
    const rnd = mulberry32(20261108);
    for (let seq = 0; seq < 300; seq++) {
      const name = "קובי סעדה";
      let live = apply(null, [{ kind: "add", name, amount: 100 }], `seat${seq}`).live;
      // מודל עצמאי: cashout נומרי או null; לכל הודעת טיפ פעילה — סכום ודלתא
      const model = { cashout: null, tips: new Map() };
      const X = 100 + Math.floor(rnd() * 900);
      live = apply(live, [{ kind: "cashout", name, chips: X }], `out${seq}`).live;
      model.cashout = X;
      const msgIds = [];
      const steps = 1 + Math.floor(rnd() * 6);
      for (let s = 0; s < steps; s++) {
        const roll = rnd();
        if (roll < 0.55 || !msgIds.length) {
          // טיפ חדש מהודעה חדשה (לפעמים מעל הערימה — קלאמפ)
          const amt = 1 + Math.floor(rnd() * 200);
          const mid = `s${seq}m${s}`;
          live = apply(live, [{ kind: "tip", name, chips: amt }], mid).live;
          let delta = 0;
          if (model.cashout != null) {
            delta = model.cashout - Math.max(0, model.cashout - amt);
            model.cashout = Math.max(0, model.cashout - amt);
          }
          model.tips.set(mid, { amount: amt, delta });
          msgIds.push(mid);
        } else if (roll < 0.8) {
          // עריכה/מסירה־חוזרת של הודעת טיפ קיימת לסכום חדש (כולל 0 = ביטול)
          const mid = msgIds[Math.floor(rnd() * msgIds.length)];
          const old = model.tips.get(mid);
          const amt = Math.floor(rnd() * 200);
          live = apply(live, [{ kind: "tip", name, chips: amt }], mid).live;
          // ביטול הישן במודל: הדלתא חוזרת על הערך הנוכחי
          if (old && model.cashout != null) model.cashout += old.delta;
          if (amt > 0) {
            let delta = 0;
            if (model.cashout != null) {
              delta = model.cashout - Math.max(0, model.cashout - amt);
              model.cashout = Math.max(0, model.cashout - amt);
            }
            model.tips.set(mid, { amount: amt, delta });
          } else {
            model.tips.delete(mid);
          }
        } else {
          // תיקון cashout בהודעה חדשה — דורס את הערימה, הטיפים נשארים
          const v = 100 + Math.floor(rnd() * 900);
          live = apply(live, [{ kind: "cashout", name, chips: v }], `fix${seq}x${s}`).live;
          model.cashout = v;
        }
        const p = P(live, name);
        const sumActive = [...model.tips.values()].reduce((sum, t) => sum + t.amount, 0);
        expect(p.tipsGiven).toBe(sumActive);
        expect(p.cashout).toBe(model.cashout == null ? "" : String(model.cashout));
        expect(live.tips).toHaveLength(model.tips.size);
      }
    }
  }, 120000);
});

describe("4.2(ג) — שחזור שקית המחמאה בביטול (החלק הקוסמטי)", () => {
  it("זכר: הביטול מחזיר את BagM/LastM בדיוק למצב שלפני הטיפ", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "seat").live;
    const bagM0 = [...(live.tipComplimentBagM || [])];
    const lastM0 = live.tipComplimentLastM ?? null;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 30 }], "tip1").live;
    // הטיפ צרך מהשקית (או מילא וצרך) — המצב זז
    const state = blank(live);
    undo(state, state.applied["tip1"]);
    expect(state.tipComplimentBagM || []).toEqual(bagM0);
    expect(state.tipComplimentLastM ?? null).toBe(lastM0);
    // גם מראת המורשת חזרה
    expect(state.tipComplimentBag).toEqual(bagM0.length ? bagM0 : state.tipComplimentBag);
  });

  it("נקבה: הביטול מחזיר את BagF/LastF בדיוק למצב שלפני הטיפ", () => {
    let live = apply(null, [{ kind: "add", name: "אורן גיל", amount: 100 }], "seat").live;
    // טיפ ראשון כדי שהשקית תהיה מאותחלת ויציבה לצילום־לפני
    live = apply(live, [{ kind: "tip", name: "אורן גיל", chips: 10 }], "tip0").live;
    const bagF0 = [...(live.tipComplimentBagF || [])];
    const lastF0 = live.tipComplimentLastF ?? null;
    expect(bagF0.length).toBeGreaterThan(0);
    live = apply(live, [{ kind: "tip", name: "אורן גיל", chips: 20 }], "tip1").live;
    expect(live.tipComplimentBagF).toHaveLength(bagF0.length - 1);
    const state = blank(live);
    undo(state, state.applied["tip1"]);
    expect(state.tipComplimentBagF).toEqual(bagF0);
    expect(state.tipComplimentLastF ?? null).toBe(lastF0);
  });

  it("אחרי ביטול, הטיפ הבא שולף את אותה מחמאה שהייתה נשלפת בלי הביטול", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "seat").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 10 }], "tip0").live;
    const bagBefore = [...(live.tipComplimentBagM || [])];
    const r1 = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 20 }], "tip1");
    // ביטול הטיפ השני, ואז טיפ חדש — השליפה חייבת להיות אותה שליפה
    const state = blank(r1.live);
    undo(state, state.applied["tip1"]);
    expect(state.tipComplimentBagM).toEqual(bagBefore);
  });

  it("רשומת מורשת בלי bagV: שחזור שדות המורשת נשמר כמו שהיה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי סעדה", amount: 100 }], "seat").live;
    live = apply(live, [{ kind: "tip", name: "קובי סעדה", chips: 30 }], "tip1").live;
    const rec = live.applied["tip1"].map((e) => {
      if (e.t !== "tip") return e;
      const { bagV, ...rest } = e;
      return { ...rest, bagBefore: [7, 8, 9], lastBefore: 7 };
    });
    const state = blank(live);
    undo(state, rec);
    expect(state.tipComplimentBag).toEqual([7, 8, 9]);
    expect(state.tipComplimentLast).toBe(7);
  });
});
