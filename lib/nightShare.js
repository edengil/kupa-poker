/* ============================================================================
   עזרי שיתוף / חלוקה לערב שמור — מחושבים תמיד מחדש (לא נשמרים ב־DB).
   משותפים לטאב ערבים, טאב טבלה, לייב, ובוט הוואטסאפ.
   ============================================================================ */

import { CPS, buildSettlement, netOf, nightDateParts } from "./report";
import { settle, isCashOnly, transferVerb, isFemaleName } from "./settlement";
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
import { savedSettlement, settlementBasis } from "./savedSettlement";
import { POT_SINK_NAME } from "./manualSettlement";
/* קוראי־הקופה הטהורים חיים ב־lib/potReaders.js (גל B, מנה 5.1 — מיצוי־בלבד).
   מיובאים כאן לשימוש פנימי ומיוצאים הלאה, כך שאף יבואן לא השתנה. */
import { sessionHasBuyinChips, sessionHasPot, potPlanFor } from "./potReaders";
export { sessionHasBuyinChips, sessionHasPot, potRecordedFor, potActualFor, potPlanFor, computedPot } from "./potReaders";
/* בניית שחקני הערב חיה ב־lib/nightPlayers.js (גל B, מנה 5.2 — מיצוי־בלבד).
   מיובאים כאן לשימוש פנימי ומיוצאים הלאה, כך שאף יבואן לא השתנה.
   EDEN_CANON נשאר ב־nightPlayers בלבד — הצרכן האחרון שלו כאן
   (settleWithPot) עבר ל־lib/nightSettle.js במנה 5.5. */
import { playersFromSession, playersWithPot, edenNameIn } from "./nightPlayers";
export { playersFromSession, playersWithPot, edenNameIn } from "./nightPlayers";
/* סימוני תשלום ותוכנית שמורה חיים ב־lib/nightPlan.js (גל B, מנה 5.3 —
   מיצוי־בלבד). מיובאים כאן לשימוש פנימי (settlementTextForSession)
   ומיוצאים הלאה, כך שאף יבואן לא השתנה. */
import { hasPaymentMarks, storedPlanTransfersList } from "./nightPlan";
export { hasPaymentMarks, storedPlanTransfersList, autoShortfallMapForPot, freezeShortfallMapFor } from "./nightPlan";
/* פער הערב חי ב־lib/nightGap.js (גל B, מנה 5.4 — מיצוי־בלבד).
   מיוצא הלאה, כך שאף יבואן לא השתנה. אין שימוש פנימי בו במודול זה. */
export { nightGap } from "./nightGap";
/* מנוע החלוקה חי ב־lib/nightSettle.js (גל B, מנה 5.5 — מיצוי־בלבד).
   מיובא כאן לשימוש פנימי (resolveSettlement) ומיוצא הלאה, כך שאף
   יבואן לא השתנה — כולל lib/savedSettlement.js. בלוק תיעוד מודל־הקופה
   עבר עם המנוע, כי הוא מתעד אותו. */
import { settleWithPot } from "./nightSettle";
export { settleWithPot } from "./nightSettle";

/** שמות הכיורים הפנימיים — מוגדרים ב־manualSettlement ומיוצאים כאן הלאה. */
export { POT_SINK_NAME, RESIDUAL_SINK_NAME } from "./manualSettlement";

/**
 * השחקנים שעליהם נבנית החלוקה: אם קיימת חלוקה ידנית שנשמרה על הבסיס
 * הישן (מותאם־עדן) — מחזירים את השחקנים הישנים כדי שה־basis יתאים והערב
 * הסגור לא ישתנה. בכל מקרה אחר — השחקנים הגולמיים.
 */
export function settlementPlayersFor(session) {
  const raw = playersFromSession(session);
  const ms = session?.manualSettlement;
  if (!ms?.basis) return raw;
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  if (ms.basis === settlementBasis(raw, cps)) return raw;
  const legacy = playersWithPot(session);
  if (ms.basis === settlementBasis(legacy, cps)) return legacy;
  return raw;
}

/** האם החלוקה הידנית של הערב נשמרה על הבסיס הישן (לפני מודל 25.10). */
export function isLegacySettlement(session) {
  const ms = session?.manualSettlement;
  if (!ms?.basis) return false;
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const raw = playersFromSession(session);
  if (ms.basis === settlementBasis(raw, cps)) return false;
  return ms.basis === settlementBasis(playersWithPot(session), cps);
}

