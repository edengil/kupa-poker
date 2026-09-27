/* ערב 26.9.2026 כפי שנשמר ב-Supabase (בלי buyinEvents / זמני טיפים) */
export const NIGHT_26_9 = {
  id: "live_1790462371219",
  iso: "2026-09-26",
  d: 26,
  mo: 9,
  y: 2026,
  cps: 2,
  startedAt: 1790444264082,
  endedAt: 1790462371219,
  entries: [
    { name: "עדן גיל", buyin: 50, chips: 500, amount: 200, tipsGiven: 35 },
    { name: "אורן גיל", buyin: 250, chips: 180, amount: -160, tipsGiven: 0 },
    { name: "דן ינקלויץ", buyin: 300, chips: 680, amount: 40, tipsGiven: 10 },
    { name: "אופיר סנה", buyin: 100, chips: 390, amount: 95, tipsGiven: 20 },
    { name: "קובי סעדה", buyin: 50, chips: 400, amount: 150, tipsGiven: 40 },
    { name: "נתנאל כהן", buyin: 200, chips: 0, amount: -200, tipsGiven: 5 },
    { name: "דור לירז", buyin: 175, chips: 100, amount: -125, tipsGiven: 10 },
  ],
  tips: [
    { name: "אופיר סנה", amount: 5 },
    { name: "נתנאל כהן", amount: 5 },
    { name: "אופיר סנה", amount: 10 },
    { name: "דן ינקלויץ", amount: 5 },
    { name: "קובי סעדה", amount: 10 },
    { name: "אופיר סנה", amount: 5 },
    { name: "קובי סעדה", amount: 5 },
    { name: "דן ינקלויץ", amount: 5 },
    { name: "עדן גיל", amount: 10 },
    { name: "עדן גיל", amount: 10 },
    { name: "קובי סעדה", amount: 10 },
    { name: "עדן גיל", amount: 10 },
    { name: "קובי סעדה", amount: 10 },
    { name: "קובי סעדה", amount: 5 },
    { name: "עדן גיל", amount: 5 },
    { name: "דור לירז", amount: 10 },
  ],
  payments: {
    paid: { 0: true },
    plan: JSON.stringify([
      { from: "אורן גיל", to: "עדן גיל", amount: 160, pair: true },
      { from: "נתנאל כהן", to: "קובי סעדה", amount: 150 },
      { from: "נתנאל כהן", to: "אופיר סנה", amount: 50 },
      { from: "דור לירז", to: "אופיר סנה", amount: 45 },
      { from: "דור לירז", to: "עדן גיל", amount: 40 },
      { from: "דור לירז", to: "דן ינקלויץ", amount: 40 },
    ]),
    received: {},
    confirmations: [{ at: "2026-09-26T22:39:47.684Z", by: "עדן גיל", index: 0, action: "paid" }],
  },
};

/* הלייב של 26.9 רגע לפני שנתנאל יצא — כולם סגורים חוץ ממנו, בלי סגירה מודרכת */
export function liveBeforeLastCashout() {
  return {
    startedAt: NIGHT_26_9.startedAt,
    entriesCount: "25",
    players: NIGHT_26_9.entries.map((e) => ({
      name: e.name,
      buyin: e.buyin,
      cashout: e.name === "נתנאל כהן" ? "" : String(e.chips),
      tipsGiven: e.tipsGiven,
    })),
    tips: NIGHT_26_9.tips.map((t, i) => ({ ...t, id: `t${i}`, at: NIGHT_26_9.startedAt + i })),
    applied: {},
  };
}
