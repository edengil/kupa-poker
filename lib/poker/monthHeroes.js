/* גיבור החודש / ירידת החודש — חישוב טהור. */

import { monthTotals, yearNum } from "./totals.js";
import { MONTHS } from "./format.js";
import { AL, canon, r2 } from "./helpers.js";

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

function shiftIso(iso, days) {
  const t = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/**
 * אלוף 30 הימים המתגלגלים — אותו רעיון כמו גיבור החודש, אבל החלון הוא
 * 30 הימים שעד הערב האחרון (לא חודש לוח שנה).
 * @returns {null | { label: string, nights: number, fromIso: string, toIso: string,
 *   hero: { name: string, amount: number } | null,
 *   flop: { name: string, amount: number } | null }}
 */
export function computeRollingHeroes(db, { days = 30 } = {}) {
  const sessions = [...(db?.sessions || [])].filter((s) => s?.iso).sort((a, b) => a.iso.localeCompare(b.iso));
  if (!sessions.length) return null;
  const toIso = sessions[sessions.length - 1].iso;
  const fromIso = shiftIso(toIso, -(days - 1));
  if (!fromIso) return null;
  const inWindow = sessions.filter((s) => s.iso >= fromIso && s.iso <= toIso);
  if (!inWindow.length) return null;

  const totals = aggregateWindow(inWindow, db);
  if (!totals.length) return null;
  const best = totals[0];
  const worst = totals[totals.length - 1];
  return {
    label: `${days} הימים האחרונים`,
    nights: inWindow.length,
    fromIso,
    toIso,
    hero: best.amount > 0 ? { name: best.name, amount: best.amount } : null,
    flop: worst.amount < 0 ? { name: worst.name, amount: worst.amount } : null,
  };
}

function aggregateWindow(sessions, db) {
  const A = AL(db);
  const acc = {};
  for (const s of sessions) {
    for (const e of s.entries || []) {
      const name = canon(e.name, A);
      acc[name] = r2((acc[name] || 0) + (+e.amount || 0));
    }
  }
  return Object.entries(acc)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "he"));
}
