import { describe, it, expect } from "vitest";
import { buildNightRecord } from "../components/poker/live/buildNightRecord.js";
import { playerChips } from "../lib/liveView.ts";
import { potForBuyin, r2 } from "../lib/poker/helpers.js";
import { checkNightBalance } from "../lib/poker/nightBalance.js";
import { applyCommands } from "../lib/whatsapp.js";

/* ============================================================================
   תיקון 11.11 — «טיפ הוא רישום בלבד» + החזרת ג'יטוני הטיפ לספירת האיזון.
   פיקסצ'ר שחזור חובה של ערב 9.11 (אומת מול ייצור ומול צילום סיכום הבוט):
   סיכום הבוט החי נתן מייקי ₪475 ואורן ₪110, אבל בסגירה באפליקציה בדיקת
   האיזון ראתה פער −99 ג'יטונים (יציאות 2,894 מול 2,993 שהונפקו) כי 108
   ג'יטוני הטיפ לא יושבים ביציאה של אף שחקן — והקיצוץ היחסי הוריד מהזוכים
   ₪50: אורן נרשמה 101 (יציאה 402) ומייקי 434 (יציאה 968).
   כאן: אותן יציאות אמיתיות + אותם טיפים ⇒ אין אזהרת ג'יטונים, אין קיצוץ,
   והסכומים המלאים נשמרים.
   ============================================================================ */

const NAMES = [
  "עדן גיל",
  "אופיר סנה",
  "אורן גיל",
  "קובי סעדה",
  "דור לירז",
  "עדן לירז",
  "מייקי",
  "דוד בני גיל",
  "איציק תפילין",
];
const BUYINS = [400, 150, 100, 150, 150, 175, 50, 250, 150];
const EXITS = [410, 130, 420, 230, 124, 80, 1050, 450, 0];
const TIPS = [0, 25, 18, 10, 5, 8, 27, 15, 0]; // ג'יטונים, כמו ברשומה
const CPS = 2;

function buyinEventsFor(total) {
  const units = [];
  let left = total;
  while (left > 0) {
    const u = Math.min(50, left);
    units.push({ amount: u, total: u, pot: potForBuyin(u) });
    left -= u;
  }
  return units;
}

function nightPlayers() {
  return NAMES.map((name, i) => ({
    name,
    buyin: BUYINS[i],
    cashout: String(EXITS[i]),
    tipsGiven: TIPS[i],
    buyinEvents: buyinEventsFor(BUYINS[i]),
  }));
}

/* buildNightRecord שואל אישור על אזהרת־נטו (קופת החיסכון לא יושבת
   ב־entries, ולכן הנטו של הערב הוא −128 גם בערב תקין) — מדמים את אישור
   הבעלים, כמו בלחיצת «שמור בכל זאת» על אזהרת הכסף בלבד. */
function withOwnerConfirm(fn) {
  const prev = globalThis.confirm;
  globalThis.confirm = () => true;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.confirm;
    else globalThis.confirm = prev;
  }
}

describe("פיקסצ'ר 9.11 — המספרים עצמם", () => {
  it("הג'יטונים שהונפקו 2,993, היציאות 2,894, הטיפים 108", () => {
    const players = nightPlayers();
    const potChips = players.reduce((s, p) => s + playerChips(p, CPS), 0);
    const cashSumChips = players.reduce((s, p) => s + (+p.cashout || 0), 0);
    const tipsChips = players.reduce((s, p) => s + (+p.tipsGiven || 0), 0);
    expect(potChips).toBe(2993);
    expect(cashSumChips).toBe(2894);
    expect(tipsChips).toBe(108);
    // הפער האמיתי חיובי: 2894 + 108 − 2993 = ‎+9 — עודף קטן, לא חוסר:
    // אין deductChipsShortage ואין אזהרת־חוסר. (האזהרה הגנרית של
    // checkNightBalance נורית על כל פער מעל 0.005 — גם עודף — וזו
    // התנהגות קיימת מלפני התיקון; ההחלטה בשמירה מונעת רק מהחוסר.)
    const check = checkNightBalance({
      entries: players.map((p) => ({
        amount: r2(+p.cashout / CPS - p.buyin),
        tipsGiven: p.tipsGiven,
      })),
      cashSumChips,
      potChips,
      tipsChips,
      cps: CPS,
    });
    expect(check.chipsGap).toBe(9);
    expect(check.chipsGapShekels).toBe(4.5);
  });
});

