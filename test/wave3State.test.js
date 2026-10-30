import { describe, it, expect } from "vitest";
import { applyCommands, extractMessage } from "../lib/whatsapp.js";
import { blank, playerPotSum } from "../lib/wa/state";
import { pickLiveMeta } from "../lib/liveMeta.js";

/* גל 3א — שלמות־מצב (ממצאי ביקורת 4־שארית, 5, 21, 22 + תצפיות גל 2):
   - ביטול טיפ אחרי יציאה מחזיר גם את סכום היציאה (צילום־לפני).
   - ביטול הגדלת־ממתין משחזר את מצב הממתין שלפני ההגדלה.
   - מסירת בקשת־ממתין אחרי אישור לא מכפילה קנייה; הסרת שחקן מפרקת את
     הקופה שלו, כך שהאינווריאנט savingsPot == ‏Σ pot נשמר בכל צעד.
   - הודעה בלי מזהה מקבלת מזהה יציב מהמסירה עצמה — ניסיון חוזר לא מעובד שוב.
   - מסירה מאוחרת מערב שנסגר ונשמר לא פותחת לייב רפאים.
   - יומן הביטולים (applied) נגזם לתקרה.
   - blank שומר כל שדה של הלייב (בעלים אחד לצורת הלייב), וכתיבת האפליקציה
     שומרת את חותמות התזכורות של הבוט.
   כל הבדיקות נכשלות על הקוד שלפני הגל. */

const known = ["עדן גיל", "קובי סעדה", "דוד בני גיל"];
const T0 = 1_700_000_000_000;

function apply(live, cmds, msgId, opts = {}) {
  return applyCommands(live, cmds, msgId, 2, { knownNames: known, now: T0, ...opts }).live;
}

function expectPotInvariant(live) {
  const sumPots = live.players.reduce((s, p) => s + playerPotSum(p), 0);
  expect(live.savingsPot).toBeCloseTo(sumPots, 10);
}

describe("גל 3א — ביטול טיפ אחרי יציאה מחזיר את סכום היציאה (ממצא 4)", () => {
  it("מסירה חוזרת של הודעת טיפ: היציאה חוזרת ל־300 לפני החלה־מחדש, סוף זהה", () => {
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "w3-tip-1");
    live = apply(live, [{ kind: "cashout", name: "קובי", chips: 300 }], "w3-tip-2");
    live = apply(live, [{ kind: "tip", name: "קובי", chips: 20 }], "w3-tip-3");
    expect(live.players[0].cashout).toBe("280");
    expect(live.players[0].tipsGiven).toBe(20);
    // מסירה חוזרת של אותה הודעת טיפ — לפני התיקון היציאה נשארה 280
    // וההחלה־מחדש הורידה שוב ל־260, בעוד הטיפ נספר פעם אחת.
    live = apply(live, [{ kind: "tip", name: "קובי", chips: 20 }], "w3-tip-3");
    expect(live.players[0].cashout).toBe("280");
    expect(live.players[0].tipsGiven).toBe(20);
    expect(live.tips).toHaveLength(1);
    live = apply(live, [{ kind: "tip", name: "קובי", chips: 20 }], "w3-tip-3");
    expect(live.players[0].cashout).toBe("280");
    expect(live.players[0].tipsGiven).toBe(20);
  });

  it("עריכת הודעת טיפ לסכום אחר: היציאה משקפת רק את הטיפ החדש", () => {
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "w3-tip-4");
    live = apply(live, [{ kind: "cashout", name: "קובי", chips: 300 }], "w3-tip-5");
    live = apply(live, [{ kind: "tip", name: "קובי", chips: 20 }], "w3-tip-6");
    live = apply(live, [{ kind: "tip", name: "קובי", chips: 50 }], "w3-tip-6");
    expect(live.players[0].cashout).toBe("250");
    expect(live.players[0].tipsGiven).toBe(50);
    expect(live.tips).toHaveLength(1);
  });
});

