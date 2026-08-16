/* שבירת שיאים בסוף ערב — חולץ מ-PokerApp.jsx. */
import { AL, canon, r2 } from "./helpers.js";
import { fmt } from "./format.js";
import { allTimeTotals } from "./totals.js";
import { bestChipCashout, sessionHasChips, entryChips } from "./chipRecords.js";

export function brokenRecords(db, rec) {
  const A = AL(db);
  const old = [...db.sessions].sort((a, b) => a.iso.localeCompare(b.iso));
  if (old.length < 5) return []; // אין טעם ב"שיא" מול היסטוריה של כלום

  const nightOf = s => {
    const t = {};
    for (const e of s.entries) {
      const nm = canon(e.name, A);
      t[nm] = r2((t[nm] || 0) + e.amount);
    }
    return t;
  };

  let bestOld = null, worstOld = null, stormyOld = 0;
  const hist = {};
  for (const s of old) {
    let moved = 0;
    for (const [nm, amount] of Object.entries(nightOf(s))) {
      (hist[nm] = hist[nm] || []).push(amount);
      if (amount > 0) moved = r2(moved + amount);
      if (!bestOld || amount > bestOld.amount) bestOld = { name: nm, amount };
      if (!worstOld || amount < worstOld.amount) worstOld = { name: nm, amount };
    }
    if (moved > stormyOld) stormyOld = moved;
  }

  let streakOld = null;
  for (const [nm, arr] of Object.entries(hist)) {
    let cur = 0, max = 0;
    for (const v of arr) {
      cur = v > 0 ? cur + 1 : 0;
      if (cur > max) max = cur;
    }
    if (!streakOld || max > streakOld.count) streakOld = { name: nm, count: max };
  }

  const lines = [];
  const tNew = nightOf(rec);
  let movedNew = 0;
  for (const [nm, amount] of Object.entries(tNew)) {
    if (amount > 0) movedNew = r2(movedNew + amount);
    if (bestOld && amount > bestOld.amount) {
      lines.push(`🔥 ${nm} שבר את ערב השיא בהיסטוריה: ${fmt(amount)} (הקודם: ${bestOld.name} · ${fmt(bestOld.amount)})`);
    }
    if (worstOld && amount < worstOld.amount) {
      lines.push(`🥶 ${nm} קבע את הערב הקשה בהיסטוריה: ${fmt(amount)} (הקודם: ${worstOld.name} · ${fmt(worstOld.amount)})`);
    }
  }
  if (stormyOld > 0 && movedNew > stormyOld) {
    lines.push(`💸 הערב הסוער בהיסטוריה: ${movedNew}₪ החליפו ידיים (השיא הקודם: ${stormyOld}₪)`);
  }
  if (streakOld && streakOld.count >= 2) {
    for (const [nm, amount] of Object.entries(tNew)) {
      if (amount <= 0) continue;
      const arr = hist[nm] || [];
      let tail = 0;
      for (let i = arr.length - 1; i >= 0 && arr[i] > 0; i--) tail++;
      if (tail + 1 > streakOld.count) {
        lines.push(`⚡ ${nm} עם רצף הניצחונות הארוך אי פעם: ${tail + 1} ערבים ברצף (הקודם: ${streakOld.name} · ${streakOld.count})`);
      }
    }
  }

  // חילופי שלטון — מישהו עקף את מלך כל הזמנים
  const before = allTimeTotals(db)[0];
  const after = allTimeTotals({ ...db, sessions: [...db.sessions, rec] })[0];
  if (before && after && after.name !== before.name) {
    lines.push(`🐐 חילופי שלטון! ${after.name} עקף את ${before.name} והוא מלך כל הזמנים עם ${fmt(after.amount)}`);
  }

  /* שיא ג'יטונים ביציאה — רק מול ערבים עם נתוני chips אמיתיים */
  if (sessionHasChips(rec)) {
    const prevHigh = bestChipCashout(old, A);
    for (const e of rec.entries) {
      const c = entryChips(e);
      if (c == null) continue;
      const nm = canon(e.name, A);
      if (!prevHigh || c > prevHigh.chips) {
        const prev = prevHigh
          ? ` (הקודם: ${prevHigh.name} · ${prevHigh.chips} ג')`
          : "";
        lines.push(`🪙 ${nm} קבע שיא ג'יטונים ביציאה: ${c} ג'${prev}`);
      }
    }
  }

  return lines;
}
