import { r2 } from "./helpers";
import {
  autoShortfallMapForPot,
  freezeShortfallMapFor,
  isLegacySettlement,
  potRecordedFor,
  sessionHasBuyinChips,
  sessionHasPot,
  settlementPlayersFor,
} from "../nightShare";
import { settlementBasis } from "../savedSettlement";

/* עריכות קופת החיסכון הטהורות — חולצו מהקומפוננטות (גל 8, 8.3) כדי
   שההיגיון יחיה ב־lib והבדיקות ייבאו משם, לא מתוך JSX:
   withoutWithdrawal היה ב־SavingsPotCard, withActual ב־PotDashboard. */

/** מחזיר עותק של רשימת המשיכות בלי הרשומה שבאינדקס המקורי (בלי לשנות את המקור). */
export function withoutWithdrawal(withdrawals, originalIndex) {
  const list = Array.isArray(withdrawals) ? withdrawals : [];
  return list.filter((_, idx) => idx !== originalIndex);
}

/**
 * האם הערב כבר "ננעל" לתוכנית: יש הקפאה (frozenPot/frozenActual) או סימון
 * תשלום כלשהו. אחרי הנעילה עריכות קופה נוגעות רק בפנקס/בתצוגה — לעולם
 * לא בתוכנית (Pot Boost, 25.11.2026).
 */
export function isPotFrozen(s) {
  const ms = s?.manualSettlement;
  if (ms && (ms.frozenPot != null || ms.frozenActual != null)) return true;
  const p = s?.payments;
  if (!p) return false;
  if (p.potPaid) return true;
  const anyTrue = (m) => m && typeof m === "object" && Object.values(m).some(Boolean);
  return anyTrue(p.paid) || anyTrue(p.received);
}

/**
 * עריכת "רשום" (session.savingsPot) — הפונקציה האחת שכל המסכים משתמשים
 * בה (PotDashboard.savePot + SessionsTab.savePotAmount הפסיקו לכתוב את
 * השדה ישירות). לפני הקפאה: כתיבת שדה רגילה — זה ה־Pot Boost, החלוקה
 * מתעצבת מחדש דרך מנוע החמישיות. אחרי הקפאה/סימון: הערך מתעדכן בפנקס
 * בלבד, ו־frozenPot נכתב/נשמר כך שהתוכנית המאושרת לא זזה. מחיקה (v<=0)
 * לעולם לא משחררת הקפאה קיימת (C6).
 */
export function withRecordedPot(s, v) {
  const next = { ...s, savingsPot: v > 0 ? r2(v) : undefined };
  const ms = s?.manualSettlement;
  if (isPotFrozen(s)) {
    const frozenPot = ms?.frozenPot != null ? ms.frozenPot : (s.savingsPotActual != null && s.savingsPotActual !== "" ? r2(Number(s.savingsPotActual)) : (s.savingsPot != null && s.savingsPot !== "" ? r2(Number(s.savingsPot)) : undefined));
    if (frozenPot != null) {
      return { ...next, manualSettlement: { ...(ms || {}), frozenPot } };
    }
    return next;
  }
  return next;
}

/**
 * שער עריכת קופה במצב readOnly (B4): במצב צפייה־בלבד כל ניסיון עריכה
 * נחסם עם הודעה מפורשת — כשל השמירה השקטה של 23.11 לא יכול לחזור.
 * @returns {string|null} הודעת שגיאה להצגה, או null אם מותר לערוך.
 */
export function potEditBlockReason({ readOnly = false } = {}) {
  if (readOnly) return "האפליקציה במצב צפייה־בלבד — עריכת הקופה לא נשמרה.";
  return null;
}

