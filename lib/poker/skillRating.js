/* דירוג מיומנות (ELO) — חישוב טהור.
   כל ערב הוא טורניר קטן: כל זוג שחקנים מתמודד לפי הנטו של אותו ערב
   (ניצחון / הפסד / תיקו). הדירוג מתעדכן כרונולוגית, כולם מתחילים
   ב־1000, ו־K=32. כדי לא לקפוץ בפראות בערבים מרובי שחקנים, העדכון
   של שחקן הוא K כפול ממוצע תוצאות הזוגות שלו באותו ערב — כך ערב
   אחד שווה בערך למשחק אחד, והדירוג נשאר אפס־סכום בזוגות.
   לדירוג הרשמי נכנסים רק אחרי 5 ערבים. */

import { AL, canon, r2 } from "./helpers.js";

export const SKILL_START = 1000;
export const SKILL_K = 32;
export const SKILL_MIN_NIGHTS = 5;

const expected = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

/**
 * @returns {{
 *   rows: Array<{ name, rating, nights, wins, losses, draws, ranked }>,
 *   ranked: Array<object>, tableSize: number
 * }} rows ממוין לפי דירוג; ranked רק שחקנים עם 5+ ערבים.
 */
export function computeSkillRatings(db) {
  const A = AL(db || {});
  const sessions = [...(db?.sessions || [])]
    .filter((s) => s?.iso && Array.isArray(s.entries))
    .sort((a, b) => a.iso.localeCompare(b.iso));

  const players = new Map();
  const get = (name) => {
    if (!players.has(name)) {
      players.set(name, {
        name,
        rating: SKILL_START,
        nights: 0,
        wins: 0,
        losses: 0,
        draws: 0,
      });
    }
    return players.get(name);
  };

  for (const s of sessions) {
    const nets = new Map();
    for (const e of s.entries || []) {
      const nm = canon(String(e?.name || "").trim(), A);
      if (nm) nets.set(nm, r2((nets.get(nm) || 0) + (Number(e.amount) || 0)));
    }
    const names = [...nets.keys()];
    if (names.length < 2) continue;
    for (const n of names) get(n).nights += 1;

    // כל ההשוואות מחושבות מול צילום הדירוגים של תחילת הערב
    const before = new Map(names.map((n) => [n, get(n).rating]));
    const deltas = new Map(names.map((n) => [n, 0]));
    const pairCounts = new Map(names.map((n) => [n, 0]));

    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i];
        const b = names[j];
        const na = nets.get(a);
        const nb = nets.get(b);
        const sa = na > nb ? 1 : na < nb ? 0 : 0.5;
        const sb = 1 - sa;
        deltas.set(a, deltas.get(a) + (sa - expected(before.get(a), before.get(b))));
        deltas.set(b, deltas.get(b) + (sb - expected(before.get(b), before.get(a))));
        pairCounts.set(a, pairCounts.get(a) + 1);
        pairCounts.set(b, pairCounts.get(b) + 1);
        const ra = get(a);
        const rb = get(b);
        if (sa === 1) {
          ra.wins += 1;
          rb.losses += 1;
        } else if (sa === 0) {
          ra.losses += 1;
          rb.wins += 1;
        } else {
          ra.draws += 1;
          rb.draws += 1;
        }
      }
    }

    for (const n of names) {
      const rec = get(n);
      const count = pairCounts.get(n) || 1;
      rec.rating = r2(rec.rating + (SKILL_K * deltas.get(n)) / count);
    }
  }

  const rows = [...players.values()]
    .map((r) => ({ ...r, ranked: r.nights >= SKILL_MIN_NIGHTS }))
    .sort((a, b) => b.rating - a.rating || b.nights - a.nights || a.name.localeCompare(b.name, "he"));

  // מקום בדירוג הרשמי — רק למדורגים, לפי הסדר הכללי
  const ranked = rows.filter((r) => r.ranked);
  ranked.forEach((r, i) => {
    r.rank = i + 1;
  });

  return { rows, ranked, tableSize: ranked.length };
}

/** שורת דירוג לשחקן אחד (לפרופיל) — או null כשאין לו אף ערב. */
export function skillRatingFor(db, name) {
  const A = AL(db || {});
  const cn = canon(String(name || "").trim(), A);
  if (!cn) return null;
  const { rows, tableSize } = computeSkillRatings(db);
  const row = rows.find((r) => r.name === cn);
  return row ? { ...row, tableSize } : null;
}
