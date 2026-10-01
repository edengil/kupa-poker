/* נתוני כרטיס הסיכום המעוצב (חודשי / שנתי) — חישוב טהור.
   הרינדור עצמו (SVG → PNG) חי ברכיב; כאן רק מחליטים מה יופיע בכרטיס,
   כדי שהלוגיקה תהיה ניתנת לבדיקה. */

import { AL, canon, r2 } from "./helpers.js";
import { computePeriodRecords } from "./computeRecords.js";
import { periodTotals, yearNum } from "./totals.js";

const dateLabel = (r) => (r ? `${r.d}.${r.mo}.${String(r.y).slice(2)}` : "");

/**
 * @param {object} db
 * @param {{ kind: "month"|"year", y: number, mo?: number }} scope
 * @returns {null | {
 *   kind, y, mo, label, title, nights, players, totalMoved,
 *   king: { name, amount } | null,
 *   podium: Array<{ name, amount }>,
 *   bestNight: { name, amount, date } | null,
 *   stormyNight: { moved, date } | null,
 *   mostNights: { name, nights } | null,
 * }}
 */
export function summaryCardData(db, scope) {
  const period = computePeriodRecords(db, scope);
  if (!period) return null;
  const { recs } = period;

  const totals = periodTotals(db, period.kind, period.y, period.mo).totals || [];
  const podium = [...totals]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)
    .map((t) => ({ name: t.name, amount: r2(t.amount) }));

  // סך הכסף שזז בתקופה + שיא הנוכחות — מהערבים שבתוך התקופה בלבד
  const A = AL(db || {});
  let totalMoved = 0;
  const attendance = new Map();
  for (const s of db?.sessions || []) {
    if (yearNum(s?.y) !== period.y) continue;
    if (period.kind === "month" && Number(s?.mo) !== period.mo) continue;
    const seen = new Set();
    for (const e of s.entries || []) {
      const nm = canon(String(e?.name || "").trim(), A);
      if (!nm) continue;
      if (Number(e.amount) > 0) totalMoved = r2(totalMoved + Number(e.amount));
      if (!seen.has(nm)) {
        seen.add(nm);
        attendance.set(nm, (attendance.get(nm) || 0) + 1);
      }
    }
  }
  const most = [...attendance.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "he")
  )[0];

  return {
    kind: period.kind,
    y: period.y,
    mo: period.mo,
    label: period.label,
    title: period.kind === "month" ? `סיכום חודש ${period.label}` : `סיכום שנת ${period.y}`,
    nights: period.nights,
    players: totals.length,
    totalMoved,
    king: podium[0] || null,
    podium,
    bestNight: recs.bestNight
      ? { name: recs.bestNight.name, amount: recs.bestNight.amount, date: dateLabel(recs.bestNight) }
      : null,
    stormyNight: recs.stormyNight
      ? { moved: recs.stormyNight.moved, date: dateLabel(recs.stormyNight) }
      : null,
    mostNights: most ? { name: most[0], nights: most[1] } : null,
  };
}
