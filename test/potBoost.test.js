/* גל Pot Boost (25.11.2026) — בדיקות התוכנית המאושרת:
   • פיקסצ'ר־הזהב של 22.11 האמיתי: אותם קלטים עם קופה מתוכננת 77.5 ו־90 —
     כל ההעברות כפולות־5, אין 249/41, רגל הקופה = floor5.
   • פאז על שני המסלולים (אוטומטי + שמור): כפולות־5 בכל העברה ובכל
     fromSplit, הוולידטור שקט, רגל הקופה floor5.
   • הקפאה: מחיקה לא משחררת, תוכנית שמורה מוגשת לערב מסומן, חסימת
     עריכת־קופה ב־readOnly, frozenPot.
   • שער כלל 3: בלי אישור צפייה אין payments בהקרנה; אישור סכומים נפרד;
     טקסט הוואטסאפ רק למנהל/מאושר.
   • התראות: שחקן בלי סכום ורק על העברותיו; עדן מקבל הכול.
   • עורך: שמירה לא מסמנת ביצוע. */
import { describe, it, expect } from "vitest";
import {
  paymentPlan,
  markTransfer,
  markPotPaid,
  saveManualPayments,
} from "../lib/paymentTracking.js";
import { resolveSettlement, settlementTextForSession } from "../lib/nightShare.js";
import { snapshotForViewer } from "../lib/publicShare.js";
import { collectNotices, noticesForViewer } from "../lib/notifications.js";
import { potEditBlockReason, withRecordedPot } from "../lib/poker/potEdits.js";
import { withActual } from "../lib/poker/potEdits.js";
import { NIGHT_22_11 } from "./fixtures/night-2026-11-22.js";

const is5 = (n) => Number.isInteger(n) && n % 5 === 0;
function expectAllFive(transfers) {
  for (const t of transfers) {
    if (t.pot || t.residual) continue;
    expect(is5(t.amount), `העברה ${t.from}→${t.to} ${t.amount}`).toBe(true);
    for (const part of Object.values(t.fromSplit || {})) {
      expect(is5(part), `פיצול של ${t.from}→${t.to}`).toBe(true);
    }
  }
}

describe("פיקסצ'ר־הזהב — ערב 22.11 האמיתי דרך המסלול השמור", () => {
  for (const pot of [77.5, 90]) {
    it(`קופה מתוכננת ${pot}: כל ההעברות כפולות־5, אין 249/41, רגל הקופה floor5`, () => {
      const session = { ...NIGHT_22_11, savingsPot: pot, savingsPotActual: undefined };
      const plan = paymentPlan(session);
      expect(plan.problems).toEqual([]);
      expectAllFive(plan.transfers);
      const amounts = plan.transfers.map((t) => t.amount);
      expect(amounts).not.toContain(249);
      expect(amounts).not.toContain(41);
      expect(plan.potTransfer?.amount).toBe(Math.floor(pot / 5) * 5);
      /* שימור נטו מול הצפוי של ה־resolver */
      const resolved = resolveSettlement(session);
      expect(resolved.expected.length).toBeGreaterThan(0);
    });
  }

  it("אותו ערב בלי manualSettlement (אוטומטי): אותן הבטחות", () => {
    const { manualSettlement, ...rest } = { ...NIGHT_22_11, savingsPot: 77.5 };
    const plan = paymentPlan(rest);
    expect(plan.problems).toEqual([]);
    expectAllFive(plan.transfers);
    expect(plan.potTransfer?.amount).toBe(75);
  });
});

describe("פאז — שני המסלולים", () => {
  /* LCG דטרמיניסטי — אותם ערבים בכל ריצה */
  let seed = 20261125;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const NAMES = ["עדן גיל", "אורן גיל", "קובי סעדה", "דן ינקלויץ", "אופיר סנה", "נתנאל כהן", "דור לירז", "איציק תפילין"];
  function randomNight(i) {
    /* ערבים מציאותיים: סכום הנטו = −(טיפים שנשרפו), כמו בייצור */
    const count = 3 + rnd(6);
    const burn = rnd(8) * 5;
    const nets = NAMES.slice(0, count).map(() => rnd(900) - 350);
    nets[count - 1] = -burn - nets.slice(0, count - 1).reduce((s, n) => s + n, 0);
    const entries = NAMES.slice(0, count).map((name, idx) => {
      const net = nets[idx];
      const buyin = Math.max(50, -net + 50 * rnd(4));
      const chips = (buyin + net) * 2;
      return { name, buyin, chips, amount: net, tipsGiven: 0 };
    });
    /* קופה מציאותית: בייצור היא 5% מהבייאינים; כאן עד 25% לכל היותר —
       קופה שגדולה מסך החובות של הערב היא פינת חוסר קיצונית (המנוע מממן
       אז את מה שאפשר), לא תרחיש שההבטחה נמדדת עליו. */
    const totalBuyin = entries.reduce((s, e) => s + e.buyin, 0);
    const pot = Math.min([0, 25, 77.5, 93, 130, 41][rnd(6)], Math.floor(totalBuyin / 4));
    return { id: `fz${i}`, iso: "2026-11-20", cps: 2, savings5: true, savingsPot: pot, entries };
  }
  it("300 ערבים × 2 מסלולים: חמישיות בכל מקום, וולידטור שקט, רגל floor5", () => {
    for (let i = 0; i < 300; i++) {
      const night = randomNight(i);
      for (const session of [night, { ...night, manualSettlement: savedBasisFor(night) }]) {
        const plan = paymentPlan(session);
        expect(plan.problems, `ערב ${i}`).toEqual([]);
        expectAllFive(plan.transfers);
        if (plan.potTransfer) {
          expect(plan.potTransfer.amount).toBe(Math.floor((+night.savingsPot || 0) / 5) * 5);
        }
      }
    }
  });
});

