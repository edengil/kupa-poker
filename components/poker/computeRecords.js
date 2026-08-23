/* חישוב שיאים משותף — RecordsTab + השיאים האישיים.
   מחזיר את אותו מבנה שהיה ב-useMemo של RecordsTab. */

import { AL, canon, r2 } from "./helpers.js";
import { MONTHS } from "./format.js";
import { yearTotals, monthTotals, allTimeTotals } from "./totals.js";
import { brokenRecords } from "./brokenRecords.js";
import { computeChipRecords } from "./chipRecords.js";
import { computeTipRecords } from "./tipRecords.js";
import { computeCoupleFillRecords } from "./coupleFills.js";
import { computeDurationRecords } from "./durationRecords.js";

/** @returns {null | object} */
export function computeRecords(db) {
  const A = AL(db);
  const sessions = [...(db.sessions || [])].sort((a, b) => a.iso.localeCompare(b.iso));
  if (!sessions.length) return null;

  const perNight = sessions.map((s) => {
    const t = {};
    for (const e of s.entries) {
      const nm = canon(e.name, A);
      t[nm] = r2((t[nm] || 0) + e.amount);
    }
    return { iso: s.iso, d: s.d, mo: s.mo, y: s.y, totals: t };
  });

  let stormyNight = null;
  const nightList = [];
  const history = {};
  const monthAgg = {};
  const attend = {};

  for (const n of perNight) {
    let moved = 0;
    const present = new Set(Object.keys(n.totals));
    for (const [nm, amount] of Object.entries(n.totals)) {
      (history[nm] = history[nm] || []).push(amount);
      nightList.push({ name: nm, amount, d: n.d, mo: n.mo, y: n.y });
      if (amount > 0) moved = r2(moved + amount);
      const mk = `${nm}|${n.y}-${n.mo}`;
      monthAgg[mk] = r2((monthAgg[mk] || 0) + amount);
      const at = (attend[nm] = attend[nm] || { cur: 0, max: 0 });
      at.cur += 1;
      if (at.cur > at.max) at.max = at.cur;
    }
    for (const nm of Object.keys(attend)) if (!present.has(nm)) attend[nm].cur = 0;
    if (!stormyNight || moved > stormyNight.moved) stormyNight = { moved, d: n.d, mo: n.mo, y: n.y };
  }

  nightList.sort((a, b) => b.amount - a.amount);
  const bestNight = nightList[0] || null;
  const bestNight2 = nightList[1] || null;
  const bestNight3 = nightList[2] || null;
  const worstNight = nightList[nightList.length - 1] || null;
  const worstNight2 = nightList[nightList.length - 2] || null;
  const worstNight3 = nightList[nightList.length - 3] || null;

  const MIN_NIGHTS = 5;
  const stats = Object.entries(history).map(([nm, arr]) => {
    let cur = 0,
      max = 0,
      lcur = 0,
      lmax = 0;
    for (const v of arr) {
      cur = v > 0 ? cur + 1 : 0;
      if (cur > max) max = cur;
      lcur = v < 0 ? lcur + 1 : 0;
      if (lcur > lmax) lmax = lcur;
    }
    let tail = 0;
    for (let i = arr.length - 1; i >= 0 && arr[i] > 0; i--) tail++;
    let comeback = null;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i - 1] < 0 && arr[i] > 0) {
        const jump = r2(arr[i] - arr[i - 1]);
        if (!comeback || jump > comeback.jump) comeback = { jump, from: arr[i - 1], to: arr[i] };
      }
    }
    const wins = arr.filter((v) => v > 0).length;
    const sum = r2(arr.reduce((s, v) => s + v, 0));
    const avg = r2(sum / arr.length);
    const sd = Math.round(Math.sqrt(arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length));
    return {
      name: nm,
      nights: arr.length,
      wins,
      sum,
      avg,
      sd,
      rate: Math.round((wins / arr.length) * 100),
      maxStreak: max,
      tail,
      lossMax: lmax,
      comeback,
      attendMax: attend[nm]?.max || 0,
    };
  });

  const top3 = (key, filter = () => true) => {
    const s = stats.filter(filter).sort((a, b) => key(b) - key(a));
    return [s[0] || null, s[1] || null, s[2] || null];
  };

  const [bestStreak, bestStreak2, bestStreak3] = top3((s) => s.maxStreak, (s) => s.maxStreak >= 2);
  const [liveStreak] = top3((s) => s.tail, (s) => s.tail >= 2);
  const [lossStreak, lossStreak2, lossStreak3] = top3((s) => s.lossMax, (s) => s.lossMax >= 3);
  const [winRate, winRate2, winRate3] = top3((s) => s.rate, (s) => s.nights >= MIN_NIGHTS);
  const [bestAvg, bestAvg2, bestAvg3] = top3((s) => s.avg, (s) => s.nights >= MIN_NIGHTS && s.avg > 0);
  const [mostWins, mostWins2, mostWins3] = top3((s) => s.wins);
  const [most, most2, most3] = top3((s) => s.nights);
  const [attendTop, attendTop2, attendTop3] = top3((s) => s.attendMax, (s) => s.attendMax >= 3);
  const [roller] = top3((s) => s.sd, (s) => s.nights >= MIN_NIGHTS);
  const comeback = stats.reduce(
    (m, s) => (s.comeback && (!m || s.comeback.jump > m.jump) ? { name: s.name, ...s.comeback } : m),
    null
  );

  let bestMonth = null;
  for (const [key, amount] of Object.entries(monthAgg)) {
    if (!bestMonth || amount > bestMonth.amount) {
      const [nm, ym] = key.split("|");
      const [yy, mm] = ym.split("-");
      bestMonth = { name: nm, amount, y: +yy, mo: +mm };
    }
  }

  const bestOfMonth = {};
  for (const [key, amount] of Object.entries(monthAgg)) {
    const [nm, ym] = key.split("|");
    if (!bestOfMonth[ym] || amount > bestOfMonth[ym].amount) bestOfMonth[ym] = { name: nm, amount };
  }
  const crownCount = {};
  for (const b of Object.values(bestOfMonth)) crownCount[b.name] = (crownCount[b.name] || 0) + 1;
  const crowns = Object.entries(crownCount).sort((a, b) => b[1] - a[1]);

  const yearsSet = new Set([...sessions.map((s) => s.y), ...(db.yearly || []).map((x) => x.y)]);
  let bestYear = null;
  for (const y of yearsSet) {
    for (const t of yearTotals(db, y).totals) {
      if (!bestYear || t.amount > bestYear.amount) bestYear = { name: t.name, amount: t.amount, y };
    }
  }

  const last = sessions[sessions.length - 1];
  const monthT = monthTotals(db, last.y, last.mo);
  const yearT = yearTotals(db, last.y).totals;
  const allT = allTimeTotals(db);

  const lastN = perNight[perNight.length - 1];
  const lastRows = Object.entries(lastN.totals).sort((a, b) => b[1] - a[1]);
  let lastBroken = [];
  try {
    lastBroken = brokenRecords({ ...db, sessions: sessions.slice(0, -1) }, last);
  } catch {
    /* ignore */
  }
  const topRow = lastRows[0] && lastRows[0][1] > 0 ? { name: lastRows[0][0], amount: lastRows[0][1] } : null;
  const prevOfTop = topRow
    ? perNight.slice(0, -1).map((n) => n.totals[topRow.name]).filter((v) => v != null)
    : [];
  const lastNight = {
    label: `${lastN.d}.${lastN.mo}.${String(lastN.y).slice(2)}`,
    count: lastRows.length,
    top: topRow,
    bottom:
      lastRows.length && lastRows[lastRows.length - 1][1] < 0
        ? { name: lastRows[lastRows.length - 1][0], amount: lastRows[lastRows.length - 1][1] }
        : null,
    moved: r2(lastRows.reduce((s, [, v]) => s + (v > 0 ? v : 0), 0)),
    personalBest: !!(topRow && prevOfTop.length >= 3 && topRow.amount > Math.max(...prevOfTop)),
    broken: lastBroken,
  };

  return {
    lastNight,
    bestNight,
    bestNight2,
    bestNight3,
    worstNight,
    worstNight2,
    worstNight3,
    bestStreak,
    bestStreak2,
    bestStreak3,
    liveStreak,
    lossStreak,
    lossStreak2,
    lossStreak3,
    winRate,
    winRate2,
    winRate3,
    bestAvg,
    bestAvg2,
    bestAvg3,
    mostWins,
    mostWins2,
    mostWins3,
    comeback,
    stormyNight,
    bestMonth,
    bestYear,
    roller,
    attendTop,
    attendTop2,
    attendTop3,
    crownKing: crowns[0] ? { name: crowns[0][0], count: crowns[0][1] } : null,
    crownKing2: crowns[1] ? { name: crowns[1][0], count: crowns[1][1] } : null,
    crownKing3: crowns[2] ? { name: crowns[2][0], count: crowns[2][1] } : null,
    monthKing: monthT[0] || null,
    monthKing2: monthT[1] || null,
    monthKing3: monthT[2] || null,
    monthLabel: `${MONTHS[last.mo - 1]} ${last.y}`,
    yearKing: yearT[0] || null,
    yearKing2: yearT[1] || null,
    yearKing3: yearT[2] || null,
    yearLabel: `${last.y}`,
    allKing: allT[0] || null,
    allKing2: allT[1] || null,
    allKing3: allT[2] || null,
    most,
    most2,
    most3,
    totalNights: sessions.length,
    chips: computeChipRecords(db),
    tips: computeTipRecords(db),
    coupleFills: computeCoupleFillRecords(db),
    duration: computeDurationRecords(db),
  };
}
