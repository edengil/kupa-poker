/* ============================================================================
   חלוקת התשלומים בסוף ערב.

   הסדר:
     1. עיגול לשקלים שלמים תוך שמירה על הסכום הכולל
     2. חוסר מתחלק בין כל המרוויחים לפי גודל הזכייה
     3. זוגות קבועים מכסים אחד את השני קודם
     4. נתנאל (AVOID_CASH_PAY) → מקבלי ביט לפני שזוגות/אחרים מרוקנים אותם
     5. זוגות ששניהם עדיין חייבים — משלמים יחד למרוויחים (פייבוקס קודם, אח״כ ביט)
     6. שאר ההתאמות — נתנאל לפייבוקס רק כשאין מקבל ביט
        - עדן/אורן מקבלים רק פייבוקס או מזומן
   ************************************************************************** */

import { CPS } from "./report";

/* מי שמקבל רק פייבוקס או מזומן, ולא ביט */
export const CASH_ONLY = ["עדן", "אורן", "עדן גיל", "אורן גיל"];

/* מי שלא אוהב להעביר בפייבוקס — יש להתאים אותו קודם למקבלי ביט */
export const AVOID_CASH_PAY = ["נתנאל", "נתנאל כהן"];

/* שמות שכותבים עליהם בלשון נקבה */
export const FEMALE = [
  "אורן",
  "אורן גיל",
  "עדן גושמרוב",
  "עדן גורשומוב",
  "עדן לירז",
  "ירדן",
  "ירדן תפילין",
];

/* זוגות שמכסים אחד את השני ואחר כך יכולים לשלם יחד */
export const COUPLES = [
  ["עדן גיל", "אורן גיל"],
  ["דור לירז", "עדן לירז"],
];

const SETTLE_ALIASES = {
  עדן: "עדן גיל",
  אורן: "אורן גיל",
  דור: "דור לירז",
  "עדן ל": "עדן לירז",
  "עדן של דור": "עדן לירז",
  "עדן גורשומוב": "עדן לירז",
  "עדן גושמרוב": "עדן לירז",
  נתנאל: "נתנאל כהן",
};

/** "מעביר" או "מעבירה" לפי השם */
export const transferVerb = (name) => {
  const raw = String(name).trim();
  // העברה משותפת של זוג
  if (raw.includes(" ו")) {
    const parts = raw.split(/\s+ו/);
    const allFemale = parts.every((p) => isFemaleName(p.trim()));
    return allFemale ? "מעבירות" : "מעבירים";
  }
  return isFemaleName(raw) ? "מעבירה" : "מעביר";
};

export const isFemaleName = (name) => {
  const n = String(name).trim();
  return FEMALE.includes(n) || FEMALE.includes(canonName(n));
};

const r0 = (v) => Math.round(v);

export const canonName = (name) => {
  const n = String(name).trim();
  return SETTLE_ALIASES[n] || n;
};

const findByCoupleName = (names, target) => {
  const t = canonName(target);
  return names.findIndex((n) => canonName(n) === t);
};

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

/** האם מקבל התשלום מוגבל לפייבוקס או מזומן */
export function isCashOnly(name) {
  const n = String(name).trim();
  return CASH_ONLY.includes(n) || CASH_ONLY.includes(canonName(n));
}

