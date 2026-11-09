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

/* עריכת "בפועל" של ערב אחד — ראו את התיעוד המלא מעל savePotActual
   ב־PotDashboard. שומר על מסלול מחיקת ה־manualSettlement הקפוא (A(b)). */
export function withActual(s, v) {
  const next = { ...s, savingsPotActual: v > 0 ? r2(v) : undefined };
  const ms = s.manualSettlement;
  const nowIso = new Date().toISOString();
  if (ms?.frozenActual != null) {
    if (v <= 0) {
      if (ms.frozenReal) {
        /* הוקפאה חלוקה אמיתית שעדן שמר (גל 2): משחררים רק את סימון
           ההקפאה. המפה הקפואה נשארת — היא משחזרת בדיוק את אותם סכומי
           שחקנים גם תחת הרשום, כך שהתוכנית לא זזה. */
        const { frozenActual, frozenReal, ...msRest } = ms;
        return { ...next, manualSettlement: msRest };
      }
      if (ms.frozenAuto || (ms.manualPayments || []).length === 0) {
        /* מפה שהוקפאה אוטומטית לערב בלי חלוקה שמורה (כולל מפות שנוצרו
           לפני שהוסף סימון frozenAuto) — מחיקת הבפועל משחררת את כולה
           וחוזרים לחישוב האוטומטי. חלוקה אמיתית עם תשלומים ידניים
           לעולם לא נמחקת כאן. */
        const { manualSettlement, ...rest } = next;
        return rest;
      }
      const { frozenActual, ...msRest } = ms;
      return { ...next, manualSettlement: msRest };
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
