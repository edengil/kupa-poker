/* ============================================================================
   בניית שחקני הערב של ערב שמור — מוצו מ־lib/nightShare.js (גל B, מנה 5.2,
   מיצוי־בלבד, אפס שינוי התנהגות). בונה את רשימת השחקנים מתוך רשומות הערב
   ומסמן/מגלם את הקופה בנטו של עדן במסלול ה־legacy; שום חישוב חלוקה כאן.
   nightShare מייצא את כולן הלאה (re-export), כך שאף יבואן לא השתנה.
   EDEN_CANON עבר לכאן עם הפונקציות שצורכות אותו ומיוצא רק כדי ש־nightShare
   יוכל לייבא אותו בחזרה לשימושיו הפנימיים הנותרים (isPrivilegedName /
   settleWithPot) — הוא לא היה ולא נהיה export של nightShare.
   ============================================================================ */

import { CPS, netOf } from "./report";
import { canon, DEFAULT_ALIASES } from "./poker/helpers.js";
import { sessionHasBuyinChips, sessionHasPot } from "./potReaders";

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

export const EDEN_CANON = "עדן גיל";

/**
 * [LEGACY — מודל 2026-10-11, הוחלף ב־25.10.2026] שחקנים לחישוב ההעברות —
 * העודף מגולם בנטו של עדן גיל. נשמר אך ורק כדי לזהות ולשרת חלוקות ידניות
 * ישנות שה־basis שלהן חושב על השחקנים המותאמים (ערבים סגורים לא משתנים).
 * חלוקות חדשות עוברות דרך resolveSettlement/settleWithPot בלבד.
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

/** שם עדן כפי שהוא מופיע ברשומות הערב (לניתוב הקופה דרכו), או null. */
export function edenNameIn(session) {
  const players = playersFromSession(session || {});
  const eden = players.find((p) => canon(p.name, DEFAULT_ALIASES) === EDEN_CANON);
  return eden ? eden.name : null;
}