describe("גל 3א — ביטול הגדלת־ממתין משחזר צילום־לפני (ממצא 4)", () => {
  it("מסירה חוזרת של הגדלה: הממתין נשאר על הסכום שאחרי ההגדלה הראשונה", () => {
    let live = apply(null, [{ kind: "add", name: "יוסי", amount: 100 }], "w3-pen-1");
    expect(live.pendingApprovals).toHaveLength(1);
    expect(live.pendingApprovals[0].amount).toBe(100);
    expect(live.pendingApprovals[0].at).toBe(T0);
    live = apply(live, [{ kind: "add", name: "יוסי", amount: 50 }], "w3-pen-2");
    expect(live.pendingApprovals).toHaveLength(1);
    expect(live.pendingApprovals[0].amount).toBe(150);
    // לפני התיקון הביטול מעולם לא התאים (חיפש amount=50 מול 150 מצטבר)
    // וההגדלה נספרה שוב — 200.
    live = apply(live, [{ kind: "add", name: "יוסי", amount: 50 }], "w3-pen-2");
    expect(live.pendingApprovals).toHaveLength(1);
    expect(live.pendingApprovals[0].amount).toBe(150);
    live = apply(live, [{ kind: "add", name: "יוסי", amount: 50 }], "w3-pen-2");
    expect(live.pendingApprovals[0].amount).toBe(150);
  });

  it("עריכת הודעת ההגדלה: הממתין משקף את הסכום החדש בלבד", () => {
    let live = apply(null, [{ kind: "add", name: "יוסי", amount: 100 }], "w3-pen-3");
    live = apply(live, [{ kind: "add", name: "יוסי", amount: 50 }], "w3-pen-4");
    live = apply(live, [{ kind: "add", name: "יוסי", amount: 80 }], "w3-pen-4");
    expect(live.pendingApprovals).toHaveLength(1);
    expect(live.pendingApprovals[0].amount).toBe(180);
  });
});

describe("גל 3א — בקשת־ממתין שנמסרה שוב אחרי אישור לא מכפילה קנייה (תצפית גל 2)", () => {
  it("add → approve → מסירת ה־add שוב: הקנייה נספרת פעם אחת", () => {
    let live = apply(null, [{ kind: "add", name: "יוסי", amount: 100 }], "w3-ful-1");
    live = apply(live, [{ kind: "approve", name: "יוסי" }], "w3-ful-2");
    expect(live.players).toHaveLength(1);
    expect(live.players[0].buyin).toBe(100);
    // לפני התיקון: buyin ‏200 וקופה 10 על אותה בקשה בדיוק.
    live = apply(live, [{ kind: "add", name: "יוסי", amount: 100 }], "w3-ful-1");
    expect(live.players).toHaveLength(1);
    expect(live.players[0].buyin).toBe(100);
    expect(live.players[0].buyinEvents).toHaveLength(1);
    expect(live.savingsPot).toBe(5);
    expect(live.pendingApprovals).toHaveLength(0);
    expectPotInvariant(live);
    // וגם מסירה שלישית יציבה
    live = apply(live, [{ kind: "add", name: "יוסי", amount: 100 }], "w3-ful-1");
    expect(live.players[0].buyin).toBe(100);
    expectPotInvariant(live);
  });
});

describe("גל 3א — הסרת שחקן מפרקת את הקופה שלו (תצפית גל 2)", () => {
  it("remove ואז מסירת הודעת היצירה: האינווריאנט נשמר בכל צעד", () => {
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "w3-rm-1");
    expect(live.savingsPot).toBe(2.5);
    live = apply(live, [{ kind: "remove", name: "קובי" }], "w3-rm-2");
    expect(live.players).toHaveLength(0);
    // לפני התיקון הקופה נשארה 2.5 בלי אף אירוע חי.
    expect(live.savingsPot).toBe(0);
    expectPotInvariant(live);
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "w3-rm-1");
    expect(live.players).toHaveLength(1);
    // לפני התיקון: savingsPot ‏5 מול Σ ‏2.5 — קופה כפולה מהאירועים החיים.
    expect(live.savingsPot).toBe(2.5);
    expectPotInvariant(live);
  });
});

