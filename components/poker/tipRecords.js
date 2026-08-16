/* שיאי טיפים (ג'יטונים) — נפרדים משיאי כסף וג'יטוני יציאה.
   טיפ יוצא מערימת השחקן (לא מהקופה). settlement ב־₪ נשאר לפי cashout
   כפי שנרשם; סטטיסטיקות טיפים נשענות על מערך tips / tipsGiven. */

import { AL, canon, r2 } from "./helpers.js";
import { MONTHS } from "./format.js";

/** טיפים של ערב — מהשדה tips ברמת הסשן, או סיכום tipsGiven על entries */
export function sessionTips(s) {
  if (Array.isArray(s?.tips) && s.tips.length) {
    return s.tips.map((t) => ({
      name: t.name,
      amount: +t.amount || 0,
      at: t.at || null,
    }));
  }
  const out = [];
  for (const e of s?.entries || []) {
    const n = +e.tipsGiven || 0;
    if (n > 0) out.push({ name: e.name, amount: n, at: null });
  }
  return out;
}

function tipNights(sessions, aliases) {
  return sessions.map((s) => {
    const byName = {};
    let count = 0;
    let chips = 0;
    let biggest = null;
    for (const t of sessionTips(s)) {
      const nm = canon(t.name, aliases);
      const amt = +t.amount || 0;
      if (amt <= 0) continue;
      byName[nm] = (byName[nm] || 0) + amt;
      byName[`${nm}__count`] = (byName[`${nm}__count`] || 0) + 1;
      count += 1;
      chips += amt;
      if (!biggest || amt > biggest.amount) biggest = { name: nm, amount: amt };
    }
    return { s, byName, count, chips, biggest };
  });
}

/**
 * @returns {null | object} שיאי טיפים לתצוגה ב-RecordsTab
 */
export function computeTipRecords(db) {
  const sessions = [...(db.sessions || [])].sort((a, b) => a.iso.localeCompare(b.iso));
  const A = AL(db);
  const nights = tipNights(sessions, A).filter((n) => n.count > 0);
  if (!nights.length) return null;

  const last = sessions[sessions.length - 1];
  const monthNights = nights.filter((n) => n.s.y === last.y && n.s.mo === last.mo);

  // שיא טיפ בודד
  let biggestTip = null;
  for (const n of nights) {
    if (n.biggest && (!biggestTip || n.biggest.amount > biggestTip.amount)) {
      biggestTip = {
        ...n.biggest,
        d: n.s.d,
        mo: n.s.mo,
        y: n.s.y,
      };
    }
  }

  // הכי הרבה טיפים בערב (מספר) + סך ג'יטונים בערב
  let mostTipsNight = null; // by count
  let mostTipChipsNight = null; // by chips from one person in one night
  for (const n of nights) {
    for (const [key, val] of Object.entries(n.byName)) {
      if (key.endsWith("__count")) {
        const nm = key.slice(0, -"__count".length);
        if (!mostTipsNight || val > mostTipsNight.count) {
          mostTipsNight = { name: nm, count: val, d: n.s.d, mo: n.s.mo, y: n.s.y };
        }
      } else if (!key.includes("__")) {
        if (!mostTipChipsNight || val > mostTipChipsNight.chips) {
          mostTipChipsNight = { name: key, chips: val, d: n.s.d, mo: n.s.mo, y: n.s.y };
        }
      }
    }
  }

  const sumBy = (list) => {
    const acc = {};
    for (const n of list) {
      for (const [key, val] of Object.entries(n.byName)) {
        if (key.endsWith("__count") || key.includes("__")) continue;
        acc[key] = r2((acc[key] || 0) + val);
      }
    }
    return Object.entries(acc)
      .map(([name, chips]) => ({ name, chips }))
      .sort((a, b) => b.chips - a.chips);
  };

  const monthTotals = sumBy(monthNights);
  const allTotals = sumBy(nights);

  return {
    monthLabel: `${MONTHS[last.mo - 1]} ${last.y}`,
    biggestTip,
    mostTipsNight,
    mostTipChipsNight,
    monthKing: monthTotals[0] || null,
    monthKing2: monthTotals[1] || null,
    monthKing3: monthTotals[2] || null,
    allKing: allTotals[0] || null,
    allKing2: allTotals[1] || null,
    allKing3: allTotals[2] || null,
  };
}
