import { describe, it, expect } from "vitest";
import { applyCommands } from "../lib/whatsapp.js";

/* ============================================================================
   גל 6 — פריט בונוס (הערת בודק מגל ביטול־התור): החזרת כיסוי נעילה קבוע
   לשני תרחישים שכיסוים אבד במחיקת wave45bOpQueue:
   (א) ביטול הודעת־האישור של ממתין־op היסטורי הופך את ההחלה ומשיב את
       הממתין לתור בצילומו המלא — ואישור חוזר מחיל אותו שוב בדיוק פעם אחת.
   (ב) ממתין־קנייה (שחקן לא־מוכר) וממתין־op היסטורי לאותו שם חיים יחד
       באותו תור ומאושרים בנפרד — אישור אחד לא נוגע בשני.
   ההתנהגות עצמה אומתה בפרובי הבודק (4/4) בגל ביטול־התור; כאן היא ננעלת
   כבדיקה קבועה בסוללה.
   ============================================================================ */

const known = ["עדן גיל", "קובי סעדה", "אורן גיל", "דוד בני גיל"];
const T0 = 1_700_000_000_000;
const apply = (live, cmds, msgId, extra = {}) =>
  applyCommands(live, cmds, msgId, 2, { knownNames: known, now: T0, ...extra });
const P = (live, name = "קובי סעדה") => live.players.find((p) => p.name === name);
const pendings = (live) => live.pendingApprovals || [];

const legacyOpLive = (pendingsList) => ({
  players: [{ name: "קובי סעדה", buyin: 100, cashout: "", buyinEvents: [{ amount: 100, at: T0 }] }],
  pendingApprovals: pendingsList,
  applied: {},
  tips: [],
});

const TIP_ITEM = {
  name: "קובי סעדה",
  amount: 3000,
  at: T0,
  op: "tip",
  tipBagBefore: [],
  tipLastBefore: null,
  tipFemale: false,
};

describe("(א) ביטול הודעת־האישור של ממתין־op היסטורי", () => {
  it("אישור ← ביטול ההודעה: הטיפ מתהפך והממתין חוזר לתור; אישור חוזר מחיל שוב פעם אחת", () => {
    const live0 = legacyOpLive([{ ...TIP_ITEM }]);

    // אישור — הטיפ חל והממתין נצרך
    const approved = apply(live0, [{ kind: "approve", name: "קובי סעדה" }], "g1");
    expect(P(approved.live).tipsGiven).toBe(3000);
    expect(pendings(approved.live)).toHaveLength(0);

    // ביטול: אותה הודעת אישור נמסרת שוב (אותו msgId) אבל בעריכה — התוכן
    // החדש הוא טיפ אחר. ה־applied של g1 מתהפך קודם (מסלול העריכה של
    // Whapi): הטיפ המקורי נמחק והממתין שב לתור בצילומו המלא, ורק אז
    // הטיפ החדש נכנס כממתין משלו (שחקן עם טיפ פתוח — לא מוחל מיד)
    const retracted = apply(approved.live, [{ kind: "tip", name: "קובי סעדה", amount: 999 }], "g1");
    expect(P(retracted.live).tipsGiven || 0).toBe(0);
    expect((retracted.live.tips || []).filter((t) => t.name === "קובי סעדה")).toHaveLength(0);
    expect(pendings(retracted.live)).toHaveLength(1);
    expect(pendings(retracted.live)[0]).toMatchObject({ name: "קובי סעדה", op: "tip", amount: 3000 });

    // אישור חוזר — מחיל את הממתין שוב, בדיוק פעם אחת
    const reapproved = apply(retracted.live, [{ kind: "approve", name: "קובי סעדה" }], "g2");
    expect(P(reapproved.live).tipsGiven).toBe(3000);
    expect((reapproved.live.tips || []).filter((t) => t.name === "קובי סעדה")).toHaveLength(1);
    expect(pendings(reapproved.live)).toHaveLength(0);
  });

  it("ביטול אישור־יציאה היסטורי: היציאה מתבטלת והממתין חוזר", () => {
    const item = { name: "קובי סעדה", amount: 5000, at: T0, op: "cashout", wasPending: false };
    const live0 = legacyOpLive([item]);
    const approved = apply(live0, [{ kind: "approve", name: "קובי סעדה" }], "g3");
    expect(P(approved.live).cashout).toBe("5000");
    expect(pendings(approved.live)).toHaveLength(0);

    const retracted = apply(approved.live, [{ kind: "tip", name: "קובי סעדה", amount: 999 }], "g3");
    expect(P(retracted.live).cashout).toBe("");
    expect(pendings(retracted.live)).toHaveLength(1);
    expect(pendings(retracted.live)[0]).toMatchObject({ name: "קובי סעדה", op: "cashout", amount: 5000 });
  });
});

describe("(ב) ממתין־קנייה וממתין־op לאותו שם — חיים יחד, מאושרים בנפרד", () => {
  it("שני הממתינים מתקיימים; אישור אחד לא נוגע בשני", () => {
    // הצורה ההיסטורית: אותו שם גולמי ("דוד") עם ממתין־קנייה וממתין־טיפ
    const liveB = {
      players: [],
      pendingApprovals: [
        { name: "דוד", amount: 100, at: T0 },
        { name: "דוד", amount: 3000, at: T0, op: "tip", tipBagBefore: [], tipLastBefore: null, tipFemale: false },
      ],
      applied: {},
      tips: [],
    };
    expect(pendings(liveB)).toHaveLength(2);

    // אישור ראשון צורך את ממתין־הקנייה (מושיב את דוד) — ממתין־הטיפ נשאר
    const first = apply(liveB, [{ kind: "approve", name: "דוד" }], "h1");
    expect(P(first.live, "דוד")).toBeTruthy();
    expect(P(first.live, "דוד").buyin).toBe(100);
    expect(P(first.live, "דוד").tipsGiven || 0).toBe(0);
    expect(pendings(first.live)).toHaveLength(1);
    expect(pendings(first.live)[0]).toMatchObject({ name: "דוד", op: "tip", amount: 3000 });

    // אישור שני צורך את ממתין־הטיפ — הקנייה לא נפגעת
    const second = apply(first.live, [{ kind: "approve", name: "דוד" }], "h2");
    expect(P(second.live, "דוד").tipsGiven).toBe(3000);
    expect(P(second.live, "דוד").buyin).toBe(100);
    expect(pendings(second.live)).toHaveLength(0);
  });
});
