/* ============================================================================
   פתרון וטקסט חלוקה של ערב שמור — מוצו מ־lib/nightShare.js (גל B, מנה 5.6,
   מיצוי־בלבד, אפס שינוי התנהגות). ה־resolver הוא פותר החלוקה האחד של כל
   המשטחים: הוא בוחר בין המסלולים אוטומטי / שמור־ידני / legacy — בחירת
   מסלול שגויה היא באג כסף, אף שהחישוב עצמו חי ב־lib/nightSettle.js
   (settleWithPot, מנה 5.5) וב־lib/savedSettlement.js. טקסט החלוקה
   (settlementTextForSession) הוא מה שוואטסאפ/השיתוף מציגים — שער כלל 3
   (צפייה רק אחרי אישור המנהל, אלא אם הקורא הוא המנהל) והקפאת הערבים
   המסומנים (הטקסט נבנה מהתוכנית השמורה, לא מחישוב מחדש) חיים בו.
   nightShare מייצא את כל הארבעה הלאה (re-export), כך שאף יבואן לא השתנה.
   הצהרת מעגליות (הכרעת המאבחן ממנה 5.3, ממומשת במנה זו): המעגל שהיה
   nightPlan↔nightShare עובר לכאן והופך ל־nightPlan↔nightResolve —
   settlementTextForSession צורך את hasPaymentMarks / storedPlanTransfersList
   מ־lib/nightPlan.js, ו־freezeShortfallMapFor שב־nightPlan צורך את
   settlementPlayersFor / resolveSettlement מכאן (הוא מפנה לכאן ישירות
   ממנה זו, לא דרך nightShare). כל הקשירות החוצות את המעגל הן הכרזות
   פונקציה (function declarations) שנקראות רק בזמן קריאה — אין שום
   הפעלה ברמת־המודול (top-level) מעבר למעגל. בנוסף, lib/savedSettlement.js
   ממשיך לייבא את settleWithPot דרך nightShare כמקודם, ו־nightShare
   מייצא הלאה מכאן — אותו דפוס מעגל ותיק דרך ה־barrel, גם הוא קריאה־בלבד
   בזמן ריצה. כל שאר התלויות מגיעות מהמודולים שכבר פוצלו (potReaders,
   nightPlayers, nightSettle) ומהמנועים המשותפים.
   ============================================================================ */

import { CPS, buildSettlement } from "./report";
import { settle, isCashOnly, transferVerb } from "./settlement";
import { withBotMark } from "./botMark";
import { savedSettlement, settlementBasis } from "./savedSettlement";
import { POT_SINK_NAME } from "./manualSettlement";
import { sessionHasBuyinChips, sessionHasPot, potPlanFor } from "./potReaders";
import { playersFromSession, playersWithPot, edenNameIn } from "./nightPlayers";
import { hasPaymentMarks, storedPlanTransfersList } from "./nightPlan";
import { settleWithPot } from "./nightSettle";

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