function savedBasisFor(night) {
  const players = night.entries.map((e) => ({
    name: e.name,
    buyin: e.buyin,
    cashout: String(e.chips),
  }));
  return {
    basis: JSON.stringify([night.cps || 2, players]),
    manualPayments: [],
    preferCreditors: [],
    settlementVersion: 2,
    settlementUpdatedAt: "2026-11-20T00:00:00.000Z",
  };
}

describe("הקפאה (B1/B6/C6)", () => {
  const night = {
    id: "fr1", iso: "2026-11-17", cps: 1,
    entries: [
      { name: "עדן גיל", amount: -200 },
      { name: "אופיר סנה", amount: 300 },
      { name: "קובי סעדה", amount: -150 },
      { name: "דור לירז", amount: 50 },
    ],
    savingsPot: 65,
  };

  it("ערב מסומן מוגש מהתוכנית השמורה גם אחרי עריכת קופה", () => {
    const marked = markTransfer(night, 0, true, "עדן גיל");
    const before = paymentPlan(marked);
    const edited = withRecordedPot(marked, 120);
    const after = paymentPlan(edited);
    expect(after.frozen).toBe(true);
    expect(after.transfers).toEqual(before.transfers);
    expect(after.fingerprint).toBe(before.fingerprint);
  });

  it("לפני סימון: העלאת הקופה המתוכננת (Pot Boost) מעצבת מחדש בחמישיות", () => {
    const boosted = withRecordedPot(night, 90);
    const plan = paymentPlan(boosted);
    expectAllFive(plan.transfers);
    expect(plan.potTransfer?.amount).toBe(90);
  });

  it("סימון ראשון כותב frozenPot; עריכת רשום אחריו לא מזיזה את התוכנית", () => {
    const withMs = {
      ...night,
      manualSettlement: {
        basis: JSON.stringify([1, night.entries.map((e) => ({ name: e.name, buyin: 0, cashout: String(Math.max(0, e.amount)) }))]),
        manualPayments: [],
        preferCreditors: [],
        settlementVersion: 2,
        settlementUpdatedAt: "2026-11-17T00:00:00.000Z",
      },
    };
    const marked = markPotPaid(withMs, true, "עדן גיל");
    expect(marked.manualSettlement.frozenPot).toBe(65);
    const planBefore = paymentPlan(marked);
    const edited = withRecordedPot(marked, 200);
    expect(edited.manualSettlement.frozenPot).toBe(65);
    expect(paymentPlan(edited).transfers).toEqual(planBefore.transfers);
    /* עריכת בפועל אחרי הקפאה: רק שדה הפנקס זז */
    const actualEdited = withActual(edited, 40);
    expect(actualEdited.savingsPotActual).toBe(40);
    expect(paymentPlan(actualEdited).transfers).toEqual(planBefore.transfers);
  });

  it("מחיקת שדה קופה לא משחררת הקפאה קיימת", () => {
    const frozenMs = {
      basis: "x", manualPayments: [], preferCreditors: [],
      frozenActual: 70, frozenPot: 65, settlementVersion: 2,
      settlementUpdatedAt: "2026-11-17T00:00:00.000Z",
    };
    const session = { ...night, savingsPotActual: 70, manualSettlement: frozenMs };
    const cleared = withActual(session, 0);
    expect(cleared.manualSettlement).toEqual(frozenMs);
    const clearedRecorded = withRecordedPot(session, 0);
    expect(clearedRecorded.manualSettlement.frozenPot).toBe(65);
  });

  it("עריכת קופה במצב readOnly נחסמת עם הודעה מפורשת", () => {
    expect(potEditBlockReason({ readOnly: true })).toMatch(/צפייה/);
    expect(potEditBlockReason({ readOnly: false })).toBeNull();
    expect(potEditBlockReason({})).toBeNull();
  });
});

