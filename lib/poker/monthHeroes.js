/* גיבור החודש / ירידת החודש — חישוב טהור. */

import { monthTotals, yearNum } from "./totals.js";
import { MONTHS } from "./format.js";

/**
 * @returns {{
 *   y: number,
 *   mo: number,
 *   label: string,
 *   hero: { name: string, amount: number } | null,
 *   flop: { name: string, amount: number } | null,
 * } | null}
 */
export function computeMonthHeroes(db, y, mo) {
  if (!db) return null;
  const yy = yearNum(y);
  const mm = Number(mo);
  if (yy == null || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;

  const totals = monthTotals(db, yy, mm);
  if (!totals.length) {
    return {
      y: yy,
      mo: mm,
      label: `${MONTHS[mm - 1]} ${yy}`,
      hero: null,
      flop: null,
    };
  }

  const best = totals[0];
  const worst = totals[totals.length - 1];

  return {
    y: yy,
    mo: mm,
    label: `${MONTHS[mm - 1]} ${yy}`,
    hero: best.amount > 0 ? { name: best.name, amount: best.amount } : null,
    flop: worst.amount < 0 ? { name: worst.name, amount: worst.amount } : null,
  };
}

/** חודש לוח שנה נוכחי (או opts.now). */
export function currentCalendarMonth(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  return { y: now.getFullYear(), mo: now.getMonth() + 1 };
}
