/* גל 5 (ממצא ביקורת 19) — פיקסצ'ר לייב מלא בצורת הייצור.
   בדיקות הבוט בנו עד כה לייבים חסרים (שחקנים בלבד), והשדות שהכי קל
   לאבד בכתיבה — מטא־הבוט, חותמות התזכורות, טיוטת הקופה, יומן הביטולים —
   לא הופיעו בהן בכלל, אז שום בדיקה לא הייתה תופסת את אובדנם. הפיקסצ'ר
   הזה נושא את כל השדות ש־blank() מנהל ואת שדות האפליקציה שעוברים
   דרכו, ומשמש בסיס לבדיקות רצף־פקודות מלא. savingsPot עקבי עם
   buyinEvents (15 = 5+5+5 ב־cps=2). */

export const LIVE_T0 = Date.parse("2026-10-30T20:00:00.000Z");

export function makeLiveFull() {
  return {
    entriesCount: "12",
    addAmt: 50,
    startedAt: LIVE_T0,
    cps: 2,
    players: [
      {
        name: "קובי סעדה",
        buyin: 200,
        cashout: "",
        tipsGiven: 10,
        buyinEvents: [
          { amount: 100, at: LIVE_T0, total: 100, pot: 5, sid: "wamid.FIX1:0" },
          { amount: 100, at: LIVE_T0 + 60000, total: 200, pot: 5, sid: "wamid.FIX2:0" },
        ],
      },
      {
        name: "אופיר סנה",
        buyin: 100,
        cashout: "450",
        tipsGiven: 0,
        buyinEvents: [
          { amount: 100, at: LIVE_T0, total: 100, pot: 5, sid: "wamid.FIX1:1" },
        ],
      },
    ],
    applied: {
      "wamid.FIX1": [
        { t: "add", name: "קובי סעדה", delta: 100, created: true },
        { t: "add", name: "אופיר סנה", delta: 100, created: true },
      ],
      "wamid.FIX2": [{ t: "add", name: "קובי סעדה", delta: 100, created: false }],
    },
    pending: "דני לוי",
    closing: false,
    pendingApprovals: [{ name: "דני לוי", amount: 100, at: LIVE_T0 + 5000 }],
    approvedNames: ["קובי סעדה"],
    pendingRemindedAt: LIVE_T0 + 1000,
    bitIdleRemindedAt: LIVE_T0 + 2000,
    pendingRemindAttemptAt: LIVE_T0 + 3000,
    bitIdleRemindAttemptAt: LIVE_T0 + 3500,
    tips: [{ id: "t1", name: "קובי סעדה", amount: 10, at: LIVE_T0 }],
    tipComplimentBag: [1, 2],
    tipComplimentLast: 1,
    tipComplimentBagM: [3, 4],
    tipComplimentLastM: 3,
    tipComplimentBagF: [5, 6],
    tipComplimentLastF: 5,
    coupleFills: [{ name: "קובי סעדה", chips: 30 }],
    savings5: true,
    savingsPot: 15,
    potDraft: "55",
    /* שדות של האפליקציה שעוברים דרך blank בשמירה של הבוט: */
    ts: LIVE_T0 + 4000,
    actionLog: [{ t: "add", name: "קובי סעדה" }],
    planSnap: { location: "אצל קובי" },
    handOfNight: "יד גדולה",
    liveAnnounced: ["rec1"],
    editedAt: LIVE_T0 + 4500,
  };
}
