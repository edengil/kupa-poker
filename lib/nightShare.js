/* ============================================================================
   עזרי שיתוף / חלוקה לערב שמור — מחושבים תמיד מחדש (לא נשמרים ב־DB).
   משותפים לטאב ערבים, טאב טבלה, לייב, ובוט הוואטסאפ.

   מצב סופי אחרי גל B, פריט 5 (מנות 5.1–5.7): המודול הזה הוא barrel
   בלבד — imports/re-exports ותיעוד מודול, בלי שום גוף פונקציה משלו.
   כל ההיגיון חי במודולים המפוצלים, וכל שם שיוצא מכאן מיוצא הלאה מהם,
   כך שאף יבואן (רכיבי components/poker/*, ‏lib/paymentTracking.js,
   ‏lib/poker/potEdits.js, ‏lib/settlementEditNotice.js,
   ‏lib/savedSettlement.js, ‏lib/wa/summary.ts ועוד) לא השתנה באף מנה:
   - lib/potReaders.js   — קוראי־הקופה הטהורים (מנה 5.1)
   - lib/nightPlayers.js — בניית שחקני הערב (מנה 5.2)
   - lib/nightPlan.js    — סימוני תשלום ותוכנית שמורה (מנה 5.3)
   - lib/nightGap.js     — פער הערב (מנה 5.4)
   - lib/nightSettle.js  — מנוע החלוקה settleWithPot (מנה 5.5)
   - lib/nightResolve.js — פתרון וטקסט חלוקה (מנה 5.6)
   - lib/nightText.js    — טיפים, בניית ערב מלייב וסיכומים (מנה 5.7)
   - lib/manualSettlement.js — שמות הכיורים הפנימיים (היו כאן re-export
     גם לפני הפיצול)
   ============================================================================ */

/* קוראי־הקופה הטהורים חיים ב־lib/potReaders.js (גל B, מנה 5.1 — מיצוי־בלבד).
   מיוצאים הלאה, כך שאף יבואן לא השתנה. */
export { sessionHasBuyinChips, sessionHasPot, potRecordedFor, potActualFor, potPlanFor, computedPot } from "./potReaders";
/* בניית שחקני הערב חיה ב־lib/nightPlayers.js (גל B, מנה 5.2 — מיצוי־בלבד).
   מיוצאים הלאה, כך שאף יבואן לא השתנה. EDEN_CANON נשאר ב־nightPlayers
   בלבד — אינו חלק ממשטח הייצוא של מודול זה. */
export { playersFromSession, playersWithPot, edenNameIn } from "./nightPlayers";
/* סימוני תשלום ותוכנית שמורה חיים ב־lib/nightPlan.js (גל B, מנה 5.3 —
   מיצוי־בלבד). מיוצאים הלאה, כך שאף יבואן לא השתנה. */
export { hasPaymentMarks, storedPlanTransfersList, autoShortfallMapForPot, freezeShortfallMapFor } from "./nightPlan";
/* פער הערב חי ב־lib/nightGap.js (גל B, מנה 5.4 — מיצוי־בלבד).
   מיוצא הלאה, כך שאף יבואן לא השתנה. */
export { nightGap } from "./nightGap";
/* מנוע החלוקה חי ב־lib/nightSettle.js (גל B, מנה 5.5 — מיצוי־בלבד).
   מיוצא הלאה, כך שאף יבואן לא השתנה — כולל lib/savedSettlement.js.
   בלוק תיעוד מודל־הקופה עבר עם המנוע, כי הוא מתעד אותו. */
export { settleWithPot } from "./nightSettle";
/* פתרון וטקסט חלוקה חיים ב־lib/nightResolve.js (גל B, מנה 5.6 —
   מיצוי־בלבד). מיוצאים הלאה, כך שאף יבואן לא השתנה. הצהרת מעגליות:
   המעגל nightPlan↔nightShare ממנה 5.3 עבר במנה זו ל־nightPlan↔nightResolve
   (settlementTextForSession צורך את סימוני/תוכנית nightPlan;
   freezeShortfallMapFor של nightPlan צורך את ה־resolver משם ישירות) —
   כל הקשירות החוצות הן הכרזות פונקציה הנקראות בזמן קריאה בלבד, בלי שום
   הפעלה ברמת־המודול. */
export { settlementPlayersFor, isLegacySettlement, resolveSettlement, settlementTextForSession } from "./nightResolve";
/* טיפים, בניית ערב שמור מלייב וסיכומי סוף־ערב חיים ב־lib/nightText.js
   (גל B, מנה 5.7 — מיצוי־בלבד, המנה האחרונה של פריט 5). מיוצאים הלאה,
   כך שאף יבואן לא השתנה. במנה זו הוסרו גם הייבואים האחרונים שהחזיק
   המודול הזה (report, settlement, poker/helpers, tipSummaryCopy,
   botMark) — הם חיים כעת ב־nightText בלבד, ואין כאן שימוש פנימי בשום
   שם מיוצא. */
export { tipTotalsByName, tipSummaryForSession, sessionFromLive, nightAwardsText, nightSummaryText } from "./nightText";

/** שמות הכיורים הפנימיים — מוגדרים ב־manualSettlement ומיוצאים כאן הלאה. */
export { POT_SINK_NAME, RESIDUAL_SINK_NAME } from "./manualSettlement";
