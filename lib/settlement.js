/* ============================================================================
   חלוקת התשלומים בסוף ערב.

   הסדר כאן לא שרירותי:
     1. עיגול לשקלים שלמים תוך שמירה על הסכום הכולל
     2. חוסר מתחלק בין כל המרוויחים לפי גודל הזכייה
     3. המפסיד הגדול מעביר למרוויח הגדול, וחוזר חלילה

   אין טיפול מיוחד ב"זוגות קבועים": ההעברות תמיד הולכות מהמפסיד הגדול ביותר
   למרוויח הגדול ביותר. כך מספר ההעברות מינימלי וברור מי משלם למי.
   ============================================================================ */

import { CPS } from "./report";

/* מי שמקבל רק פייבוקס או מזומן, ולא ביט */
export const CASH_ONLY = ["עדן", "אורן"];

/* שמות שכותבים עליהם בלשון נקבה. נלקח מהארכיון של הקבוצה —
   "אורן מעבירה", לא "מעביר". שורה אחת להוספה. */
export const FEMALE = ["אורן", "עדן גושמרוב", "עדן גורשומוב", "עדן לירז", "ירדן"];

/** "מעביר" או "מעבירה" לפי השם */
export const transferVerb = (name) =>
  FEMALE.includes(String(name).trim()) ? "מעבירה" : "מעביר";

const r0 = (v) => Math.round(v);

/* ------------------------------------------------------------------
   עיגול לשקלים שלמים בלי לשנות את הסכום הכולל.
   מעגלים כלפי מטה, ואז מחלקים את השארית למי שהשבר שלו הכי גדול.
   ------------------------------------------------------------------ */
function roundPreservingSum(values) {
  const floors = values.map(Math.floor);
  const target = r0(values.reduce((s, v) => s + v, 0));
  let drift = target - floors.reduce((s, v) => s + v, 0);
  const order = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; drift > 0 && k < order.length; k++, drift--) out[order[k].i] += 1;
  return out;
}

/**
 * @returns {{ transfers, shortfall, surplus, nets, unfinished }}
 */
export function settle(players = [], cps = CPS) {
  const unfinished = players.filter((p) => p.cashout === "" || p.cashout == null).map((p) => p.name);

  const names = players.map((p) => p.name);
  const exact = players.map((p) => (+p.cashout || 0) / cps - (+p.buyin || 0));
  const nets = roundPreservingSum(exact);

  const total = nets.reduce((s, v) => s + v, 0);
  const shortfall = total > 0 ? total : 0; // למרוויחים מגיע יותר ממה שהמפסידים חייבים
  const surplus = total < 0 ? -total : 0; // נשאר עודף בקופה

  /* -------- החוסר מתחלק בין המרוויחים לפי גודל הזכייה -------- */
  const adjusted = [...nets];
  if (shortfall > 0) {
    const winners = adjusted.map((v, i) => ({ i, v })).filter((x) => x.v > 0);
    const totalWins = winners.reduce((s, x) => s + x.v, 0);
    if (totalWins > 0) {
      const shares = winners.map((x) => (x.v / totalWins) * shortfall);
      const cuts = roundPreservingSum(shares);
      winners.forEach((x, k) => {
        adjusted[x.i] -= cuts[k];
      });
    }
  }

  /* ------------------------ ההעברות ------------------------ */
  const bal = [...adjusted];
  const transfers = [];
  const move = (from, to, amount) => {
    if (amount <= 0) return;
    transfers.push({ from: names[from], to: names[to], amount });
    bal[from] += amount;
    bal[to] -= amount;
  };

  // המפסיד הגדול מעביר למרוויח הגדול, וחוזר חלילה עד שנסגר הכל
  for (;;) {
    let loser = -1;
    let winner = -1;
    bal.forEach((v, i) => {
      if (v < 0 && (loser === -1 || v < bal[loser])) loser = i;
      if (v > 0 && (winner === -1 || v > bal[winner])) winner = i;
    });
    if (loser === -1 || winner === -1) break;
    move(loser, winner, Math.min(-bal[loser], bal[winner]));
  }

  return {
    transfers,
    shortfall,
    surplus,
    unfinished,
    nets: names.map((n, i) => ({ name: n, net: adjusted[i], raw: nets[i] })),
  };
}

/** האם מקבל התשלום מוגבל לפייבוקס או מזומן.
    התאמה מדויקת בלבד — "עדן לירז" מתחיל ב"עדן" אבל הוא אדם אחר. */
export function isCashOnly(name) {
  return CASH_ONLY.includes(String(name).trim());
}
