/* שיאי משך משחק — לפי startedAt/endedAt שנשמרים בשמירת ערב. */

import { durWords } from "./helpers.js";

/** משך ערב במילישניות, או null אם אין זמנים תקינים */
export function sessionDurationMs(s) {
  const sa = s?.startedAt != null ? +s.startedAt : NaN;
  const ea = s?.endedAt != null ? +s.endedAt : NaN;
  if (!Number.isFinite(sa) || !Number.isFinite(ea) || ea <= sa) return null;
  return ea - sa;
}

/** רשימת ערבים עם משך תקין, ממוינת לפי ms (יורד כברירת מחדל) */
export function timedSessions(sessions, { ascending = false } = {}) {
  const list = [];
  for (const s of sessions || []) {
    const ms = sessionDurationMs(s);
    if (ms == null) continue;
    list.push({
      ms,
      label: durWords(ms),
      d: s.d,
      mo: s.mo,
      y: s.y,
      iso: s.iso,
    });
  }
  list.sort((a, b) => (ascending ? a.ms - b.ms : b.ms - a.ms));
  return list;
}

/**
 * @returns {null | { longest, longest2, longest3, shortest, shortest2, shortest3, nightsWithTimes }}
 */
export function computeDurationRecords(db) {
  const sessions = [...(db.sessions || [])].sort((a, b) => a.iso.localeCompare(b.iso));
  const longestList = timedSessions(sessions);
  if (!longestList.length) return null;
  const shortestList = [...longestList].sort((a, b) => a.ms - b.ms);

  return {
    longest: longestList[0] || null,
    longest2: longestList[1] || null,
    longest3: longestList[2] || null,
    shortest: shortestList[0] || null,
    shortest2: shortestList[1] || null,
    shortest3: shortestList[2] || null,
    nightsWithTimes: longestList.length,
  };
}
