/* שיאי טיפים (ג'יטונים) — נפרדים משיאי כסף וג'יטוני יציאה.
   טיפ יוצא מערימת השחקן (לא מהקופה). settlement ב־₪ נשאר לפי cashout
   כפי שנרשם; סטטיסטיקות טיפים נשענות על מערך tips / tipsGiven. */

import { AL, canon, r2 } from "./helpers.js";
import { MONTHS } from "./format.js";
import { tipTotalsByName } from "../nightShare.js";

/** טיפים של ערב — שורה אחת לכל שחקן, לפי הכלל הקנוני האחד של סך
    הטיפים (tipTotalsByName: פר־שחקן max(סכום אירועי היומן, tipsGiven)).
    היומן וה־tipsGiven הם שני רישומים של אותם טיפים — כל מסלולי
    הכתיבה (בוט, אפליקציה, גיבוי) כותבים את שניהם — ולכן לא סוכמים
    אותם ולא בוחרים ביניהם גלובלית, אלא לוקחים פר־שחקן את הגדול.
    עד התיקון (ביקורת משפחת־הפער, ממצא 2) היה כאן או/או גלובלי —
    יומן אם לא־ריק, אחרת tipsGiven — ואותו ערב הציג סך טיפים שונה
    בכל משטח. שיאי האירוע הבודד (כמות אירועים, הטיפ הבודד הגדול)
    הם מושג נפרד של אירועים, ו־tipNights שואב אותם מהיומן עצמו. */
export function sessionTips(s) {
  return Object.entries(tipTotalsByName(s))
    .filter(([, amount]) => amount > 0)
    .map(([name, amount]) => ({ name, amount, at: null }));
}

function tipNights(sessions, aliases) {
  return sessions.map((s) => {
    const byName = {};
    let chips = 0;
    /* סכומים פר־שחקן — מהמקור הקנוני האחד (sessionTips מעל
       tipTotalsByName), כדי ששיאי הסכומים יסכימו עם כל שאר המשטחים. */
    for (const t of sessionTips(s)) {
      const nm = canon(t.name, aliases);
      const amt = +t.amount || 0;
      if (amt <= 0) continue;
      byName[nm] = (byName[nm] || 0) + amt;
      chips += amt;
    }
    /* כמות אירועים והטיפ הבודד הגדול הם שיאי אירועים, לא סכומים —
       נשאבים מאירועי היומן עצמם. בלי יומן, שורות הסכום הקנוניות הן
       האירועים היחידים שיש (אותה התנהגות כמו לפני האיחוד). */
    const journal = Array.isArray(s?.tips) && s.tips.length ? s.tips : null;
    const events = journal
      ? journal.map((t) => ({ name: canon(t.name, aliases), amount: +t.amount || 0 }))
      : Object.entries(byName).map(([name, amount]) => ({ name, amount }));
    let count = 0;
    const singles = [];
    for (const ev of events) {
      if (ev.amount <= 0) continue;
      byName[`${ev.name}__count`] = (byName[`${ev.name}__count`] || 0) + 1;
      count += 1;
      singles.push({ name: ev.name, amount: ev.amount, d: s.d, mo: s.mo, y: s.y });
    }
    return { s, byName, count, chips, singles };
  });
}

function rank(list, key) {
  const sorted = [...list].sort((a, b) => key(b) - key(a));
  return [sorted[0] || null, sorted[1] || null, sorted[2] || null];
}

function topTipperInNight(night) {
  if (!night) return null;
  const rows = Object.entries(night.byName)
    .filter(([k]) => !k.endsWith("__count") && !k.includes("__"))
    .map(([name, chips]) => ({ name, chips }))
    .sort((a, b) => b.chips - a.chips);
  return rows[0] || null;
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

  const singles = nights.flatMap((n) => n.singles);
  const [biggestTip, biggestTip2, biggestTip3] = rank(singles, (x) => x.amount);

  const countRows = [];
  const chipRows = [];
  for (const n of nights) {
    for (const [key, val] of Object.entries(n.byName)) {
      if (key.endsWith("__count")) {
        countRows.push({
          name: key.slice(0, -"__count".length),
          count: val,
          d: n.s.d,
          mo: n.s.mo,
          y: n.s.y,
        });
      } else if (!key.includes("__")) {
        chipRows.push({
          name: key,
          chips: val,
          d: n.s.d,
          mo: n.s.mo,
          y: n.s.y,
        });
      }
    }
  }
  const [mostTipsNight, mostTipsNight2] = rank(countRows, (x) => x.count);
  const [mostTipChipsNight, mostTipChipsNight2, mostTipChipsNight3] = rank(chipRows, (x) => x.chips);

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
  const lastTipsNight = nights[nights.length - 1] || null;
  const lastTipsLeader = topTipperInNight(lastTipsNight);

  return {
    monthLabel: `${MONTHS[last.mo - 1]} ${last.y}`,
    biggestTip,
    biggestTip2,
    biggestTip3,
    mostTipsNight,
    mostTipsNight2,
    mostTipChipsNight,
    mostTipChipsNight2,
    mostTipChipsNight3,
    lastTipsNight: lastTipsNight
      ? {
          d: lastTipsNight.s.d,
          mo: lastTipsNight.s.mo,
          y: lastTipsNight.s.y,
          count: lastTipsNight.count,
          chips: lastTipsNight.chips,
          leader: lastTipsLeader,
        }
      : null,
    monthKing: monthTotals[0] || null,
    monthKing2: monthTotals[1] || null,
    monthKing3: monthTotals[2] || null,
    allKing: allTotals[0] || null,
    allKing2: allTotals[1] || null,
    allKing3: allTotals[2] || null,
  };
}
