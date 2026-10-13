/* ============================================================================
   עזרי שיתוף / חלוקה לערב שמור — מחושבים תמיד מחדש (לא נשמרים ב־DB).
   משותפים לטאב ערבים, טאב טבלה, לייב, ובוט הוואטסאפ.
   ============================================================================ */

import { CPS, buildSettlement, netOf, nightDateParts } from "./report";
import { settle, isCashOnly, transferVerb, isFemaleName } from "./settlement";
import { toWhatsApp, canon, DEFAULT_ALIASES } from "./poker/helpers.js";
import {
  tipRankPlaces,
  formatFirstPlaceLine,
  formatLowestTipperLine,
  formatNonTipperLine,
} from "./tipSummaryCopy.js";
import { withBotMark } from "./botMark";
import { savedSettlement } from "./savedSettlement";

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

const EDEN_CANON = "עדן גיל";

/**
 * הקופה הצדדית (חיסכון 5% מהג'יטונים) התחילה בערב 10.10.2026 — רק מערב
 * זה ואילך. בערבים קודמים אין קופה: עודף ברישום מתחלק כרגיל בין החייבים,
 * כמו שהיה בפועל כשאותם ערבים נסגרו (תיקון מעדן, 2026-10-13).
 */
export const POT_START_ISO = "2026-10-10";

export function sessionHasPot(session) {
  const iso = String(session?.iso || "");
  return iso !== "" && iso >= POT_START_ISO;
}

/**
 * שחקנים לחישוב ההעברות — העודף (כסף תלוי באוויר: חייבים > מגיע) מגולם בנטו
 * של עדן גיל: מפחית את חובו או מגדיל את זכייתו (כלל קבוע מעדן, 2026-10-11).
 * ההפסד/רווח הגולמי נשמר ב-entries לסטטיסטיקה; ההתאמה חלה רק על החישוב.
 * חל רק על ערבי קופה (sessionHasPot) — ערבים קודמים בלי שינוי.
 */
export function playersWithPot(session) {
  const players = playersFromSession(session);
  if (!sessionHasPot(session)) return players;
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const total = players.reduce((s, p) => s + netOf(p, cps), 0);
  const surplus = Math.max(0, -total);
  if (!(surplus > 0)) return players;
  const idx = players.findIndex((p) => canon(p.name, DEFAULT_ALIASES) === EDEN_CANON);
  if (idx < 0) return players; // עדן לא בערב — הוולידטור ב-paymentPlan יתריע
  const p = players[idx];
  const newNet = netOf(p, cps) + surplus;
  const adjusted = { ...p };
  if (newNet >= 0) {
    adjusted.buyin = 0;
    adjusted.cashout = String(newNet * cps);
  } else {
    adjusted.buyin = -newNet;
    adjusted.cashout = "0";
  }
  const out = players.slice();
  out[idx] = adjusted;
  return out;
}

/**
 * הקופה המחושבת לערב (כסף תלוי באוויר, בשקלים שלמים) — זה הסכום שיורד
 * בפועל מהתשלום של עדן גיל בחלוקה. נגזר מהיתרות, לא מהשדה המתועד.
 * ערבים שלפני תחילת הקופה (10.10.2026) — תמיד 0.
 */
export function computedPot(session) {
  if (!sessionHasPot(session)) return 0;
  const players = playersFromSession(session);
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const total = players.reduce((s, p) => s + netOf(p, cps), 0);
  return Math.max(0, Math.round(-total));
}

/**
 * טקסט חלוקה (מי מעביר למי) — אותו פורמט כמו ShareSheet «חלוקה».
 * @returns {string} ריק אם אין שחקנים / לא ניתן לחשב
 */
export function settlementTextForSession(session, opts = {}) {
  const players = playersWithPot(session);
  if (!players.length) return "";

  const cps = opts.cps ?? (sessionHasBuyinChips(session) ? (session.cps || CPS) : 1);
  const result = session.manualSettlement
    ? savedSettlement(players, cps, session.manualSettlement)
    : settle(players, cps);
  const text = buildSettlement(result, {
    now: opts.now ?? session?.endedAt ?? (session?.iso ? new Date(`${session.iso}T12:00:00`).getTime() : Date.now()),
    isCashOnly,
    transferVerb,
  });
  return withBotMark(text);
}

/**
 * סך טיפים לשחקן — מ־tips[] (יומן אירועים) וגם מ־tipsGiven על
 * entries/players. ערבים שמורים מלייב לפעמים נשארים עם tipsGiven בלבד
 * (בלי מערך tips) — חייבים לתפוס את שני המקורות.
 */
export function tipTotalsByName(session, players) {
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
    /* שורה ריקה לפני «בלי טיפ» — שבירת שורה בוואטסאפ */
    lines.push("");
    lines.push(formatNonTipperLine(names, isFemaleName, now));
  }

  /* BOT_MARK — שליחה לקבוצה (ShareSheet / settleSummary) בלי לולאת אקו */
  return withBotMark(lines.join("\n"));
}

/**
 * ערב שמור מתוך מצב לייב — אותו מבנה שהאפליקציה שומרת בסיום ערב,
 * כדי שהבוט יבנה את אותו סיכום כמו גיליון השיתוף.
 */
export function sessionFromLive(state, { cps = CPS, now = Date.now() } = {}) {
  const players = (state?.players || []).filter((p) => p.cashout !== "" && p.cashout != null);
  const startedAt = state?.startedAt || null;
  const { d, mo, y, iso } = nightDateParts(startedAt, now);
  const tips = (state?.tips || []).map(({ name, amount, at }) => ({ name, amount, at }));
  return {
    iso,
    d,
    mo,
    y,
    cps,
    startedAt,
    endedAt: now,
    entries: players.map((p) => ({
      name: p.name,
      amount: netOf(p, cps),
      chips: +p.cashout || 0,
      buyin: +p.buyin || 0,
      tipsGiven: +p.tipsGiven || 0,
    })),
    ...(tips.length ? { tips } : {}),
  };
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
  /* המחמאות מתחלפות לפי דקה — מעוגנים לסוף הערב, כדי שמה שנשלח זהה לתצוגה המקדימה */
  const tips = tipSummaryForSession(session, undefined, { now: session?.endedAt ?? Date.now() });
  /* בלוק טיפים תמיד כשיש שחקנים — גם כשסך הטיפים 0.
     withBotMark על כל ההודעה (טיפים כבר מסומנים — בלי כפילות בתחילה). */
  return withBotMark(tips ? `${base}\n\n${tips}` : base);
}
