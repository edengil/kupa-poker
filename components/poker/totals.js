/* סיכומי תקופות — חולצו מ-PokerApp.jsx לשימוש חוזר בבאנר ובטבלה. */
import { AL, canon, r2 } from "./helpers.js";

export function aggregate(recs, aliases) {
  const acc = {};
  for (const r of recs)
    for (const e of r.entries) {
      const n = canon(e.name, aliases);
      acc[n] = r2((acc[n] || 0) + e.amount);
    }
  return Object.entries(acc)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** כלל סמכותי: מאזן שנתי רשמי גובר על סכום הערבים. */
export function yearTotals(db, y) {
  const A = AL(db);
  const yi = db.yearly.find((x) => x.y === y);
  if (yi)
    return {
      totals: aggregate([yi], A),
      official: !!yi.official,
    };
  return {
    totals: aggregate(
      db.sessions.filter((s) => s.y === y),
      A
    ),
    official: false,
  };
}

export function monthTotals(db, y, mo) {
  return aggregate(
    db.sessions.filter((s) => s.y === y && s.mo === mo),
    AL(db)
  );
}

export function allTimeTotals(db) {
  const ys = new Set([...db.sessions.map((s) => s.y), ...db.yearly.map((y) => y.y)]);
  const acc = {};
  for (const y of ys)
    for (const t of yearTotals(db, y).totals) acc[t.name] = r2((acc[t.name] || 0) + t.amount);
  return Object.entries(acc)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}
