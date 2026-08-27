/* שיאי ג'יטונים — נפרדים משיאי הכסף (₪).
   מעדיפים chips שנשמרו מהלייב / גיבוי בוט. אם אין — משחזרים
   לפי (קנייה + נטו) * cps, כשקנייה מגיעה מהרשומה או מרשימות ביט.
   בלי קנייה ניתנת לשחזור — מדלגים את אותו שחקן-ערב.
   כל שיא כאן = יציאה בודדת (peak cashout), לא סכום על פני ערבים. */

import { AL, canon } from "./helpers.js";
import { MONTHS } from "./format.js";
import { CPS } from "../../lib/report.js";
import { resolveEntryChips } from "./reconstructChips.js";

function resolveOpts(s, aliases, cps) {
  return { iso: s?.iso, aliases, cps: cps || CPS };
}

/** האם לערב יש לפחות רשומת יציאה בג'יטונים (שמורה או משוחזרת) */
export function sessionHasChips(s, aliases = {}, cps = CPS) {
  if (!Array.isArray(s?.entries)) return false;
  const opts = resolveOpts(s, aliases, cps);
  return s.entries.some((e) => resolveEntryChips(e, opts).chips != null);
}

/** ג'יטונים ביציאה לשחקן בערב — שמורים, או משוחזרים */
export function entryChips(e, ctx = {}) {
  if (e == null) return null;
  if (ctx.iso || ctx.nightsMap) {
    return resolveEntryChips(e, ctx).chips;
  }
  if (e.chips == null || e.chips === "") return null;
  const n = +e.chips;
  return Number.isFinite(n) ? n : null;
}

/** כל יציאות הג'יטונים מערבים עם נתונים, ממוין יורד */
export function chipCashoutNights(sessions, aliases, cps = CPS) {
  const nights = [];
  for (const s of sessions) {
    const opts = resolveOpts(s, aliases, cps);
    for (const e of s.entries || []) {
      const c = resolveEntryChips(e, opts).chips;
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
  const A = AL(db);
  const cps = db?.chipsPerShekel || CPS;
  const withChips = sessions.filter((s) => sessionHasChips(s, A, cps));
  if (!withChips.length) return null;

  const last = withChips[withChips.length - 1];
  const allNights = chipCashoutNights(withChips, A, cps);
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