/**
 * עריכת קופה דרך CAS (B6): הבדיקה "האם יש הקפאה/סימון" נעשית בתוך
 * בניית ה־patch של updateGroupCas, על המצב הטרי שנקרא בבנייה־מחדש —
 * כך מרוץ "עריכת קופה מול סימון משני לקוחות" נסגר: הכותב השני רואה את
 * ההקפאה/הסימון של הראשון בתוך אותו rebuild ומחיל את העריכה כעריכת־
 * פנקס בלבד (withRecordedPot/withActual כבר מקפיאים־מודעים).
 * editFn מקבל את ה־session הטרי ומחזיר session חדש (למשל
 * (s) => withRecordedPot(s, 90)).
 */
export async function applyPotEditCas(supabase, groupId, sessionId, editFn, updateGroupCasFn) {
  const { updateGroupCas } = updateGroupCasFn ? { updateGroupCas: updateGroupCasFn } : await import("../groupCas.js");
  return updateGroupCas(supabase, groupId, (row) => {
    const data = row?.data;
    if (!data || !Array.isArray(data.sessions)) return null;
    const idx = data.sessions.findIndex((x) => x && x.id === sessionId);
    if (idx < 0) return null;
    const fresh = data.sessions[idx];
    const edited = editFn(fresh);
    if (!edited || edited === fresh) return null;
    const sessions = data.sessions.slice();
    sessions[idx] = edited;
    return { data: { ...data, sessions } };
  });
}

/* עריכת "בפועל" של ערב אחד — ראו את התיעוד המלא מעל savePotActual
   ב־PotDashboard. שומר על מסלול מחיקת ה־manualSettlement הקפוא (A(b)). */
export function withActual(s, v) {
  const next = { ...s, savingsPotActual: v > 0 ? r2(v) : undefined };
  const ms = s.manualSettlement;
  const nowIso = new Date().toISOString();
  if (ms?.frozenActual != null) {
    if (v <= 0) {
      /* C6 (25.11.2026): מחיקת/ניקוי "בפועל" לעולם לא מוחק, משחרר או
         מחליש הקפאה קיימת — לא frozenActual, לא frozenPot, ולא את מפת
         החוסר הקפואה. המחיקה מעדכנת רק את ערך השדה בפנקס. (ההתנהגות
         הקודמת מחקה את frozenActual ולפעמים את כל ה־manualSettlement —
         בוטלה.) */
      return { ...next, manualSettlement: { ...ms, frozenActual: ms.frozenActual } };
    }
    return { ...next, manualSettlement: { ...ms, frozenActual: r2(v) } };
  }
  if (!ms && v > 0 && sessionHasPot(next)) {
    const map = autoShortfallMapForPot(next, potRecordedFor(next));
    if (Object.keys(map).length) {
      const players = settlementPlayersFor(next);
      const cps = sessionHasBuyinChips(next) ? next.cps || 2 : 1;
      return {
        ...next,
        manualSettlement: {
          basis: settlementBasis(players, cps),
          manualPayments: [],
          preferCreditors: [],
          shortfall: map,
          frozenActual: r2(v),
          frozenAuto: true,
          settlementVersion: 2,
          settlementUpdatedAt: nowIso,
        },
      };
    }
  }
  if (ms && v > 0 && sessionHasPot(next) && !isLegacySettlement(next)) {
    /* ממצא ביקורת 8: גם כשיש חלוקה ידנית בלי frozenActual — מקפיאים את
       חלוקת הרשום כמפה מוחלטת (freezeShortfallMapFor, כולל התשלומים
       הידניים בחשבון). בלעדיה שינוי סכום הקופה מזיז את חיתוך החוסר,
       וסכומי השחקנים של המנהל (קופה = בפועל) ושל הצופה (קופה = רשום)
       מתפצלים. עם המפה, רק שורת הקופה זזה. ערבי legacy יוצאים מהכלל:
       ה־resolver שלהם לא כולל את הקופה כצד בחלוקה כלל. */
    const map = freezeShortfallMapFor(s);
    return {
      ...next,
      manualSettlement: {
        ...ms,
        ...(Object.keys(map).length ? { shortfall: map } : {}),
        frozenActual: r2(v),
        frozenReal: true,
      },
    };
  }
  return next;
}
