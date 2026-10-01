/* מדד אמינות הגעה — חישוב טהור.
   הנתונים מגיעים מצילום (snapshot) שנשמר על הערב בשמירה מהלייב:
   session.attendance = { rsvp: { yes: [], maybe: [], no: [] }, actual: [] }
   ערבים בלי צילום לא נספרים — אין היסטוריית אישורי הגעה אחורה,
   אז עד שיצטברו צילומים המדד מחזיר מעט נתונים והמסך אומר זאת במפורש. */

import { AL, canon } from "./helpers.js";

/** מינימום ערבים עם צילום אישורי הגעה כדי להציג מדד. */
export const ATTENDANCE_MIN_NIGHTS = 2;

function namesOf(list, A) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const name = canon(String(raw || "").trim(), A);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * @returns {{
 *   nights: number,
 *   enough: boolean,
 *   rows: Array<{ name: string, saidYes: number, attended: number, noShows: number,
 *     cameAnyway: number, reliability: number|null }>,
 *   mostReliable: object | null, biggestNoShow: object | null,
 * }}
 */
export function computeAttendance(db) {
  const empty = { nights: 0, enough: false, rows: [], mostReliable: null, biggestNoShow: null };
  const sessions = (db?.sessions || []).filter((s) => s?.attendance && typeof s.attendance === "object");
  if (!sessions.length) return empty;
  const A = AL(db);

  const byName = {};
  const bump = (name) =>
    (byName[name] = byName[name] || {
      name,
      saidYes: 0,
      attended: 0,
      noShows: 0,
      cameAnyway: 0,
      reliability: null,
    });

  let nights = 0;
  for (const session of sessions) {
    const rsvp = session.attendance.rsvp || {};
    const yes = namesOf(rsvp.yes, A);
    const actual = new Set(namesOf(session.attendance.actual, A));
    if (!yes.length && !actual.size) continue;
    nights += 1;
    for (const name of yes) {
      const row = bump(name);
      row.saidYes += 1;
      if (actual.has(name)) row.attended += 1;
      else row.noShows += 1;
    }
    for (const name of actual) {
      if (!yes.includes(name)) bump(name).cameAnyway += 1;
    }
  }

  if (!nights) return empty;

  const rows = Object.values(byName)
    .map((row) => ({
      ...row,
      reliability: row.saidYes ? Math.round((row.attended / row.saidYes) * 100) : null,
    }))
    .sort(
      (a, b) =>
        (b.reliability ?? -1) - (a.reliability ?? -1) ||
        b.saidYes - a.saidYes ||
        a.name.localeCompare(b.name, "he")
    );

  const reliable = rows.filter((r) => r.saidYes >= 2 && r.reliability != null);
  const mostReliable = reliable.length ? reliable[0] : null;
  const biggestNoShow =
    [...rows].filter((r) => r.noShows > 0).sort((a, b) => b.noShows - a.noShows)[0] || null;

  return {
    nights,
    enough: nights >= ATTENDANCE_MIN_NIGHTS,
    rows,
    mostReliable,
    biggestNoShow,
  };
}

/** צילום אישורי הגעה לערב שנשמר — נבנה בשמירה מהלייב. */
export function buildAttendanceSnapshot({ rsvpRows, actualNames, aliases = {} } = {}) {
  const byStatus = { yes: [], maybe: [], no: [] };
  for (const row of Array.isArray(rsvpRows) ? rsvpRows : []) {
    const status = row?.status;
    if (!byStatus[status]) continue;
    const name = canon(String(row?.playerName || row?.name || "").trim(), aliases);
    if (name && !byStatus[status].includes(name)) byStatus[status].push(name);
  }
  return {
    rsvp: byStatus,
    actual: namesOf(actualNames, aliases),
    capturedAt: new Date().toISOString(),
  };
}
