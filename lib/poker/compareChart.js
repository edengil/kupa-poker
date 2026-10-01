/* גרף השוואה בין שחקנים — חישוב טהור.
   בונה קווי רווח מצטבר של עד 4 שחקנים על ציר ערבים משותף, כדי שאפשר
   יהיה לראות מי עקף את מי ומתי. שחקן שלא שיחק בערב שומר על המצטבר. */

import { AL, canon, r2 } from "./helpers.js";

export const COMPARE_MAX = 4;

/**
 * @param {object} db
 * @param {string[]} names שמות (מנורמלים לקנוני; כפולים מתאחדים)
 * @param {{ year?: number|null }} [opts] שנה לסינון, או null לכל הזמנים
 * @returns {{
 *   nights: Array<{ iso: string, label: string }>,
 *   series: Array<{ name: string, points: number[], final: number, nightsPlayed: number }>
 * }} points[i] הוא המצטבר אחרי הערב ה־i בציר. רק שחקנים עם ערב אחד
 * לפחות בתקופה נשארים בסדרה.
 */
export function compareSeries(db, names, { year = null } = {}) {
  const A = AL(db || {});
  const wanted = [
    ...new Set(
      (names || [])
        .map((n) => canon(String(n || "").trim(), A))
        .filter(Boolean)
    ),
  ].slice(0, COMPARE_MAX);

  const sessions = [...(db?.sessions || [])]
    .filter((s) => s?.iso)
    .filter((s) => (year == null ? true : Number(s.y) === Number(year)))
    .sort((a, b) => a.iso.localeCompare(b.iso));

  const nights = sessions.map((s) => ({ iso: s.iso, label: `${s.d}.${s.mo}` }));
  const byName = new Map(
    wanted.map((n) => [n, { name: n, points: [], final: 0, nightsPlayed: 0 }])
  );

  for (const s of sessions) {
    const per = new Map();
    for (const e of s.entries || []) {
      const nm = canon(e.name, A);
      if (byName.has(nm)) {
        per.set(nm, r2((per.get(nm) || 0) + (Number(e.amount) || 0)));
      }
    }
    for (const rec of byName.values()) {
      if (per.has(rec.name)) {
        rec.final = r2(rec.final + per.get(rec.name));
        rec.nightsPlayed += 1;
      }
      rec.points.push(rec.final);
    }
  }

  return {
    nights,
    series: [...byName.values()].filter((r) => r.nightsPlayed > 0),
  };
}