describe("גל 3א — הודעה בלי מזהה מקבלת מזהה יציב מהמסירה (ממצא 21)", () => {
  const payload = (body, extra = {}) => ({
    messages: [
      {
        text: { body },
        chat_id: "972535217589-120363000@g.us",
        from: "972535217589",
        timestamp: 1700000000,
        ...extra,
      },
    ],
  });

  it("אותו payload בדיוק → אותו מזהה; תוכן שונה → מזהה שונה; מזהה אמיתי נשמר", () => {
    const a = extractMessage(payload("קובי 50"));
    const b = extractMessage(payload("קובי 50"));
    const c = extractMessage(payload("קובי 100"));
    expect(a.id).toBeTruthy();
    expect(a.id).toBe(b.id);
    expect(c.id).not.toBe(a.id);
    const real = extractMessage(payload("קובי 50", { id: "wamid.REAL1" }));
    expect(real.id).toBe("wamid.REAL1");
    expect(a.timestamp).toBe(1700000000000);
  });

  it("מסירה כפולה של payload בלי מזהה נספרת פעם אחת דרך המזהה המלאכותי", () => {
    const msg = extractMessage(payload("קובי 50"));
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], msg.id);
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], msg.id);
    expect(live.players).toHaveLength(1);
    expect(live.players[0].buyin).toBe(50);
    expect(live.savingsPot).toBe(2.5);
    expectPotInvariant(live);
  });
});

describe("גל 3א — מסירה מאוחרת מערב שנסגר לא פותחת לייב רפאים (ממצא 21)", () => {
  const lastSession = { endedAt: T0, startedAt: T0 - 4 * 3600_000 };

  it("הודעה שחותמתה קודמת לסוף הערב השמור והלייב ריק — נבלעת בשקט", () => {
    const res = applyCommands(null, [{ kind: "add", name: "קובי", amount: 50 }], "w3-late-1", 2, {
      knownNames: known,
      now: T0 + 3600_000,
      lastSession,
      msgTs: T0 - 1800_000,
    });
    expect(res.reply).toBeNull();
    expect(res.live?.players ?? []).toHaveLength(0);
  });

  it("הודעה טרייה אחרי סוף הערב השמור פותחת ערב חדש כרגיל", () => {
    const live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "w3-late-2", {
      lastSession,
      msgTs: T0 + 5000,
    });
    expect(live.players).toHaveLength(1);
    expect(live.players[0].buyin).toBe(50);
  });

  it("הודעה ישנה כשהלייב פעיל — מעובדת כרגיל (הדדופ מטפל, לא השער)", () => {
    let live = apply(null, [{ kind: "add", name: "קובי", amount: 50 }], "w3-late-3");
    live = apply(live, [{ kind: "add", name: "קובי", amount: 50 }], "w3-late-4", {
      lastSession,
      msgTs: T0 - 1800_000,
    });
    expect(live.players).toHaveLength(1);
    expect(live.players[0].buyin).toBe(100);
  });
});

describe("גל 3א — יומן הביטולים נגזם לתקרה (ממצא 21)", () => {
  it("אחרי 205 הודעות נשמרות רק 200 האחרונות, והאחרונה עדיין הפיכה", () => {
    let live = null;
    for (let i = 0; i < 205; i++) {
      live = apply(live, [{ kind: "entries", count: i }], `w3-cap-${i}`);
    }
    const keys = Object.keys(live.applied);
    expect(keys.length).toBe(200);
    expect(live.applied["w3-cap-0"]).toBeUndefined();
    expect(live.applied["w3-cap-204"]).toBeDefined();
    expect(live.entriesCount).toBe("204");
    live = apply(live, [{ kind: "entries", count: 204 }], "w3-cap-204");
    expect(live.entriesCount).toBe("204");
  });
});

