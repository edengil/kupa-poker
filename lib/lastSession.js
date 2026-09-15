/** בחירת ערב אחרון לחלוקה בטבלה. */

function sessionSortKey(s) {
  const ended = Number(s?.endedAt);
  const endedPart = Number.isFinite(ended) && ended > 0 ? String(ended).padStart(15, "0") : "000000000000000";
  const iso = String(s?.iso || "");
  return `${endedPart}\0${iso}`;
}

/** @returns {object | null} */
export function latestSession(sessions) {
  const list = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
  if (!list.length) return null;
  return [...list].sort((a, b) => sessionSortKey(b).localeCompare(sessionSortKey(a)))[0];
}

/**
 * כשלא משתפים היסטוריה — משאירים רק את הערב האחרון לחלוקה/תשלומים.
 * @returns {object[]}
 */
export function sessionsForViewer(sessions, { shareHistory = true } = {}) {
  if (shareHistory !== false) return Array.isArray(sessions) ? sessions : [];
  const last = latestSession(sessions);
  return last ? [last] : [];
}
