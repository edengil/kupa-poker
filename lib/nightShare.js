/* ============================================================================
   עזרי שיתוף / חלוקה לערב שמור — מחושבים תמיד מחדש (לא נשמרים ב־DB).
   משותפים לטאב ערבים, טאב טבלה, לייב, ובוט הוואטסאפ.
   ============================================================================ */

import { CPS, buildSettlement, netOf } from "./report";
import { settle, isCashOnly, transferVerb, isFemaleName } from "./settlement";
import { toWhatsApp } from "../components/poker/helpers.js";
import {
  tipRankPlaces,
  formatFirstPlaceLine,
  formatLowestTipperLine,
  formatNonTipperLine,
} from "./tipSummaryCopy.js";

/** האם לרשומות יש buyin/chips (לייב) או רק נטו (הזנה ידנית). */
export function sessionHasBuyinChips(session) {
  const entries = session?.entries || [];
  return entries.some((e) => e.buyin != null || e.chips != null);
}

/**
 * שחקנים ל־settle מתוך ערב שמור.
 * אם יש buyin/chips — משתמשים בהם; אחרת נטו כמו InputTab (cps=1 אצל הקורא).
 */
export function playersFromSession(session) {
  const entries = session?.entries || [];
  if (!entries.length) return [];

  if (sessionHasBuyinChips(session)) {
    return entries.map((e) => {
      if (e.buyin != null || e.chips != null) {
        return {
          name: e.name,
          buyin: +e.buyin || 0,
          cashout: String(e.chips != null ? +e.chips || 0 : Math.max(0, +e.amount || 0)),
          tipsGiven: +e.tipsGiven || 0,
        };
      }
      /* רשומה מעורבת בלי פירוט — כמו נטו */
      return {
        name: e.name,
        buyin: e.amount < 0 ? -e.amount : 0,
        cashout: String(Math.max(0, e.amount)),
        tipsGiven: +e.tipsGiven || 0,
      };
    });
  }

  return entries.map((e) => ({
    name: e.name,
    buyin: e.amount < 0 ? -e.amount : 0,
    cashout: String(Math.max(0, e.amount)),
    tipsGiven: +e.tipsGiven || 0,
  }));
}

/**
 * טקסט חלוקה (מי מעביר למי) — אותו פורמט כמו ShareSheet «חלוקה».
 * @returns {string} ריק אם אין שחקנים / לא ניתן לחשב
 */
export function settlementTextForSession(session, opts = {}) {
  const players = playersFromSession(session);
  if (!players.length) return "";

  const cps = opts.cps ?? (sessionHasBuyinChips(session) ? CPS : 1);
  const result = settle(players, cps);
  return buildSettlement(result, {
    now: opts.now ?? session?.endedAt ?? Date.now(),
    isCashOnly,
    transferVerb,
  });
}

/**
 * סך טיפים לשחקן — מ־tips[] (יומן אירועים) וגם מ־tipsGiven על
 * entries/players. ערבים שמורים מלייב לפעמים נשארים עם tipsGiven בלבד
 * (בלי מערך tips) — חייבים לתפוס את שני המקורות.
 */
function tipTotalsByName(session, players) {
  const totals = {};
  for (const t of session?.tips || []) {
    const amt = +t.amount || 0;
    if (amt > 0) totals[t.name] = (totals[t.name] || 0) + amt;
  }
  const foldGiven = (name, raw) => {
    const n = +raw || 0;
    if (n > 0) totals[name] = Math.max(totals[name] || 0, n);
  };
  for (const e of session?.entries || []) foldGiven(e.name, e.tipsGiven);
  for (const p of players || []) foldGiven(p.name, p.tipsGiven);
  return totals;
}

/**
 * סיכום טיפים לסוף ערב — תמיד כשהיו שחקנים (גם אם אף אחד לא טיפא).
 * מקבל state לייב {players, tips} או ערב שמור {entries, tips}.
 * בלי סכומים במקומות; תיקו = אותו מקום; מחמאות/צחוקים מתחלפים.
 * מי שלא טיפא מופיע פעם אחת בלבד (שורת צחוק אחת) — בלי שורה כפולה למי שזכה.
 * @param {object} session
 * @param {{ p: { name: string }, net: number }[]} [_withNet] נשמר לתאימות קוראים ישנים
 * @param {{ now?: number }} [opts]
 */
export function tipSummaryForSession(session, _withNet, opts = {}) {
  const now = opts.now ?? Date.now();
  const entries = session?.entries || [];
  const players = session?.players?.length
    ? session.players
    : entries.map((e) => ({
        name: e.name,
        tipsGiven: +e.tipsGiven || 0,
      }));
  if (!players.length) return "";

  const totals = tipTotalsByName(session, players);
  const tippers = Object.entries(totals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "he"));
  const tipped = new Set(tippers.map((t) => t.name));
  const noTip = players.filter((p) => !tipped.has(p.name));

  const lines = ["💸 טיפים הערב"];

  if (tippers.length) {
    const ranks = tipRankPlaces(tippers);
    const onPodium = new Set(ranks.flatMap((r) => r.names));
    for (const r of ranks) {
      if (r.place === 1) {
        lines.push(formatFirstPlaceLine(r.names, isFemaleName, now));
      } else if (r.place === 2) {
        lines.push(`🥈 מקום שני בטיפים: ${r.names.join(", ")}`);
      } else if (r.place === 3) {
        lines.push(`🥉 מקום שלישי בטיפים: ${r.names.join(", ")}`);
      }
    }

    /* כבוד רק למי שטיפא ולא על הפודיום (1–3 כולל תיקו) */
    const alsoTipped = tippers.filter((t) => !onPodium.has(t.name)).map((t) => t.name);
    if (alsoTipped.length) {
      lines.push(`👏 גם נתנו טיפ: ${alsoTipped.join(", ")}`);
    }

    const minAmt = tippers[tippers.length - 1].amount;
    const lowest = tippers.filter((t) => t.amount === minAmt).map((t) => t.name);
    /* הכי מעט רק אם יש גם מישהו ששם יותר — אחרת כולם תיקו במקום 1 */
    if (tippers.some((t) => t.amount > minAmt)) {
      lines.push(formatLowestTipperLine(lowest, isFemaleName));
    }
  } else {
    lines.push("אף אחד לא שם טיפ הערב… 🙈");
  }

  if (noTip.length) {
    const names = noTip.map((p) => p.name);
    lines.push(formatNonTipperLine(names, isFemaleName, now));
  }

  return lines.join("\n");
}

/** סיכום נטו לוואטסאפ + בלוק טיפים — לשיתוף מטאב ערבים / לייב. */
export function nightSummaryText(session, aliases) {
  const entries = Array.isArray(session?.entries)
    ? session.entries
    : (session?.players || []).map((p) => ({
        name: p.name,
        amount: netOf(p, session?.cps || CPS),
      }));
  if (!entries.length) return "";
  const base = toWhatsApp(entries, session, null, aliases || null);
  const tips = tipSummaryForSession(session);
  /* בלוק טיפים תמיד כשיש שחקנים — גם כשסך הטיפים 0 */
  return tips ? `${base}\n\n${tips}` : base;
}
