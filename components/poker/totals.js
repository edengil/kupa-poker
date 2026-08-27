/* סיכומי תקופות — חולצו מ-PokerApp.jsx לשימוש חוזר בבאנר ובטבלה. */
import { AL, canon, r2 } from "./helpers.js";

/** שנה מנורמלת (json לפעמים שומר y כמחרוזת). */
export function yearNum(y) {
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}

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
  const yy = yearNum(y);
  const yi = (db.yearly || []).find((x) => yearNum(x.y) === yy);
  if (yi)
    return {
      totals: aggregate([yi], A),
      official: !!yi.official,
    };
  return {
    totals: aggregate(
      (db.sessions || []).filter((s) => yearNum(s.y) === yy),
      A
    ),
    official: false,
  };
}

export function monthTotals(db, y, mo) {
  const yy = yearNum(y);
  const mm = Number(mo);
  return aggregate(
    (db.sessions || []).filter((s) => yearNum(s.y) === yy && Number(s.mo) === mm),
    AL(db)
  );
}

export function allTimeTotals(db) {
  const ys = new Set();
  for (const s of db.sessions || []) {
    const y = yearNum(s.y);
    if (y != null) ys.add(y);
  }
  for (const row of db.yearly || []) {
    const y = yearNum(row.y);
    if (y != null) ys.add(y);
  }
  const acc = {};
  for (const y of ys)
    for (const t of yearTotals(db, y).totals) acc[t.name] = r2((acc[t.name] || 0) + t.amount);
  return Object.entries(acc)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * פירוט נטו לשחקן: סכום ערבים מול מה שמופיע בטבלה (סיכום שנתי רשמי גובר).
 * gap = tableNet − sessionsNet — כמה צריך להוסיף/להחסיר כדי להגיע לטבלה.
 */
export function playerBalanceBreakdown(db, playerName) {
  const A = AL(db);
  const name = canon(playerName, A);
  const ys = new Set();
  for (const s of db.sessions || []) {
    const y = yearNum(s.y);
    if (y != null) ys.add(y);
  }
  for (const row of db.yearly || []) {
    const y = yearNum(row.y);
    if (y != null) ys.add(y);
  }
  const years = [...ys].sort((a, b) => a - b);
  const adjustments = [];
  let sessionsNet = 0;
  let tableNet = 0;
  for (const y of years) {
    const sessAmt =
      aggregate(
        (db.sessions || []).filter((s) => yearNum(s.y) === y),
        A
      ).find((t) => t.name === name)?.amount || 0;
    const yt = yearTotals(db, y);
    const tableAmt = yt.totals.find((t) => t.name === name)?.amount || 0;
    if (Math.abs(sessAmt) < 0.005 && Math.abs(tableAmt) < 0.005) continue;
    sessionsNet = r2(sessionsNet + sessAmt);
    tableNet = r2(tableNet + tableAmt);
    if (yt.official) {
      adjustments.push({
        y,
        sessionsNet: sessAmt,
        tableNet: tableAmt,
        gap: r2(tableAmt - sessAmt),
      });
    }
  }
  return {
    name,
    sessionsNet,
    tableNet,
    gap: r2(tableNet - sessionsNet),
    adjustments,
  };
}

/**
 * בחירת סיכום לפי טאב תקופה: month | year | all (הכל).
 * מחזיר { totals, official, recCount }.
 */
export function periodTotals(db, scope, y, mo) {
  if (scope === "all") {
    return {
      totals: allTimeTotals(db),
      official: false,
      recCount: (db.sessions || []).length,
    };
  }
  if (scope === "year") {
    const r = yearTotals(db, y);
    const yy = yearNum(y);
    return {
      ...r,
      recCount: (db.sessions || []).filter((s) => yearNum(s.y) === yy).length,
    };
  }
  const yy = yearNum(y);
  const mm = Number(mo);
  return {
    totals: monthTotals(db, y, mo),
    official: false,
    recCount: (db.sessions || []).filter((s) => yearNum(s.y) === yy && Number(s.mo) === mm).length,
  };
}
