/* ליגת נקודות עונתית — חישוב טהור, נקודות בלבד.
   לא נוגע בחישובי כסף: הנקודות נגזרות רק מהמיקום בערב (לפי נטו). */

import { AL, canon, r2 } from "./helpers.js";
import { yearNum } from "./totals.js";

/** נקודות לפי מיקום בערב: 1→10, 2→7, 3→5, 4→3, 5→1. */
export const LEAGUE_POINTS = [10, 7, 5, 3, 1];

export function pointsForRank(rank) {
  if (!Number.isFinite(rank) || rank < 1) return 0;
  return LEAGUE_POINTS[rank - 1] || 0;
}

/** מיקומי ערב אחד: שוויון בנטו = אותו מיקום ואותן נקודות. */
export function nightPlacements(session, aliases) {
  const totals = {};
  for (const e of session?.entries || []) {
    const nm = canon(e.name, aliases || {});
    totals[nm] = r2((totals[nm] || 0) + (+e.amount || 0));
  }
  const rows = Object.entries(totals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "he"));
  let rank = 0;
  let prev = null;
  return rows.map((row, i) => {
    if (prev === null || row.amount !== prev) {
      rank = i + 1;
      prev = row.amount;
    }
    return { ...row, rank, points: pointsForRank(rank) };
  });
}

/**
 * טבלת ליגה לשנה (עונה). מסתמך על ערבים בלבד (סיכום שנתי רשמי לא משפיע).
 * @returns {null | { year: number, nights: number, rows: Array<{
 *   name: string, points: number, nights: number, wins: number,
 *   podiums: number, bestRank: number, net: number,
 * }> }}
 */
export function computeLeague(db, year) {
  if (!db) return null;
  const yy = yearNum(year);
  if (yy == null) return null;
  const A = AL(db);
  const sessions = (db.sessions || []).filter((s) => yearNum(s.y) === yy);
  if (!sessions.length) return null;

  const byName = {};
  for (const s of sessions) {
    for (const p of nightPlacements(s, A)) {
      const cur = (byName[p.name] = byName[p.name] || {
        name: p.name,
        points: 0,
        nights: 0,
        wins: 0,
        podiums: 0,
        bestRank: null,
        net: 0,
      });
      cur.points += p.points;
      cur.nights += 1;
      if (p.rank === 1) cur.wins += 1;
      if (p.rank <= 3) cur.podiums += 1;
      if (cur.bestRank === null || p.rank < cur.bestRank) cur.bestRank = p.rank;
      cur.net = r2(cur.net + p.amount);
    }
  }

  const rows = Object.values(byName).sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      b.net - a.net ||
      a.name.localeCompare(b.name, "he")
  );
  return { year: yy, nights: sessions.length, rows };
}
