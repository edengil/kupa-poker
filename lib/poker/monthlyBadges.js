/* תגי שיא חודשיים — חישוב טהור מההיסטוריה.
   לכל חודש שהסתיים, מחזיק כל שיא חודשי מקבל תג קבוע בפרופיל,
   עם שם החודש והשנה בתווית (למשל "מלך הטיפים · ינואר 2026").
   החודש הנוכחי לא מקבל תגים — השיאים שלו עוד יכולים להתהפך.
   התגים המצטברים של כל הזמנים חיים ב־badges.js ולא משתנים כאן. */

import { AL, canon, r2 } from "./helpers.js";
import { MONTHS } from "./format.js";
import { yearNum } from "./totals.js";
import { sessionTips } from "./tipRecords.js";

export const MONTHLY_BADGE_KINDS = [
  { kind: "monthKing", icon: "👑", base: "מלך החודש", desc: "הנטו הגבוה של החודש" },
  { kind: "tipKing", icon: "🏅", base: "מלך הטיפים", desc: "הכי הרבה ג'יטוני טיפ בחודש" },
  { kind: "mostNights", icon: "🎯", base: "הכי הרבה ערבים", desc: "הכי הרבה ערבי משחק בחודש" },
  { kind: "bestNight", icon: "🔥", base: "ערב השיא של החודש", desc: "הנטו הגבוה בערב אחד באותו חודש" },
];

const KIND_ORDER = Object.fromEntries(MONTHLY_BADGE_KINDS.map((d, i) => [d.kind, i]));
const DEF_BY_KIND = Object.fromEntries(MONTHLY_BADGE_KINDS.map((d) => [d.kind, d]));

const pad2 = (n) => String(n).padStart(2, "0");

/* מיון דטרמיניסטי: הערך יורד, ובשוויון — שם עולה (כמו מיוני הקצה בשיאים הקיימים). */
const byValueThenName = (key) => (a, b) =>
  b[key] - a[key] || a.name.localeCompare(b.name, "he");

function makeBadge(kind, y, mo, at, value, detail) {
  const def = DEF_BY_KIND[kind];
  return {
    id: `${kind}:${y}-${pad2(mo)}`,
    kind,
    icon: def.icon,
    base: def.base,
    label: `${def.base} · ${MONTHS[mo - 1]} ${y}`,
    desc: def.desc,
    detail,
    value,
    y,
    mo,
    at, // סוף החודש הזוכה (ISO)
  };
}

/**
 * @returns {null | { perPlayer: Object<string, Array<object>>, earnedCount: number,
 *                     months: Array<{ y: number, mo: number, label: string }> }}
 * opts.now — להזרקה בבדיקות; רק חודשים שלפני החודש הנוכחי מקבלים תגים.
 */
export function computeMonthlyBadges(db, { now = new Date() } = {}) {
  if (!db?.sessions?.length) return null;
  const A = AL(db);
  const sessions = [...db.sessions].sort((a, b) => String(a.iso).localeCompare(String(b.iso)));

  const curY = now.getFullYear();
  const curMo = now.getMonth() + 1;

  /* קיבוץ ערבים לחודשים שהסתיימו */
  const monthMap = new Map();
  for (const s of sessions) {
    const y = yearNum(s?.y);
    const mo = Number(s?.mo);
    if (y == null || !Number.isFinite(mo) || mo < 1 || mo > 12) continue;
    if (y > curY || (y === curY && mo >= curMo)) continue; // החודש הנוכחי עוד פתוח
    const key = `${y}-${mo}`;
    if (!monthMap.has(key)) monthMap.set(key, { y, mo, sessions: [] });
    monthMap.get(key).sessions.push(s);
  }
  if (!monthMap.size) return { perPlayer: {}, earnedCount: 0, months: [] };

  const perPlayer = {};
  let earnedCount = 0;
  const award = (name, badge) => {
    (perPlayer[name] = perPlayer[name] || []).push(badge);
    earnedCount += 1;
  };

  const monthsAsc = [...monthMap.values()].sort((a, b) => a.y - b.y || a.mo - b.mo);
  for (const { y, mo, sessions: monthSessions } of monthsAsc) {
    const lastDay = new Date(y, mo, 0).getDate();
    const at = `${y}-${pad2(mo)}-${pad2(lastDay)}`;

    const totals = {};
    const nightsCount = {};
    const tipChips = {};
    let bestSingle = null; // { name, amount } — ערב השיא של החודש

    for (const s of monthSessions) {
      const perNight = {};
      for (const e of s.entries || []) {
        const nm = canon(e.name, A);
        perNight[nm] = r2((perNight[nm] || 0) + (+e.amount || 0));
      }
      for (const [nm, amt] of Object.entries(perNight)) {
        totals[nm] = r2((totals[nm] || 0) + amt);
        nightsCount[nm] = (nightsCount[nm] || 0) + 1;
        /* שוויון בערב־שיא: הערב המוקדם נשאר (הערבים ממוינים כרונולוגית) */
        if (!bestSingle || amt > bestSingle.amount) bestSingle = { name: nm, amount: amt };
      }
      for (const t of sessionTips(s)) {
        const amt = +t.amount || 0;
        if (amt <= 0) continue;
        const nm = canon(t.name, A);
        tipChips[nm] = r2((tipChips[nm] || 0) + amt);
      }
    }

    const kingRow = Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort(byValueThenName("value"))[0];
    if (kingRow && kingRow.value > 0) {
      award(
        kingRow.name,
        makeBadge("monthKing", y, mo, at, kingRow.value, `נטו ${kingRow.value}₪ בחודש`)
      );
    }

    const tipRow = Object.entries(tipChips)
      .map(([name, value]) => ({ name, value }))
      .sort(byValueThenName("value"))[0];
    if (tipRow && tipRow.value > 0) {
      award(
        tipRow.name,
        makeBadge("tipKing", y, mo, at, tipRow.value, `${tipRow.value} ג'יטוני טיפ בחודש`)
      );
    }

    const nightsRow = Object.entries(nightsCount)
      .map(([name, value]) => ({ name, value }))
      .sort(byValueThenName("value"))[0];
    if (nightsRow && nightsRow.value > 0) {
      award(
        nightsRow.name,
        makeBadge("mostNights", y, mo, at, nightsRow.value, `${nightsRow.value} ערבים בחודש`)
      );
    }

    if (bestSingle && bestSingle.amount > 0) {
      award(
        bestSingle.name,
        makeBadge("bestNight", y, mo, at, bestSingle.amount, `ערב של ${bestSingle.amount}₪`)
      );
    }
  }

  /* הצגה: החודש החדש קודם, ובתוך חודש לפי סדר הקטגוריות */
  for (const list of Object.values(perPlayer)) {
    list.sort(
      (a, b) => b.y - a.y || b.mo - a.mo || (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
    );
  }

  const months = monthsAsc
    .map(({ y, mo }) => ({ y, mo, label: `${MONTHS[mo - 1]} ${y}` }))
    .sort((a, b) => b.y - a.y || b.mo - a.mo);

  return { perPlayer, earnedCount, months };
}

/** תגי שיא חודשיים של שחקן אחד (מערך ריק אם אין). */
export function monthlyBadgesForPlayer(db, playerName, opts = {}) {
  if (!db || !playerName) return [];
  const name = canon(playerName, AL(db));
  const all = computeMonthlyBadges(db, opts);
  return all?.perPlayer[name] || [];
}