describe("פיקסצ'ר 9.11 — buildNightRecord לא מקצץ", () => {
  it("אורן ₪110 ומייקי ₪475 מלאים, בלי אזהרת ג'יטונים ובלי שום קיצוץ", () => {
    const players = nightPlayers();
    const potChips = players.reduce((s, p) => s + playerChips(p, CPS), 0);
    const cashSumChips = players.reduce((s, p) => s + (+p.cashout || 0), 0);
    const built = withOwnerConfirm(() =>
      buildNightRecord({
        players,
        cps: CPS,
        cashSumChips,
        potChips,
        startedAt: 1794248775001,
        planSnap: null,
        db: { sessions: [], roster: [] },
        aliases: [],
        tips: [],
        coupleFills: [],
        actionLog: [],
        handOfNight: "",
        savings5: true,
        savingsPot: 70,
        potDraft: "",
        nowMs: () => 1794267679837,
      })
    );
    expect(built.status).toBe("ok");
    const byName = Object.fromEntries(built.rec.entries.map((e) => [e.name, e]));
    expect(byName["אורן גיל"]).toMatchObject({ amount: 110, chips: 420 });
    expect(byName["מייקי"]).toMatchObject({ amount: 475, chips: 1050 });
    // אף שחקן לא קוצץ: כל סכום הוא הנטו הגולמי של היציאה הנספרת
    for (const e of built.rec.entries) {
      expect(e.amount).toBe(r2(e.chips / CPS - e.buyin));
    }
  });

  it("חוסר אמיתי מתחת לטיפים עדיין מתריע ומתחלק מהזוכים כמו היום", () => {
    const players = [
      {
        name: "עדן גיל",
        buyin: 100,
        cashout: "250",
        tipsGiven: 0,
        buyinEvents: buyinEventsFor(100),
      },
      {
        name: "קובי סעדה",
        buyin: 100,
        cashout: "100",
        tipsGiven: 10,
        buyinEvents: buyinEventsFor(100),
      },
    ];
    const potChips = players.reduce((s, p) => s + playerChips(p, CPS), 0);
    const cashSumChips = players.reduce((s, p) => s + (+p.cashout || 0), 0);
    expect(potChips).toBe(380);
    expect(cashSumChips).toBe(350);
    // פער: 350 + 10 טיפים − 380 = ‎−20 ג'יטונים = ‎−₪10 — חוסר אמיתי
    const built = withOwnerConfirm(() =>
      buildNightRecord({
        players,
        cps: CPS,
        cashSumChips,
        potChips,
        startedAt: 1794248775001,
        planSnap: null,
        db: { sessions: [], roster: [] },
        aliases: [],
        tips: [],
        coupleFills: [],
        actionLog: [],
        handOfNight: "",
        savings5: true,
        savingsPot: 10,
        potDraft: "",
        nowMs: () => 1794267679837,
      })
    );
    expect(built.status).toBe("ok");
    const byName = Object.fromEntries(built.rec.entries.map((e) => [e.name, e]));
    // הזוכה היחיד סופג את ה־₪10: 250→230 ג'יטונים, ‎+25→+15₪
    expect(byName["עדן גיל"]).toMatchObject({ amount: 15, chips: 230 });
    expect(byName["קובי סעדה"]).toMatchObject({ amount: -50, chips: 100 });
  });
});

describe("מסלול הפעולה המאושרת (applyOpTip) על שחקן סגור", () => {
  it("ממתין־טיפ היסטורי מאושר על יציאה 500 — היציאה נשארת 500", () => {
    const T0 = 1_700_000_000_000;
    const live0 = {
      players: [
        {
          name: "קובי סעדה",
          buyin: 100,
          cashout: "500",
          buyinEvents: [{ amount: 100, at: T0 }],
        },
      ],
      pendingApprovals: [
        {
          name: "קובי סעדה",
          amount: 300,
          at: T0,
          op: "tip",
          tipBagBefore: [],
          tipLastBefore: null,
          tipFemale: false,
        },
      ],
      applied: {},
      tips: [],
    };
    const out = applyCommands(live0, [{ kind: "approve", name: "קובי סעדה" }], "fx1", 2, {
      knownNames: ["קובי סעדה"],
      now: T0,
    });
    const p = out.live.players.find((x) => x.name === "קובי סעדה");
    expect(p.cashout).toBe("500");
    expect(p.tipsGiven).toBe(300);
    expect((out.live.tips || []).filter((t) => t.name === "קובי סעדה")).toHaveLength(1);
  });
});
