/* שיאי יציאה מערבי לייב בלבד — חישוב טהור.
   מקור הנתונים היחיד: session.actionLog שנשמר מהלייב (אירועי seat/cashout
   עם חותמות זמן). ערבים בלי יומן כזה לא נכנסים — לא גוזרים זמני יציאה
   משדות אחרים, כי זה היה ממציא נתונים. */

import { AL, canon } from "./helpers.js";

function actionTimeMs(at) {
  if (typeof at === "number" && Number.isFinite(at)) return at;
  if (typeof at === "string") {
    const t = Date.parse(at);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** זוגות ישיבה→יציאה מתוך יומן פעולות של ערב אחד. */
export function bustPairsFromLog(actionLog, aliases = {}) {
  const seatedAt = {};
  const pairs = [];
  for (const action of Array.isArray(actionLog) ? actionLog : []) {
    const at = actionTimeMs(action?.at);
    if (at == null || !action?.name) continue;
    const name = canon(action.name, aliases);
    if (action.t === "seat") {
      if (seatedAt[name] == null) seatedAt[name] = at;
    } else if (action.t === "remove") {
      delete seatedAt[name];
    } else if (action.t === "cashout") {
      const start = seatedAt[name];
      if (start != null && at > start) {
        pairs.push({ name, seatAt: start, cashoutAt: at, survivalMs: at - start });
      }
      delete seatedAt[name];
    }
  }
  return pairs;
}

/**
 * @returns {null | {
 *   liveNights: number,
 *   fastestExit: { name: string, survivalMs: number, iso: string } | null,
 *   ironMan: { name: string, avgMs: number, nights: number } | null,
 * }}
 */
export function computeBustRecords(db) {
  const sessions = (db?.sessions || []).filter((s) => Array.isArray(s?.actionLog) && s.actionLog.length);
  if (!sessions.length) return null;
  const A = AL(db);

  let fastestExit = null;
  const survivalByPlayer = {};
  let liveNights = 0;

  for (const session of sessions) {
    const pairs = bustPairsFromLog(session.actionLog, A);
    if (!pairs.length) continue;
    liveNights += 1;
    const seenThisNight = new Set();
    for (const pair of pairs) {
      if (!fastestExit || pair.survivalMs < fastestExit.survivalMs) {
        fastestExit = { name: pair.name, survivalMs: pair.survivalMs, iso: session.iso || "" };
      }
      (survivalByPlayer[pair.name] = survivalByPlayer[pair.name] || []).push(pair.survivalMs);
      seenThisNight.add(pair.name);
    }
  }

  if (!liveNights) return { liveNights: 0, fastestExit: null, ironMan: null };

  let ironMan = null;
  for (const [name, arr] of Object.entries(survivalByPlayer)) {
    if (arr.length < 2) continue;
    const avgMs = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
    if (!ironMan || avgMs > ironMan.avgMs) ironMan = { name, avgMs, nights: arr.length };
  }

  return { liveNights, fastestExit, ironMan };
}

/** תצוגת משך הישרדות קצרה: דקות/שעות. */
export function formatSurvivalMs(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} דק׳`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} שע׳ ו־${m} דק׳` : `${h} שע׳`;
}
