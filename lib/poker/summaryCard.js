/* נתוני כרטיס הסיכום המעוצב (חודשי / שנתי) — חישוב טהור.
   הרינדור עצמו (SVG → PNG) חי ברכיב; כאן רק מחליטים מה יופיע בכרטיס,
   כדי שהלוגיקה תהיה ניתנת לבדיקה. */

import { AL, canon, r2 } from "./helpers.js";
import { computePeriodRecords } from "./computeRecords.js";
import { periodTotals, yearNum } from "./totals.js";

const dateLabel = (r) => (r ? `${r.d}.${r.mo}.${String(r.y).slice(2)}` : "");

/**
 * @param {object} db
 * @param {{ kind: "month"|"quarter"|"half"|"year", y: number, mo?: number, q?: number, h?: number }} scope
 * @returns {null | {
 *   kind, y, mo, label, title, nights, players, totalMoved,
 *   king: { name, amount } | null,
 *   podium: Array<{ name, amount }>,
 *   standings: Array<{ name, amount }>,
 *   bestNight: { name, amount, date } | null,
 *   stormyNight: { moved, date } | null,
 *   mostNights: { name, nights } | null,
 * }}
 */
export function summaryCardData(db, scope) {
  const period = computePeriodRecords(db, scope);
  if (!period) return null;
  const { recs } = period;

  const totals = (
    period.kind === "quarter" ? periodTotals(db, "quarter", period.y, null, period.q)
    : period.kind === "half" ? periodTotals(db, "half", period.y, null, period.h)
    : periodTotals(db, period.kind, period.y, period.mo)
  ).totals || [];
  // דירוג מלא של כל השחקנים — הכרטיס מציג את כולם, לא רק פודיום
  const standings = [...totals]
    .sort((a, b) => b.amount - a.amount)
    .map((t) => ({ name: t.name, amount: r2(t.amount) }));
  const podium = standings.slice(0, 3);

  // סך הכסף שזז בתקופה + שיא הנוכחות — מהערבים שבתוך התקופה בלבד
  const A = AL(db || {});
  let totalMoved = 0;
  const attendance = new Map();
  const inCardPeriod = (s) => {
    if (yearNum(s?.y) !== period.y) return false;
    const smo = Number(s?.mo);
    if (period.kind === "month") return smo === period.mo;
    if (period.kind === "quarter") return smo >= (period.q - 1) * 3 + 1 && smo <= period.q * 3;
    if (period.kind === "half") return period.h === 1 ? smo >= 1 && smo <= 6 : smo >= 7 && smo <= 12;
    return true;
  };
  for (const s of db?.sessions || []) {
    if (!inCardPeriod(s)) continue;
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
    q: period.q,
    h: period.h,
    label: period.label,
    title:
      period.kind === "month" ? `סיכום חודש ${period.label}`
      : period.kind === "quarter" ? `סיכום ${period.label}`
      : period.kind === "half" ? `סיכום ${period.label}`
      : `סיכום שנת ${period.y}`,
    nights: period.nights,
    players: totals.length,
    totalMoved,
    king: podium[0] || null,
    podium,
    standings,
    bestNight: recs.bestNight
      ? { name: recs.bestNight.name, amount: recs.bestNight.amount, date: dateLabel(recs.bestNight) }
      : null,
    stormyNight: recs.stormyNight
      ? { moved: recs.stormyNight.moved, date: dateLabel(recs.stormyNight) }
      : null,
    mostNights: most ? { name: most[0], nights: most[1] } : null,
  };
}
