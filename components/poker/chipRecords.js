/* שיאי ג'יטונים — נפרדים משיאי הכסף (₪).
   מעדיפים שדות chips אמיתיים שנשמרו מהלייב. אם אין chips על ערך
   ישן בכלל — מדלגים (לא ממציאים מ־₪×cps), כך ששיאי היציאה
   מתחילים בפועל מהחודשים שיש בהם נתוני יציאה אמיתיים.
   כל שיא כאן = יציאה בודדת (peak cashout), לא סכום על פני ערבים. */

import { AL, canon } from "./helpers.js";
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

/** כל יציאות הג'יטונים מערבים עם נתונים, ממוין יורד */
export function chipCashoutNights(sessions, aliases) {
  const nights = [];
  for (const s of sessions) {
    if (!sessionHasChips(s)) continue;
    for (const e of s.entries) {
      const c = entryChips(e);
      if (c == null) continue;
      nights.push({
        name: canon(e.name, aliases),
        chips: c,
        d: s.d,
        mo: s.mo,
        y: s.y,
        iso: s.iso,
      });
    }
  }
  nights.sort((a, b) => b.chips - a.chips);
  return nights;
}

/** שיא יציאה בודדת (הכי הרבה ג'יטונים בערב אחד) */
export function bestChipCashout(sessions, aliases) {
  return chipCashoutNights(sessions, aliases)[0] || null;
}

/**
 * חישוב שיאי ג'יטונים לטאב השיאים.
 * monthLabel מצביע על החודש של הערב האחרון עם chips (כמו שיאי הכסף).
 * שיאים = peak cashout בודד לחודש / שנה / כל הזמנים — לא סכומים.
 */
export function computeChipRecords(db) {
  const sessions = [...(db.sessions || [])].sort((a, b) => a.iso.localeCompare(b.iso));
  const withChips = sessions.filter(sessionHasChips);
  if (!withChips.length) return null;

  const last = withChips[withChips.length - 1];
  const A = AL(db);
  const allNights = chipCashoutNights(withChips, A);
  const monthNights = allNights.filter((n) => n.y === last.y && n.mo === last.mo);
  const yearNights = allNights.filter((n) => n.y === last.y);

  return {
    monthLabel: `${MONTHS[last.mo - 1]} ${last.y}`,
    yearLabel: String(last.y),
    bestMonth: monthNights[0] || null,
    bestMonth2: monthNights[1] || null,
    bestMonth3: monthNights[2] || null,
    bestYear: yearNights[0] || null,
    bestYear2: yearNights[1] || null,
    bestYear3: yearNights[2] || null,
    bestCashout: allNights[0] || null,
    bestCashout2: allNights[1] || null,
    bestCashout3: allNights[2] || null,
    nightsWithChips: withChips.length,
  };
}
