/* ============================================================================
   סימוני תשלום ותוכנית שמורה של ערב שמור — מוצו מ־lib/nightShare.js
   (גל B, מנה 5.3 — מיצוי־בלבד, אפס שינוי התנהגות). אלה קוראי/מקפיאי מצב
   החלוקה: ערב עם סימון כלשהו מוגש מהתוכנית השמורה כמות שהיא ולעולם לא
   מחושב מחדש (הגנת הקפאה B1, כלל ברזל 8). nightShare מייצא את כולן הלאה
   (re-export), כך שאף יבואן לא השתנה — כולל lib/dataMerge.js, שממשיך
   לייבא את hasPaymentMarks / storedPlanTransfersList מ־nightShare.
   סגירת־תלות מינימלית (מוצהרת): autoShortfallMapForPot ו־freezeShortfallMapFor
   צורכים את settleWithPot / settlementPlayersFor / resolveSettlement.
   settlementPlayersFor / resolveSettlement נשארים ב־nightShare עד מנה 5.6 —
   לכן המודול מייבא אותם מ־nightShare, ייבוא מעגלי באותו דפוס קיים של
   lib/savedSettlement.js מול nightShare. settleWithPot עבר במנה 5.5
   ל־lib/nightSettle.js ומיובא משם ישירות — הקצה nightPlan→nightShare
   עבורו התמוסס (הערת־ההמשך של המאבחן ממנה 5.3). כל שאר התלויות מגיעות
   מהמודולים שכבר פוצלו (nightPlayers, potReaders).
   ============================================================================ */

import { CPS } from "./report";
import { roundedNets } from "./settlement";
import { r2 } from "./poker/helpers.js";
import { sessionHasBuyinChips } from "./potReaders";
import { playersFromSession } from "./nightPlayers";
import { settlementPlayersFor, resolveSettlement } from "./nightShare";
import { settleWithPot } from "./nightSettle";

/**
 * האם לערב כבר יש סימון תשלום כלשהו (paid / received / potPaid לא־ריקים).
 * ערב כזה לעולם לא מחושב מחדש (הגנת הקפאה B1, כלל ברזל 8): ה־resolver
 * משרת את התוכנית השמורה ב־payments.plan כמות שהיא.
 */
export function hasPaymentMarks(session) {
  const p = session?.payments;
  if (!p || typeof p !== "object") return false;
  if (p.potPaid) return true;
  const anyTrue = (m) => m && typeof m === "object" && Object.values(m).some(Boolean);
  return anyTrue(p.paid) || anyTrue(p.received);
}

/** התוכנית השמורה ב־payments.plan כרשימת העברות, או null אם אינה כזו. */
export function storedPlanTransfersList(plan) {
  if (typeof plan !== "string" || !plan) return null;
  try {
    const parsed = JSON.parse(plan);
    if (!Array.isArray(parsed)) return null;
    const ok = parsed.every(
      (t) => t && typeof t === "object" && typeof t.from === "string" && typeof t.to === "string"
    );
    return ok ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * מפת חוסר אוטומטית (יחסית לרווחים, דרך settleWithPot) לסכום קופה נתון —
 * משמשת "להקפיא" את החלוקה כמפה ידנית כשעורכים "בפועל" לערב בלי חלוקה
 * שמורה: המפה מוחלטת, ולכן צופה שמחשב עם הרשום (בלי לדעת את הבפועל)
 * מקבל את אותם סכומי שחקנים בדיוק.
 * @returns {Object<string, number>} שם זוכה → סכום שנחתך; {} אם אין חוסר.
 */
export function autoShortfallMapForPot(session, potAmount) {
  const players = playersFromSession(session || {});
  if (!players.length) return {};
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const r = settleWithPot(players, cps, Math.max(0, r2(+potAmount || 0)));
  const received = Object.create(null);
  for (const t of r.playerTransfers || []) {
    received[t.to] = (received[t.to] || 0) + t.amount;
  }
  // ההשוואה היא מול הנטו הגולמי — ה־nets של settleWithPot כבר אחרי החלוקה
  const map = {};
  for (const n of roundedNets(players, cps)) {
    if (n.net <= 0) continue;
    const cut = Math.round(n.net - (received[n.name] || 0));
    if (cut > 0) map[n.name] = cut;
  }
  return map;
}

/**
 * מפת ההקפאה לעריכת "בפועל" על ערב עם חלוקה ידנית (ממצא ביקורת 8):
 * מחשבת את החלוקה כפי שהיא תחת הקופה הרשומה (בלי ה"בפועל"), ומחזירה
 * מפת חוסר מוחלטת שמשחזרת בדיוק את אותם סכומי שחקנים. כשזו המפה
 * השמורה, שינוי סכום הקופה בתוכנית מזיז רק את שורת הקופה (ההפרש
 * הופך לעודף פנימי) — ומנהל וצופה, שהצופה מחשב עם הרשום בלבד,
 * מקבלים אותם סכומי שחקנים. כולל את התשלומים הידניים בחישוב
 * ה"התקבל", כי המפה חלה לפניהם והסכומים משתמרים (ראו withActual).
 * @returns {Object<string, number>} שם זוכה → סכום שנחתך; {} אם אין חוסר.
 */
export function freezeShortfallMapFor(session) {
  const players = settlementPlayersFor(session || {});
  if (!players.length) return {};
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const atRecorded = { ...(session || {}), savingsPotActual: undefined };
  const resolved = resolveSettlement(atRecorded);
  const received = Object.create(null);
  for (const t of resolved.transfers || []) {
    // רק קבלות־זכאות נספרות כאן: שורות ה־residual הן זיכוי העודף לעדן
    // (הכרעת 19.11), לא חלק מהזכאות — אם ייספרו, מפת ההקפאה תחתוך את
    // עדן פחות מהנדרש והעודף יזוכה לו פעמיים כשהמפה תוחל.
    if (t.to && !t.residual) received[t.to] = (received[t.to] || 0) + t.amount;
  }
  const map = {};
  for (const n of roundedNets(players, cps)) {
    if (n.net <= 0) continue;
    const cut = Math.round(n.net - (received[n.name] || 0));
    if (cut > 0) map[n.name] = cut;
  }
  return map;
}