/**
 * פותר החלוקה האחד של ערב שמור — כל המשטחים (דשבורד, מעקב תשלומים,
 * טקסט שיתוף, עורך ידני) עוברים דרכו כדי שלא יתפצלו שוב.
 * מחזיר { mode, cps, pot, transfers, expected, shortfall, saved? , result? }
 */
export function resolveSettlement(session) {
  /* הערה (הקפאת B1): resolveSettlement נשאר מחשבון טהור. ההקפאה של ערבים
     מסומנים חיה בשכבת הגשת התוכנית — paymentPlan ב־paymentTracking.js
     (שם חיים הסימונים, ודרכו עוברים כל משטחי התוכנית: כרטיס החלוקה,
     אישורים, תזכורות, סגירה) + טקסט השיתוף למטה. שם, ערב עם סימון כלשהו
     מוגש מהתוכנית השמורה כמות שהיא ולעולם לא מחושב מחדש. */
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const raw = playersFromSession(session);
  // סכום הקופה בתוכנית = "בפועל" אם נערך, אחרת הרשום (R3). הפנקס קורא את
  // השדות ישירות (potOverview) ולא מושפע מהבחירה כאן.
  const pot = potPlanFor(session);
  const ms = session?.manualSettlement;
  if (ms) {
    if (isLegacySettlement(session)) {
      const legacy = playersWithPot(session);
      const saved = savedSettlement(legacy, cps, ms, { allowResidual: false });
      return { mode: "legacy", cps, pot, transfers: saved.transfers, expected: saved.opening, shortfall: saved.shortfall || 0, saved, manualError: saved.manualError || null };
    }
    const saved = savedSettlement(raw, cps, ms, {
      potAmount: pot,
      potSinkName: POT_SINK_NAME,
      edenName: edenNameIn(session),
      allowResidual: sessionHasPot(session),
    });
    return { mode: "manual", cps, pot, transfers: saved.transfers, expected: saved.opening, shortfall: saved.shortfall || 0, saved, manualError: saved.manualError || null };
  }
  // בלי חלוקה שמורה: ערבים מעידן הקופה (10.10+) עוברים דרך מודל הקופה —
  // הקופה (אם נרשמה) כיור נפרד, ועודף מעבר לה מזוכה לעדן בחישוב החלוקה
  // (הכרעת 19.11; הנטו הגולמי שלו לא משתנה). ערבים קודמים נשארים בדיוק
  // כמו שנסגרו.
  if (!sessionHasPot(session)) {
    const s = settle(raw, cps);
    return { mode: "plain", cps, pot: 0, transfers: s.transfers, expected: s.nets, shortfall: s.shortfall, result: s };
  }
  const r = settleWithPot(raw, cps, pot);
  return {
    mode: pot > 0 ? "pot" : "plain",
    cps,
    pot,
    transfers: r.transfers,
    expected: r.expected,
    shortfall: r.shortfall,
    result: r,
  };
}

/**
 * טקסט חלוקה (מי מעביר למי) — אותו פורמט כמו ShareSheet «חלוקה».
 * ההעברות הפנימיות לקופה/לעודף מסוננות החוצה — הקבוצה רואה רק שחקנים.
 * @returns {string} ריק אם אין שחקנים / לא ניתן לחשב
 */
export function settlementTextForSession(session, opts = {}) {
  /* שער כלל 3 (25.11.2026): טקסט החלוקה (וואטסאפ/שיתוף) מופק רק לערב
     שהמנהל אישר לצפייה — אלא אם הקורא הוא המנהל עצמו (manager:true,
     תצוגה מקדימה/עריכה). */
  if (!opts.manager && !session?.settlementApprovedAt) return "";
  const players = playersFromSession(session);
  if (!players.length) return "";

  const cps = opts.cps ?? (sessionHasBuyinChips(session) ? (session.cps || CPS) : 1);
  /* ערב מסומן: טקסט החלוקה נבנה מהתוכנית השמורה, לא מחישוב מחדש (הקפאה). */
  const stored = hasPaymentMarks(session) ? storedPlanTransfersList(session?.payments?.plan) : null;
  const r = stored
    ? { transfers: stored, shortfall: 0 }
    : resolveSettlement(session);
  const result = {
    transfers: r.transfers.filter((t) => !t.pot && !t.residual),
    shortfall: r.shortfall,
  };
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
