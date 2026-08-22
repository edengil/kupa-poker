/* השוואת מאזן מול אותו יום בחודש שעבר.

   אין יומן מזומן נפרד — ההיסטוריה היא ערבי sessions (ומאזן שנתי רשמי
   לשנים שכבר נסגרו). בונים תמונת מצב לפי iso <= תאריך העוגן, בשעון ישראל. */

import { AL, r2 } from "./helpers.js";
import { aggregate, yearTotals } from "./totals.js";

const TZ = "Asia/Jerusalem";

function partsInTz(date, timeZone = TZ) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    y: +map.year,
    mo: +map.month,
    d: +map.day,
    hour: +map.hour,
    minute: +map.minute,
  };
}

/** YYYY-MM-DD בשעון ישראל — אותו פורמט כמו session.iso */
export function isoInIsrael(date = new Date()) {
  const { y, mo, d } = partsInTz(date);
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** אותו יום בחודש שעבר (אם אין את היום — סוף החודש), כ-YYYY-MM-DD בישראל. */
export function lastMonthIso(date = new Date()) {
  const { y, mo, d } = partsInTz(date);
  let py = y;
  let pm = mo - 1;
  if (pm < 1) {
    pm = 12;
    py -= 1;
  }
  const lastDay = new Date(py, pm, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${py}-${String(pm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** תאריך מקומי לאותו יום בחודש שעבר — לבדיקות ולשמירת שעה דומה. */
export function sameTimeLastMonth(date = new Date()) {
  const { hour, minute } = partsInTz(date);
  const iso = lastMonthIso(date);
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, mo - 1, d, hour, minute, 0, 0);
}

export function moneyMoved(totals) {
  return r2((totals || []).filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0));
}

function sessionsUpTo(db, asOfIso) {
  return (db.sessions || []).filter((s) => s.iso && s.iso <= asOfIso);
}

/** מאזן שנתי עד תאריך: שנה שנסגרה — yearTotals (כולל רשמי); שנה פתוחה — ערבים עד העוגן. */
export function yearTotalsAsOf(db, y, asOfIso) {
  if (!asOfIso) return yearTotals(db, y);
  const asOfY = +asOfIso.slice(0, 4);
  if (y < asOfY) return yearTotals(db, y);
  if (y > asOfY) return { totals: [], official: false };
  return {
    totals: aggregate(
      sessionsUpTo(db, asOfIso).filter((s) => s.y === y),
      AL(db)
    ),
    official: false,
  };
}

export function monthTotalsAsOf(db, y, mo, asOfIso) {
  const recs = (db.sessions || []).filter((s) => {
    if (s.y !== y || s.mo !== mo) return false;
    if (asOfIso && s.iso && s.iso > asOfIso) return false;
    return true;
  });
  return aggregate(recs, AL(db));
}

export function allTimeTotalsAsOf(db, asOfIso) {
  const ys = new Set([
    ...(db.sessions || []).map((s) => s.y),
    ...(db.yearly || []).map((row) => row.y),
  ]);
  const acc = {};
  for (const y of ys) {
    for (const t of yearTotalsAsOf(db, y, asOfIso).totals) {
      acc[t.name] = r2((acc[t.name] || 0) + t.amount);
    }
  }
  return Object.entries(acc)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function deltaMap(current, previous) {
  const prev = {};
  for (const t of previous || []) prev[t.name] = t.amount;
  const names = new Set([
    ...(current || []).map((t) => t.name),
    ...(previous || []).map((t) => t.name),
  ]);
  const map = {};
  for (const name of names) {
    const cur = (current || []).find((t) => t.name === name)?.amount ?? 0;
    const old = prev[name] ?? 0;
    map[name] = {
      current: cur,
      previous: old,
      delta: r2(cur - old),
      hadPrevious: Object.prototype.hasOwnProperty.call(prev, name),
    };
  }
  return map;
}

/**
 * השוואת הסכומים שמוצגים במסך מול אותו רגע בחודש שעבר.
 * @returns {{ current: object[], previous: object[], deltas: object, moved: { now: number, then: number, delta: number }, asOfIso: string, todayIso: string }}
 */
export function compareToLastMonth(db, scope, y, mo, now = new Date()) {
  const today = partsInTz(now);
  const todayIso = isoInIsrael(now);
  const asOfIso = lastMonthIso(now);
  const asOfY = +asOfIso.slice(0, 4);
  const asOfMo = +asOfIso.slice(5, 7);

  let current = [];
  let previous = [];

  if (scope === "all") {
    current = allTimeTotalsAsOf(db, todayIso);
    previous = allTimeTotalsAsOf(db, asOfIso);
  } else if (scope === "year") {
    current = yearTotalsAsOf(db, y, todayIso).totals;
    previous = yearTotalsAsOf(db, y, asOfIso).totals;
  } else {
    const viewingCurrentMonth = y === today.y && mo === today.mo;
    current = monthTotalsAsOf(db, y, mo, todayIso);
    if (viewingCurrentMonth) {
      previous = monthTotalsAsOf(db, asOfY, asOfMo, asOfIso);
    } else {
      let py = y;
      let pm = mo - 1;
      if (pm < 1) {
        pm = 12;
        py -= 1;
      }
      previous = monthTotalsAsOf(db, py, pm, null);
    }
  }

  const movedNow = moneyMoved(current);
  const movedThen = moneyMoved(previous);
  return {
    current,
    previous,
    deltas: deltaMap(current, previous),
    moved: { now: movedNow, then: movedThen, delta: r2(movedNow - movedThen) },
    asOfIso,
    todayIso,
  };
}

export function playerAllTimeDelta(db, playerName, now = new Date()) {
  const { deltas } = compareToLastMonth(db, "all", null, null, now);
  return deltas[playerName] || null;
}
