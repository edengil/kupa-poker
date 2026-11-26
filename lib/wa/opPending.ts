/* החלה/ביטול של פעולות־ממתין היסטוריות (גל 4ב) — חולץ מ־lib/wa/state.ts
   (גל B, מנה 6.2). state.ts מייצא הלאה את השמות הציבוריים מכאן, כך שאף
   יבואן לא השתנה; ה־barrel מייבא מכאן רק את applyOpCashout/applyOpTip/
   isOpPending/opTipId ומייצא אותם הלאה. היפוכי הפעולות
   (revertAppliedOpTip/revertAppliedOpCashout) אינם מיוצאים הלאה מ־state.ts —
   ממנה 6.3 undo.ts מייבא אותם ישירות מכאן, מהבעלים.
   מעגליות: אין מעגל זמן־ריצה — המודול מייבא מ־liveState.ts טיפוסים
   בלבד (import type, נמחק בקומפילציה; עברו לשם מ־state.ts במנה 6.4),
   ואת r2 מהבעלים שלו ב־lib/poker/helpers.js (אותה הגדרה שהייתה
   ב־state). */

import { r2 } from "../poker/helpers.js";
import type { UndoEntry, WaLiveState, WaPendingApproval } from "./liveState";

/* ------------- החלה/ביטול של פעולות־ממתין היסטוריות (גל 4ב) -------------
   טיפ ויציאה חריגים נותבו פעם לתור אישור מעל תקרת השפיות; המנגנון הוסר
   בהחלטת עדן 9.11 וממתינים כאלה לא נוצרים יותר. ההחלה כאן נשארת רק
   לטובת ממתינים היסטוריים שעדיין פתוחים בלייב קיים: נתיב האישור ב־apply
   (החלה על הממתין החי) והביטול של הודעת־הממתין אחרי שהממתין כבר אושר
   (החלה על הצילום שנשמר בפריט). */

/** האם הממתין הוא פעולת טיפ/יציאה (גל 4ב) ולא קנייה. */
export function isOpPending(item?: WaPendingApproval | null): boolean {
  return !!item && (item.op === "tip" || item.op === "cashout");
}

/** מזהה רשומת־הטיפ שהחלת ממתין־טיפ תיצור — נגזר מזהות הממתין עצמו
 * (שחקן + סכום + חותמת היצירה), כך שההחלה החוזרת מאותו ממתין (מסירה
 * חוזרת של הודעת האישור, שתי החלות על אותו פריט) יוצרת את אותה רשומה
 * בדיוק, והביטול יודע להסיר אותה בלי לנחש. */
export function opTipId(item: WaPendingApproval): string {
  return `optip:${item.name}:${item.amount}:${item.at}`;
}

interface OpApplyFacts {
  /* תאימות חתימה בלבד: הטיפ הוא רישום בלבד (עדן, 11.11) ולעולם לא נוגע
     ביציאה — השדה תמיד false. */
  tipHitCashout: boolean;
}

/** מחיל ממתין־טיפ על השחקן: tipsGiven + רשומת טיפ ביומן — רישום בלבד,
 * בדיוק כמו לוגיקת הטיפ הרגילה: ה־cashout לא משתנה גם אם השחקן כבר
 * סגור. מחזיר עובדות להודעת האישור; ה־tipId נקבע מראש לפי opTipId.
 * צילום השקית/אחרון נשלף על ידי הקורא דרך nextTipCompliment, לא כאן —
 * כאן רק כותבים את התוצאה. */
export function applyOpTip(
  state: WaLiveState,
  playerIndex: number,
  item: WaPendingApproval,
  tipId: string | number,
  compliment: { bag: number[]; last: number; bagKey: string; lastKey: string; female: boolean },
): OpApplyFacts {
  const p = state.players[playerIndex];
  const amount = Math.max(0, Number(item.amount) || 0);
  const bagState = state as unknown as Record<string, unknown>;
  bagState[compliment.bagKey] = compliment.bag;
  bagState[compliment.lastKey] = compliment.last;
  if (!compliment.female) {
    state.tipComplimentBag = compliment.bag;
    state.tipComplimentLast = compliment.last;
  }
  state.players[playerIndex] = { ...p, tipsGiven: r2((+p.tipsGiven || 0) + amount) };
  if (!(state.tips || []).some((t) => t.id === tipId)) {
    state.tips = [
      ...(state.tips || []),
      { id: tipId, name: p.name, amount, at: Date.now() },
    ];
  }
  return { tipHitCashout: false };
}

/** מחיל ממתין־יציאה: סוגר את השחקן עם ג'יטוני הממתין ומנקה ממנו את
 * ממתין־הסגירה (state.pending), בדיוק כמו יציאה רגילה. */
export function applyOpCashout(
  state: WaLiveState,
  playerIndex: number,
  item: WaPendingApproval,
): void {
  const p = state.players[playerIndex];
  state.players[playerIndex] = { ...p, cashout: String(item.amount) };
  if (state.pending === p.name) state.pending = null;
}

/** היפוך החלת ממתין־טיפ שכבר אושר (ביטול הודעת־הממתין אחרי האישור):
 * מחזיר את tipsGiven ואת היציאה לצילום שנשמר ברשומה, מסיר את רשומת
 * הטיפ, ומשחזר את שקית המחמאות לצילום־הלפני של הממתין. */
export function revertAppliedOpTip(
  state: WaLiveState,
  entry: UndoEntry,
): void {
  const rev = entry.tipRevert;
  if (!rev) return;
  const i = state.players.findIndex((p) => p.name === entry.name);
  if (i !== -1) {
    state.players[i] = {
      ...state.players[i],
      tipsGiven: rev.tipsGiven,
      cashout: rev.cashout ?? state.players[i].cashout,
    };
  }
  state.tips = (state.tips || []).filter((t) => t.id !== rev.tipId);
  const item = entry.pending;
  if (item && Array.isArray(item.tipBagBefore)) {
    const female = !!item.tipFemale;
    const bagState = state as unknown as Record<string, unknown>;
    bagState[female ? "tipComplimentBagF" : "tipComplimentBagM"] = [...item.tipBagBefore];
    bagState[female ? "tipComplimentLastF" : "tipComplimentLastM"] = item.tipLastBefore ?? null;
    if (!female) {
      state.tipComplimentBag = [...item.tipBagBefore];
      state.tipComplimentLast = item.tipLastBefore ?? null;
    }
  }
}

/** היפוך החלת ממתין־יציאה שכבר אושר: מחזיר את ה־cashout לצילום־הלפני
 * ואת ממתין־הסגירה אם השחקן היה הממתין לפני היציאה. */
export function revertAppliedOpCashout(
  state: WaLiveState,
  entry: UndoEntry,
): void {
  const i = state.players.findIndex((p) => p.name === entry.name);
  if (i === -1) return;
  state.players[i] = { ...state.players[i], cashout: entry.cashoutRevert ?? "" };
  if (entry.wasPending) state.pending = entry.name as string;
}

