/* שיאי ג'יטונים — נפרדים משיאי הכסף (₪).
   מעדיפים שדות chips אמיתיים שנשמרו מהלייב. אם אין chips על ערך
   ישן בכלל — מדלגים (לא ממציאים מ־₪×cps), כך ש"מלך כל הזמנים"
   בג'יטונים מתחיל בפועל מהחודשים שיש בהם נתוני יציאה אמיתיים. */

import { AL, canon, r2 } from "./helpers.js";
import { MONTHS } from "./format.js";

/** האם לערב יש לפחות רשומת יציאה בג'יטונים */
export function sessionHasChips(s) {
  return Array.isArray(s?.entries) && s.entries.some((e) => e.chips != null && e.chips !== "");
}

/** ג'יטונים ביציאה לשחקן בערב — רק אם נשמר במפורש */
export function entryChips(e) {
  if (e == null || e.chips == null || e.chips === "") return null;
  const n = +e.chips;
  return Number.isFinite(n) ? n : null;
}

/**
 * אגרגציה של ג'יטונים לפי שם מתוך ערבים שיש בהם נתוני chips.
 * @returns {{ name, chips }[]} ממוין יורד
 */
export function aggregateChips(sessions, aliases) {
  const acc = {};
  for (const s of sessions) {
    if (!sessionHasChips(s)) continue;
    for (const e of s.entries) {
      const c = entryChips(e);
      if (c == null) continue;
      const nm = canon(e.name, aliases);
      acc[nm] = (acc[nm] || 0) + c;
    }
  }
  return Object.entries(acc)
    .map(([name, chips]) => ({ name, chips: r2(chips) }))
    .sort((a, b) => b.chips - a.chips);
}

/** שיא יציאה בודדת (הכי הרבה ג'יטונים בערב אחד) */
export function bestChipCashout(sessions, aliases) {
  let best = null;
  for (const s of sessions) {
    if (!sessionHasChips(s)) continue;
    for (const e of s.entries) {
      const c = entryChips(e);
      if (c == null) continue;
      const nm = canon(e.name, aliases);
      if (!best || c > best.chips) {
        best = { name: nm, chips: c, d: s.d, mo: s.mo, y: s.y, iso: s.iso };
      }
    }
  }
  return best;
}

/** פודיום 1–3 לפי סך ג'יטונים ביציאה בחודש נתון */
export function monthChipPodium(db, y, mo) {
  return aggregateChips(
    db.sessions.filter((s) => s.y === y && s.mo === mo),
    AL(db)
  ).slice(0, 3);
}

/** מלך/מלכה כל הזמנים — רק ערבים עם נתוני chips אמיתיים */
export function allTimeChipTotals(db) {
  return aggregateChips(db.sessions, AL(db));
}

/**
 * חישוב שיאי ג'יטונים לטאב השיאים.
 * monthLabel מצביע על החודש של הערב האחרון (כמו שיאי הכסף).
 */
export function computeChipRecords(db) {
  const sessions = [...(db.sessions || [])].sort((a, b) => a.iso.localeCompare(b.iso));
  const withChips = sessions.filter(sessionHasChips);
  if (!withChips.length) return null;

  const last = withChips[withChips.length - 1];
  const A = AL(db);
  const podium = monthChipPodium(db, last.y, last.mo);
  const all = allTimeChipTotals(db);
  const high = bestChipCashout(sessions, A);
  // סגן לשיא יציאה בודדת
  let high2 = null;
  const nights = [];
  for (const s of withChips) {
    for (const e of s.entries) {
      const c = entryChips(e);
      if (c == null) continue;
      nights.push({ name: canon(e.name, A), chips: c, d: s.d, mo: s.mo, y: s.y });
    }
  }
  nights.sort((a, b) => b.chips - a.chips);
  if (nights.length > 1) high2 = nights[1];

  return {
    monthLabel: `${MONTHS[last.mo - 1]} ${last.y}`,
    podium,
    allKing: all[0] || null,
    allKing2: all[1] || null,
    bestCashout: high,
    bestCashout2: high2,
    nightsWithChips: withChips.length,
  };
}