function avoidsCashPay(name) {
  const n = String(name).trim();
  return AVOID_CASH_PAY.includes(n) || AVOID_CASH_PAY.includes(canonName(n));
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
  const shortfall = total > 0 ? total : 0;
  const surplus = total < 0 ? -total : 0;

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

  const bal = [...adjusted];
  const transfers = [];
  const move = (from, to, amount, extra = {}) => {
    if (amount <= 0) return;
    transfers.push({ from: names[from], to: names[to], amount, ...extra });
    bal[from] += amount;
    bal[to] -= amount;
  };

  const moveJoint = (i, j, to, amount) => {
    if (amount <= 0) return;
    const debtI = bal[i] < 0 ? -bal[i] : 0;
    const debtJ = bal[j] < 0 ? -bal[j] : 0;
    const combined = debtI + debtJ;
    if (combined <= 0) return;
    // חלוקה יחסית — כדי ששניהם יישארו במשחק וימשיכו לשלם יחד למרוויחים הבאים
    let takeI = Math.round((amount * debtI) / combined);
    takeI = Math.max(0, Math.min(debtI, takeI, amount));
    let takeJ = amount - takeI;
    if (takeJ > debtJ) {
      takeJ = debtJ;
      takeI = amount - takeJ;
    }
    if (takeI > debtI) {
      takeI = debtI;
      takeJ = amount - takeI;
    }
    bal[i] += takeI;
    bal[j] += takeJ;
    bal[to] -= amount;
    transfers.push({
      from: `${names[i]} ו${names[j]}`,
      to: names[to],
      amount,
      joint: true,
    });
  };

  // 1) כיסוי פנימי בין בני זוג
  for (const [a, b] of COUPLES) {
    const i = findByCoupleName(names, a);
    const j = findByCoupleName(names, b);
    if (i < 0 || j < 0) continue;
    if (bal[i] < 0 && bal[j] > 0) move(i, j, Math.min(-bal[i], bal[j]), { pair: true });
    else if (bal[j] < 0 && bal[i] > 0) move(j, i, Math.min(-bal[j], bal[i]), { pair: true });
  }

  // 2) נתנאל (וכל מי ב-AVOID_CASH_PAY) → מקבלי ביט קודם, לפני שזוגות/אחרים מרוקנים אותם
  for (;;) {
    let bestL = -1;
    let bestW = -1;
    let bestAmt = 0;
    for (let l = 0; l < bal.length; l++) {
      if (bal[l] >= 0 || !avoidsCashPay(names[l])) continue;
      for (let w = 0; w < bal.length; w++) {
        if (bal[w] <= 0 || isCashOnly(names[w])) continue;
        const amt = Math.min(-bal[l], bal[w]);
        if (
          amt > bestAmt ||
          bestL === -1 ||
          (amt === bestAmt && bal[l] < bal[bestL]) ||
          (amt === bestAmt && bal[l] === bal[bestL] && bal[w] > bal[bestW])
        ) {
          bestAmt = amt;
          bestL = l;
          bestW = w;
        }
      }
    }
    if (bestL === -1) break;
    move(bestL, bestW, Math.min(-bal[bestL], bal[bestW]));
  }

  // 3) זוג ששניהם עדיין חייבים — משלמים יחד למרוויחים (פייבוקס קודם → נשאר ביט לאחרים)
  for (const [a, b] of COUPLES) {
    const i = findByCoupleName(names, a);
    const j = findByCoupleName(names, b);
    if (i < 0 || j < 0) continue;
    for (;;) {
      const debtI = bal[i] < 0 ? -bal[i] : 0;
      const debtJ = bal[j] < 0 ? -bal[j] : 0;
      if (debtI <= 0 || debtJ <= 0) break;
      const combined = debtI + debtJ;
      // פייבוקס/מזומן קודם (הסכום הגדול), אחר כך ביט מהקטן לגדול (אופיר לפני דן)
      let winnerCash = -1;
      let winnerBit = -1;
      bal.forEach((v, k) => {
        if (v <= 0 || k === i || k === j) return;
        if (isCashOnly(names[k])) {
          if (winnerCash === -1 || v > bal[winnerCash]) winnerCash = k;
        } else if (winnerBit === -1 || v < bal[winnerBit]) {
          winnerBit = k;
        }
      });
      const w = winnerCash !== -1 ? winnerCash : winnerBit;
      if (w === -1) break;
      moveJoint(i, j, w, Math.min(combined, bal[w]));
    }
  }

  // 4) שאר ההעברות — נתנאל לפייבוקס רק אם לא נשאר מקבל ביט
  const findBestPair = () => {
    const losers = [];
    const winners = [];
    bal.forEach((v, i) => {
      if (v < 0) losers.push(i);
      if (v > 0) winners.push(i);
    });
    if (!losers.length || !winners.length) return null;

    const tiers = [
      (l, w) => !avoidsCashPay(names[l]),
      (l, w) => avoidsCashPay(names[l]) && !isCashOnly(names[w]),
      (l, w) => avoidsCashPay(names[l]) && isCashOnly(names[w]),
    ];

    for (const ok of tiers) {
      let bestL = -1;
      let bestW = -1;
      let bestAmt = 0;
      for (const l of losers) {
        for (const w of winners) {
          if (!ok(l, w)) continue;
          const amt = Math.min(-bal[l], bal[w]);
          if (
            amt > bestAmt ||
            (amt === bestAmt && bestL !== -1 && bal[l] < bal[bestL]) ||
            (amt === bestAmt && bestL === -1)
          ) {
            // מעדיפים מפסיד גדול יותר (יותר שלילי) ואז מרוויח גדול
            if (amt > bestAmt || bestL === -1 || bal[l] < bal[bestL] || (bal[l] === bal[bestL] && bal[w] > bal[bestW])) {
              bestAmt = amt;
              bestL = l;
              bestW = w;
            }
          }
        }
      }
      if (bestL !== -1) return [bestL, bestW];
    }
    return null;
  };

  for (;;) {
    const pair = findBestPair();
    if (!pair) break;
    const [loser, winner] = pair;
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