describe("שער כלל 3 — אישור צפייה ואישור סכומים", () => {
  const night = {
    id: "g1", iso: "2026-11-17", cps: 1,
    entries: [
      { name: "עדן גיל", amount: -100 },
      { name: "אופיר סנה", amount: 100 },
    ],
    savingsPot: 25,
  };
  const marked = markTransfer(night, 0, true, "עדן גיל");

  it("בלי אישור: ההקרנה לצופה בלי payments בכלל; עם אישור — יש payments בלי potPaid", () => {
    const unapproved = snapshotForViewer({ data: { sessions: [marked] }, config: {} }).data.sessions[0];
    expect(unapproved.payments).toBeUndefined();
    const approved = snapshotForViewer({
      data: { sessions: [{ ...marked, settlementApprovedAt: "2026-11-18T00:00:00.000Z" }] },
      config: {},
    }).data.sessions[0];
    expect(approved.payments).toBeTruthy();
    expect(approved.payments.potPaid).toBeUndefined();
  });

  it("טקסט החלוקה לוואטסאפ: ריק בלי אישור, קיים למנהל תמיד", () => {
    expect(settlementTextForSession(night)).toBe("");
    /* עדן −100 עם קופה 25: מעביר 75 לאופיר + 25 לקופה (שורת הקופה
       לא מופיעה בטקסט הקבוצה) */
    expect(settlementTextForSession(night, { manager: true })).toContain("75");
    const approved = { ...night, settlementApprovedAt: "2026-11-18T00:00:00.000Z" };
    expect(settlementTextForSession(approved)).toContain("75");
  });
});

describe("התראות (כלל 7)", () => {
  const db = {
    roster: ["אופיר סנה", "קובי סעדה"],
    aliases: {},
    yearly: [],
    sessions: [{
      id: "n1", iso: "2026-09-23", d: 23, mo: 9, y: 2026,
      entries: [
        { name: "אופיר", amount: -30 },
        { name: "קובי", amount: 30 },
      ],
    }],
  };
  it("המשלם מקבל פריט בלי סכום; המקבל לא מקבל פריט; עדן מקבל את המלא", () => {
    const items = collectNotices(db, new Date(2026, 8, 25, 12));
    const payer = noticesForViewer(items, "אופיר סנה").filter((i) => i.kind === "transfer");
    expect(payer).toHaveLength(1);
    expect(payer[0].body).not.toMatch(/30/);
    const receiver = noticesForViewer(items, "קובי סעדה").filter((i) => i.kind === "transfer");
    expect(receiver).toEqual([]);
    const eden = noticesForViewer(items, "עדן גיל").filter((i) => i.kind === "transfer");
    expect(eden.length).toBeGreaterThanOrEqual(2);
    expect(eden.every((i) => i.adminOnly)).toBe(true);
    expect(eden.some((i) => /30/.test(i.body))).toBe(true);
  });

  it("עם אישור סכומים — הסכום מופיע בפריט של המשלם עצמו", () => {
    const approvedDb = {
      ...db,
      sessions: [{
        ...db.sessions[0],
        settlementApprovedAt: "2026-09-24T00:00:00.000Z",
        settlementAmountsApprovedAt: "2026-09-24T00:00:00.000Z",
      }],
    };
    const items = collectNotices(approvedDb, new Date(2026, 8, 25, 12));
    const payer = noticesForViewer(items, "אופיר סנה").filter((i) => i.kind === "transfer");
    expect(payer).toHaveLength(1);
    expect(payer[0].body).toMatch(/30/);
  });
});

describe("עורך ידני — תכנון בלבד (§7.5)", () => {
  it("saveManualPayments לא כותב שום סימון paid/received", () => {
    const session = {
      id: "e1", iso: "2026-09-09",
      entries: [
        { name: "א", amount: -100 },
        { name: "ב", amount: 60 },
        { name: "ג", amount: 40 },
      ],
    };
    const next = saveManualPayments(session, [{ from: "א", to: "ב", amount: 25, id: "p1" }]);
    /* אין שום סימון אמת — payments יכול להישאר שלד ריק, אבל בלי paid/received */
    expect(Object.values(next.payments?.paid || {}).some(Boolean)).toBe(false);
    expect(Object.values(next.payments?.received || {}).some(Boolean)).toBe(false);
    const plan = paymentPlan(next);
    expect(plan.transfers[0]).toMatchObject({ from: "א", to: "ב", amount: 25, manual: true });
    expect(plan.paid[0]).toBeUndefined();
  });

  it("ערך ידני לא־עגול מתעגל למעלה לחמישיות בשמירה (§8)", () => {
    const session = {
      id: "e2", iso: "2026-09-09",
      entries: [
        { name: "א", amount: -100 },
        { name: "ב", amount: 60 },
        { name: "ג", amount: 40 },
      ],
    };
    const next = saveManualPayments(session, [{ from: "א", to: "ב", amount: 23, id: "p1" }]);
    const plan = paymentPlan(next);
    expect(plan.transfers[0]).toMatchObject({ from: "א", to: "ב", amount: 25, manual: true });
  });
});