describe("גל 3א — blank הוא הבעלים של צורת הלייב ושומר הכול (ממצא 5)", () => {
  const fullLive = () => ({
    entriesCount: "12",
    addAmt: 50,
    startedAt: T0,
    players: [{ name: "קובי סעדה", buyin: 50, cashout: "", buyinEvents: [{ amount: 50, at: T0, total: 50, pot: 2.5 }] }],
    applied: { m1: [{ t: "add", name: "קובי סעדה", delta: 50, created: true }] },
    pending: null,
    closing: false,
    pendingApprovals: [{ name: "יוסי", amount: 50, at: T0 }],
    approvedNames: ["קובי סעדה"],
    pendingRemindedAt: T0 + 1000,
    bitIdleRemindedAt: T0 + 2000,
    ts: T0 + 3000,
    tips: [{ id: "t1", name: "קובי סעדה", amount: 10, at: T0 }],
    tipComplimentBag: [1, 2],
    tipComplimentLast: 1,
    coupleFills: [{ name: "קובי סעדה", chips: 30 }],
    savings5: true,
    savingsPot: 2.5,
    potDraft: "70",
    // שדות של האפליקציה שהגרסה הסגורה של blank מחקה בכל פקודת בוט:
    actionLog: [{ t: "add", name: "קובי סעדה" }],
    planSnap: { location: "אצל קובי" },
    handOfNight: "יד גדולה",
    liveAnnounced: ["rec1"],
    cps: 4,
    editedAt: T0 + 4000,
    frozenActual: 70,
    potPaid: true,
    futureField: { x: 1 },
  });

  it("blank מחזיר את כל השדות — ידועים, של האפליקציה ועתידיים", () => {
    const out = blank(fullLive());
    const src = fullLive();
    for (const key of Object.keys(src)) {
      expect(out[key], `field ${key}`).toEqual(src[key]);
    }
  });

  it("פקודת בוט משנת־מצב לא מוחקת שדות אפליקציה ולא את חותמות התזכורות", () => {
    // טיפ כשחקן פתוח — פקודה משנת־מצב שלא מאפסת ביודעין אף חותמת
    // (קנייה חדשה כן מאפסת את bitIdleRemindedAt — זו לוגיקת הבוט עצמו).
    const live = apply(fullLive(), [{ kind: "tip", name: "קובי", chips: 10 }], "w3-keep-1");
    expect(live.actionLog).toEqual([{ t: "add", name: "קובי סעדה" }]);
    expect(live.planSnap).toEqual({ location: "אצל קובי" });
    expect(live.handOfNight).toBe("יד גדולה");
    expect(live.liveAnnounced).toEqual(["rec1"]);
    expect(live.cps).toBe(4);
    expect(live.editedAt).toBe(T0 + 4000);
    expect(live.potDraft).toBe("70");
    expect(live.pendingRemindedAt).toBe(T0 + 1000);
    expect(live.bitIdleRemindedAt).toBe(T0 + 2000);
    expect(live.players[0].tipsGiven).toBe(10);
  });
});

describe("גל 3א — כתיבת האפליקציה שומרת את מטא־הבוט (ממצא 5)", () => {
  it("pickLiveMeta נושא את חותמות התזכורות ואת שאר שדות המטא", () => {
    const meta = pickLiveMeta({
      applied: { m1: [] },
      pending: "קובי סעדה",
      closing: true,
      pendingApprovals: [{ name: "יוסי", amount: 50, at: T0 }],
      approvedNames: ["קובי סעדה"],
      tipComplimentBag: [3],
      tipComplimentLast: 2,
      ts: T0,
      pendingRemindedAt: T0 + 111,
      bitIdleRemindedAt: T0 + 222,
    });
    expect(meta.pendingRemindedAt).toBe(T0 + 111);
    expect(meta.bitIdleRemindedAt).toBe(T0 + 222);
    expect(meta.applied).toEqual({ m1: [] });
    expect(meta.ts).toBe(T0);
  });

  it("בלי חותמות — המפתחות לא מומצאים", () => {
    const meta = pickLiveMeta({ applied: {} });
    expect("pendingRemindedAt" in meta).toBe(false);
    expect("bitIdleRemindedAt" in meta).toBe(false);
    expect("ts" in meta).toBe(false);
  });
});
