/* עזרי מצב טהורים לערב חי: יצירת מצב, ביטול פעולות ושינוי שמות.
   גל B, מנה 6.4 (האחרונה של state.ts): הקובץ הזה הוא מעתה barrel
   טהור — כותרת ושורות re-export בלבד, בלי גופי פונקציות ובלי הגדרות
   קבועים. כל הקוד חי במודולי הבעלים (buyinStamp/opPending/undo/
   liveState) ומיוצא הלאה מכאן, כך שאף יבואן לא השתנה. משטח הייצוא
   נשאר בדיוק 23 שמות. */

import {
  findInState,
  isKnownName,
  pickPending,
  playerPotSum,
  stampBuyin,
  stampedEventOf,
} from "./buyinStamp";

/* גל B, מנה 6.1: חותמות הקנייה והחיפוש עברו ל־lib/wa/buyinStamp.ts —
   מיוצאים הלאה מכאן כדי שאף יבואן לא ישתנה. פנימי־הביטול של החותמות
   נצרכים מ־6.3 ישירות ב־lib/wa/undo.ts מהבעלים, לא דרך כאן. */
export { findInState, isKnownName, pickPending, playerPotSum, stampBuyin, stampedEventOf };
import { applyOpCashout, applyOpTip, isOpPending, opTipId } from "./opPending";

/* גל B, מנה 6.2: החלה/ביטול של פעולות־ממתין היסטוריות עברו ל־
   lib/wa/opPending.ts — מיוצאים הלאה מכאן כדי שאף יבואן לא ישתנה.
   פנימי־ההיפוך נצרכים מ־6.3 ישירות ב־lib/wa/undo.ts מהבעלים, לא דרך כאן. */
export { applyOpCashout, applyOpTip, isOpPending, opTipId };
import { restorePendingSnapshot, undo } from "./undo";

/* גל B, מנה 6.3: הביטול (undo + restorePendingSnapshot) עבר ל־
   lib/wa/undo.ts — מיוצאים הלאה מכאן כדי שאף יבואן לא ישתנה. */
export { restorePendingSnapshot, undo };
import { blank, MAX_APPLIED_RECORDS, openPlayers, r2, renameEverywhere } from "./liveState";
import type { UndoEntry, WaBuyinEvent, WaLiveState, WaPendingApproval, WaPlayer, WaTip } from "./liveState";

/* גל B, מנה 6.4: מצב הלייב עצמו (הטיפוסים Wa*, ‏UndoEntry, ‏blank,
   openPlayers, ‏renameEverywhere, ‏MAX_APPLIED_RECORDS) עבר ל־
   lib/wa/liveState.ts — מיוצא הלאה מכאן כדי שאף יבואן לא ישתנה.
   r2 אוחד במנה זו: ההגדרה המקומית שהייתה כאן נמחקה, והשם מגיע
   מהבעלים היחיד lib/poker/helpers.js דרך ה־re-export ב־liveState. */
export { blank, MAX_APPLIED_RECORDS, openPlayers, r2, renameEverywhere };
export type { UndoEntry, WaBuyinEvent, WaLiveState, WaPendingApproval, WaPlayer, WaTip };
