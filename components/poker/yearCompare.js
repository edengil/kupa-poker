/* השוואה מול אשתקד — חישוב טהור, בלי UI. */

import { AL, canon, r2 } from "./helpers.js";
import { yearNum, aggregate, yearTotals, monthTotals } from "./totals.js";

function sessionOnOrBefore(s, throughMo, throughD) {
  const mo = Number(s.mo);
  const d = Number(s.d) || 1;
  if (!Number.isFinite(mo)) return false;
  if (mo < throughMo) return true;
  if (mo > throughMo) return false;
  return d <= throughD;
}

/**
 * נטו לשחקן בשנה — אופציונלי חיתוך עד תאריך (מתחילת השנה).
 * סיכום שנתי רשמי רק כשאין חיתוך (שנה מלאה).
 */
export function playerPeriodNet(db, playerName, y, opts = {}) {
  const A = AL(db);
  const name = canon(playerName, A);
  const yy = yearNum(y);
  if (yy == null) return { name, amount: 0, official: false, nights: 0 };

  const throughMo = opts.throughMo != null ? Number(opts.throughMo) : null;
  const throughD = opts.throughD != null ? Number(opts.throughD) : null;
  const truncated = throughMo != null && Number.isFinite(throughMo);

  if (!truncated) {
    const yt = yearTotals(db, yy);
    const amount = yt.totals.find((t) => t.name === name)?.amount || 0;
    const nights = (db.sessions || []).filter((s) => yearNum(s.y) === yy).length;
    return { name, amount, official: yt.official, nights };
  }

  const sessions = (db.sessions || []).filter(
    (s) => yearNum(s.y) === yy && sessionOnOrBefore(s, throughMo, throughD)
  );
  const amount = aggregate(sessions, A).find((t) => t.name === name)?.amount || 0;
  return { name, amount, official: false, nights: sessions.length };
}

function pctChange(current, prior) {
  if (prior === 0) {
    if (current === 0) return 0;
    return null; // אין בסיס לאחוזים
  }
  return r2(((current - prior) / Math.abs(prior)) * 100);
}

/**
 * השוואת שנה נבחרת מול אותה תקופה אשתקד.
 * אם השנה הנוכחית — מתחילת השנה עד היום (או עד opts.now).
 * שנים קודמות — שנה מלאה מול שנה מלאה.
 *
 * @returns {null | {
 *   name, y, priorY, current, prior, delta, pct,
 *   truncated, officialCurrent, officialPrior, label
 * }}
 */
export function yearOverYear(db, playerName, y, opts = {}) {
  if (!db || !playerName) return null;
  const yy = yearNum(y);
  if (yy == null) return null;

  const now = opts.now instanceof Date ? opts.now : new Date();
  const isCurrentYear = yy === now.getFullYear();
  const truncated = isCurrentYear && opts.fullYear !== true;
  const cut = truncated
    ? { throughMo: now.getMonth() + 1, throughD: now.getDate() }
    : {};

  const cur = playerPeriodNet(db, playerName, yy, cut);
  const pri = playerPeriodNet(db, playerName, yy - 1, cut);

  // בלי נתונים בשתי השנים — אין מה להציג
  if (Math.abs(cur.amount) < 0.005 && Math.abs(pri.amount) < 0.005) return null;

  const delta = r2(cur.amount - pri.amount);
  const pct = pctChange(cur.amount, pri.amount);

  return {
    name: cur.name,
    y: yy,
    priorY: yy - 1,
    current: cur.amount,
    prior: pri.amount,
    delta,
    pct,
    truncated,
    officialCurrent: cur.official,
    officialPrior: pri.official,
    label: truncated ? "מול אשתקד · מתחילת השנה" : "מול אשתקד",
  };
}

/**
 * השוואת חודש נבחר מול אותו חודש אשתקד.
 */
export function monthOverYear(db, playerName, y, mo) {
  if (!db || !playerName) return null;
  const yy = yearNum(y);
  const mm = Number(mo);
  if (yy == null || !Number.isFinite(mm)) return null;

  const A = AL(db);
  const name = canon(playerName, A);
  const current = monthTotals(db, yy, mm).find((t) => t.name === name)?.amount || 0;
  const prior = monthTotals(db, yy - 1, mm).find((t) => t.name === name)?.amount || 0;
  if (Math.abs(current) < 0.005 && Math.abs(prior) < 0.005) return null;

  return {
    name,
    y: yy,
    priorY: yy - 1,
    mo: mm,
    current,
    prior,
    delta: r2(current - prior),
    pct: pctChange(current, prior),
    truncated: false,
    officialCurrent: false,
    officialPrior: false,
    label: "מול אשתקד",
  };
}

/**
 * מפת שם → השוואה, לפי scope של הבאנר/טבלה.
 * scope: "year" | "month" | "all"
 * ל-all משתמשים בשנה הנוכחית (מתחילת השנה).
 */
export function yearOverYearByPlayer(db, scope, y, mo, opts = {}) {
  const map = {};
  if (!db) return map;

  const A = AL(db);
  const names = new Set();
  for (const s of db.sessions || []) {
    for (const e of s.entries || []) names.add(canon(e.name, A));
  }
  for (const row of db.yearly || []) {
    for (const e of row.entries || []) names.add(canon(e.name, A));
  }

  for (const name of names) {
    let row = null;
    if (scope === "month") row = monthOverYear(db, name, y, mo);
    else if (scope === "year") row = yearOverYear(db, name, y, opts);
    else row = yearOverYear(db, name, opts.now?.getFullYear?.() ?? new Date().getFullYear(), opts);
    if (row) map[name] = row;
  }
  return map;
}

/** טקסט קצר לתצוגה: ‎+120 · +15% */
export function formatYoyShort(row) {
  if (!row) return "";
  const amt =
    (row.delta > 0 ? "+" : row.delta < 0 ? "−" : "") +
    Math.abs(row.delta).toLocaleString("en-US");
  if (row.pct == null) return amt;
  const p =
    (row.pct > 0 ? "+" : row.pct < 0 ? "−" : "") +
    Math.abs(Math.round(row.pct)) +
    "%";
  return `${amt} · ${p}`;
}
