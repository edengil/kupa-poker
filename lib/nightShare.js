/* ============================================================================
   עזרי שיתוף / חלוקה לערב שמור — מחושבים תמיד מחדש (לא נשמרים ב־DB).
   משותפים לטאב ערבים, טאב טבלה, לייב, ובוט הוואטסאפ.
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
/* קוראי־הקופה הטהורים חיים ב־lib/potReaders.js (גל B, מנה 5.1 — מיצוי־בלבד).
   מיוצאים הלאה, כך שאף יבואן לא השתנה. מאז מנה 5.6 אין כאן שימוש פנימי
   בהם — הצרכן האחרון (ה־resolver) עבר ל־lib/nightResolve.js. */
export { sessionHasBuyinChips, sessionHasPot, potRecordedFor, potActualFor, potPlanFor, computedPot } from "./potReaders";
/* בניית שחקני הערב חיה ב־lib/nightPlayers.js (גל B, מנה 5.2 — מיצוי־בלבד).
   מיוצאים הלאה, כך שאף יבואן לא השתנה. EDEN_CANON נשאר ב־nightPlayers
   בלבד — הצרכן האחרון שלו כאן (settleWithPot) עבר ל־lib/nightSettle.js
   במנה 5.5, וה־resolver שצרך את השאר עבר ל־lib/nightResolve.js במנה 5.6. */
export { playersFromSession, playersWithPot, edenNameIn } from "./nightPlayers";
/* סימוני תשלום ותוכנית שמורה חיים ב־lib/nightPlan.js (גל B, מנה 5.3 —
   מיצוי־בלבד). מיוצאים הלאה, כך שאף יבואן לא השתנה. הצרכן הפנימי האחרון
   שלהם כאן (settlementTextForSession) עבר ל־lib/nightResolve.js במנה 5.6. */
export { hasPaymentMarks, storedPlanTransfersList, autoShortfallMapForPot, freezeShortfallMapFor } from "./nightPlan";
/* פער הערב חי ב־lib/nightGap.js (גל B, מנה 5.4 — מיצוי־בלבד).
   מיוצא הלאה, כך שאף יבואן לא השתנה. אין שימוש פנימי בו במודול זה. */
export { nightGap } from "./nightGap";
/* מנוע החלוקה חי ב־lib/nightSettle.js (גל B, מנה 5.5 — מיצוי־בלבד).
   מיוצא הלאה, כך שאף יבואן לא השתנה — כולל lib/savedSettlement.js.
   בלוק תיעוד מודל־הקופה עבר עם המנוע, כי הוא מתעד אותו. הצרכן הפנימי
   האחרון שלו כאן (resolveSettlement) עבר ל־lib/nightResolve.js במנה 5.6. */
export { settleWithPot } from "./nightSettle";
/* פתרון וטקסט חלוקה חיים ב־lib/nightResolve.js (גל B, מנה 5.6 —
   מיצוי־בלבד). מיוצאים הלאה, כך שאף יבואן לא השתנה. הצהרת מעגליות:
   המעגל nightPlan↔nightShare ממנה 5.3 עבר במנה זו ל־nightPlan↔nightResolve
   (settlementTextForSession צורך את סימוני/תוכנית nightPlan;
   freezeShortfallMapFor של nightPlan צורך את ה־resolver מכאן ישירות) —
   כל הקשירות החוצות הן הכרזות פונקציה הנקראות בזמן קריאה בלבד, בלי שום
   הפעלה ברמת־המודול. */
export { settlementPlayersFor, isLegacySettlement, resolveSettlement, settlementTextForSession } from "./nightResolve";

/** שמות הכיורים הפנימיים — מוגדרים ב־manualSettlement ומיוצאים כאן הלאה. */
export { POT_SINK_NAME, RESIDUAL_SINK_NAME } from "./manualSettlement";

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
