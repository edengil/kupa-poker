/* ============================================================================
   טיפים, בניית ערב שמור מלייב וסיכומי סוף־ערב — מוצו מ־lib/nightShare.js
   (גל B, מנה 5.7 — המנה האחרונה של פריט 5, מיצוי־בלבד, אפס שינוי
   התנהגות). זהו טקסט ובניית־רשומה בלבד, בלי חישוב חלוקה: סך הטיפים
   לפי שחקן (tipTotalsByName), סיכום הטיפים לסוף ערב עם המחמאות
   המתחלפות (tipSummaryForSession), בניית רשומת הערב השמור ממצב הלייב
   (sessionFromLive), בלוק פרסי סוף־הערב (nightAwardsText) וסיכום הערב
   המלא לוואטסאפ (nightSummaryText). כלל ברזל 4 חל כאן כמות שהוא: טיפ
   הוא רישום בלבד — הסכומים כאן הם לצג/סיכום בלבד, ושום פונקציה כאן
   לא מזיזה ג׳יטונים, לא משנה יציאה ולא נוגעת בחלוקה; היציאה הספורה
   היא האמת. nightShare מייצא את כל החמישה הלאה (re-export), כך שאף
   יבואן לא השתנה, ו־nightShare עצמו נשאר מעתה barrel של re-exports
   ותיעוד בלבד. כל התלויות מגיעות מהמנועים המשותפים (report,
   settlement, poker/helpers, tipSummaryCopy, botMark) — אין כאן שום
   ייבוא מ־nightShare ואין ייבוא מעגלי.
   ============================================================================ */

import { CPS, netOf, nightDateParts } from "./report";
import { isFemaleName } from "./settlement";
import { toWhatsApp } from "./poker/helpers.js";
import {
  tipRankPlaces,
  formatFirstPlaceLine,
  formatLowestTipperLine,
  formatNonTipperLine,
  formatWinnerTitleLine,
  formatLoserTitleLine,
  formatTechnicalWinLine,
  formatTouristLine,
} from "./tipSummaryCopy.js";
import { withBotMark } from "./botMark";

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
    /* ביקורת הגדרות §5.6: שדות הקופה חייבים לזרום גם מהלייב — בלעדיהם כל
       צרכן עתידי שיחשב חלוקה מה־session הזה יקבל קופה 0. */
    ...(state?.savingsPot != null ? { savingsPot: state.savingsPot } : {}),
    ...(state?.savingsPotActual != null ? { savingsPotActual: state.savingsPotActual } : {}),
    ...(state?.savings5 != null ? { savings5: state.savings5 } : {}),
    ...(state?.potDraft != null && state.potDraft !== "" && Number.isFinite(Number(state.potDraft))
      ? { savingsPot: Number(state.potDraft) }
      : {}),
  };
}

/**
 * בלוק פרסי סוף־ערב, עד 3 שורות, בסדר עדיפות: כתר לזוכה הגדול, כתר
 * עדין למפסיד הגדול, «ניצחון טכני» כשהזוכה הגדול זכה ב־10 ₪ או פחות,
 * ו«תייר הערב» לשחקן הראשון שסגר בדיוק באפס.
 * תיקו — הראשון אחרי אותו מיון כמו בסיכום עצמו (יורד לזוכים, עולה
 * למפסידים; מיון יציב שומר על סדר הרשומות). הכותרות מתחלפות לפי דקה,
 * מעוגנות לסוף הערב כמו מחמאות הטיפים. ריק כשאין אף פרס.
 * @param {{ name: string, amount: number }[]} entries
 */
export function nightAwardsText(entries, now = Date.now()) {
  const nets = (entries || []).map((e) => ({ name: e.name, amount: +e.amount || 0 }));
  const winners = nets.filter((e) => e.amount > 0).sort((a, b) => b.amount - a.amount);
  const losers = nets.filter((e) => e.amount < 0).sort((a, b) => a.amount - b.amount);
  const zeros = nets.filter((e) => e.amount === 0);
  const lines = [];
  if (winners.length) lines.push(formatWinnerTitleLine(winners[0].name, isFemaleName, now));
  if (losers.length) lines.push(formatLoserTitleLine(losers[0].name, isFemaleName, now));
  if (winners.length && winners[0].amount <= 10)
    lines.push(formatTechnicalWinLine(winners[0].name, winners[0].amount, isFemaleName, now));
  if (zeros.length) lines.push(formatTouristLine(zeros[0].name, isFemaleName, now));
  return lines.slice(0, 3).join("\n");
}

/** סיכום נטו לוואטסאפ + בלוק טיפים + כתרי סיום — לשיתוף מטאב ערבים / לייב. */
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
  const now = session?.endedAt ?? Date.now();
  const tips = tipSummaryForSession(session, undefined, { now });
  /* בלוק טיפים תמיד כשיש שחקנים — גם כשסך הטיפים 0. אחריו בלוק הפרסים
     כסיום. withBotMark על כל ההודעה (טיפים כבר מסומנים — בלי כפילות בתחילה). */
  const awards = nightAwardsText(entries, now);
  const tail = [tips, awards].filter(Boolean).join("\n\n");
  return withBotMark(tail ? `${base}\n\n${tail}` : base);
}
