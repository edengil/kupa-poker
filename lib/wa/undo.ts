/* ביטול פעולות (undo) על מצב הלייב — חולץ מ־lib/wa/state.ts
   (גל B, מנה 6.3). state.ts מייצא הלאה את undo + restorePendingSnapshot
   מכאן, כך שאף יבואן לא השתנה.
   צרכנות: פנימי חותמות־הקנייה (findStampPlayerIndex/stampIdOf/
   unstampEvent/undoCreatedStamp/playerPotSum) מיובאים ישירות מהבעלים
   ב־lib/wa/buyinStamp.ts, והיפוכי פעולות־הממתין (revertAppliedOpTip/
   revertAppliedOpCashout) ישירות מהבעלים ב־lib/wa/opPending.ts —
   לעולם לא דרך state.ts. את r2 מייבאים מהבעלים ב־lib/poker/helpers.js
   (דפוס 6.1/6.2 — אין תלות בקבוע TDZ של state).
   מעגליות: undo.ts → liveState.ts הוא קצה זמן־ריצה אחד בלבד —
   renameEverywhere (הכרזת פונקציה, נקראת רק בזמן קריאה בתוך undo;
   עברה ל־liveState במנה 6.4); שאר הקשר ל־liveState הוא טיפוסים
   ב־import type בלבד. הקצה החוזר state.ts → undo.ts הוא re-export
   של הכרזות פונקציה בלבד, בלי
   הפעלה ברמת־המודול. */

import { ALIASES, findPlayer } from "./parse.js";
import { r2 } from "../poker/helpers.js";
import {
  findStampPlayerIndex,
  playerPotSum,
  stampIdOf,
  undoCreatedStamp,
  unstampEvent,
} from "./buyinStamp";
import { revertAppliedOpCashout, revertAppliedOpTip } from "./opPending";
import { renameEverywhere } from "./liveState";
import type { UndoEntry, WaLiveState, WaPendingApproval, WaPlayer } from "./liveState";

/** מבטל את מה שהודעה קודמת עם אותו מזהה כבר עשתה.
 * מחזיר מפת נחיתה להחלה־מחדש: מזהה חותמת → השם הנוכחי של השחקן שהביטול
 * נגע בו. ההחלה שאחרי הביטול חייבת לנחות על אותו שחקן באותו שם — פתרון
 * השם הגולמי מההודעה מחדש דרך טבלת הכינויים עלול להושיב אדם אחר לגמרי
 * (למשל "דני" → "דני גוטניק" כשהיושב בפועל תוקן ל"דני לוי"). */
/** שחזור פריט־הממתין המלא מרשומת "approve" (מאז גל 4ב): הרשומה נושאת את
 * צילום הממתין בשדה pending, אבל ביטול של החלה ישנה — או רשומה שנבנתה
 * לפני שהצילום נשמר במלואו — עלול לשאת רק את שדות הליבה. משלימים את
 * החסר משדות הרשומה עצמה, כדי שהפריט המשוחזר ישמור את סוג הפעולה שלו
 * (op) ואת צילומי הטיפ/יציאה — אחרת האישור החוזר היה מחיל אותו כקנייה. */
export function restorePendingSnapshot(entry: UndoEntry): WaPendingApproval {
  const snap = entry.pending;
  if (snap) {
    return {
      ...snap,
      name: snap.name ?? (entry.name as string),
      amount: snap.amount ?? entry.amount ?? 0,
      at: snap.at ?? entry.at ?? 0,
    };
  }
  return {
    name: entry.name as string,
    amount: entry.amount ?? 0,
    at: entry.at ?? 0,
    ...(entry.op ? { op: entry.op } : {}),
  };
}

export function undo(state: WaLiveState, entries: UndoEntry[]): Map<string, string> {
  const retarget = new Map<string, string>();
  for (const e of [...entries].reverse()) {
    /* רשומות פעולת־ממתין היסטוריות (גל 4ב — טיפ/יציאה חריגים): כמו "pending" של
       הקניות — נוגעות רק בפריט הממתין עצמו: יצירה מסירה אותו, החלפה
       משיבה את הצילום הקודם. אם הפריט כבר נצרך (אושר/נדחה) הוא איננו,
       והביטול הוא no-op — בדיוק כמו בקנייה. היפוך של החלה שכבר אושרה
       קורה בביטול הודעת־האישור עצמה (ענף "approveOp" שלמטה), לא כאן. */
    if (e.t === "pendingOp") {
      const before = e.pendingBefore;
      if (before === null) {
        state.pendingApprovals = (state.pendingApprovals || []).filter(
          (p) =>
            !(
              p.name === e.name &&
              p.op === e.op &&
              p.amount === e.amount &&
              p.at === e.at
            ),
        );
      } else if (before) {
        const snap = before as WaPendingApproval;
        state.pendingApprovals = (state.pendingApprovals || []).map((p) =>
          p.name === e.name && p.op === e.op && p.at === e.at
            ? { ...snap, op: snap.op ?? p.op }
            : p,
        );
      }
      continue;
    }
    /* רשומות ממתין לא תלויות בשחקן יושב — הממתין בהגדרתו מחוץ לשולחן.
       כשהן ישבו מאחורי שער השחקן שלמטה, ביטולן דולג תמיד והגדלת־ממתין
       נספרה שוב בכל מסירה חוזרת (ממצא 4). */
    if (e.t === "pending") {
      if (e.pendingBefore === null) {
        /* הפעולה יצרה את הפריט — הביטול מסיר אותו (לפי הצילום שאחרי). */
        state.pendingApprovals = (state.pendingApprovals || []).filter(
          (p) => !(p.name === e.name && p.amount === e.amount && p.at === e.at),
        );
      } else if (e.pendingBefore) {
        /* הפעולה הגדילה פריט קיים — הביטול מחזיר amount/at לצילום־לפני.
           ההתאמה ההיסטורית (amount מצטבר מול דלתא) מעולם לא פגעה.
           הפריט מזוהה לפי ה־at שאחרי ההגדלה; אם כבר נצרך (אושר/נדחה) —
           אין מה להשיב. */
        const before = e.pendingBefore;
        state.pendingApprovals = (state.pendingApprovals || []).map((p) =>
          p.name === e.name && p.at === e.at ? { ...p, amount: before.amount, at: before.at } : p,
        );
      } else {
        /* רשומה ישנה בלי צילום־לפני — ההתנהגות ההיסטורית, לא גרוע ממנה. */
        state.pendingApprovals = (state.pendingApprovals || []).filter(
          (p) => !(p.name === e.name && p.amount === e.amount && p.at === e.at),
        );
      }
      continue;
    }
    /* רשומות שינוי־שם לא תלויות בשער השחקן שלמטה: אין להן שדה name
       (יש from/to), ולכן findIndex לפי e.name החזיר תמיד ‎-1 והענף שלהן
       בשרשרת שלמטה היה בלתי־ניתן־להשגה — הודעת rename ערוכה אבדה בשקט,
       כי הביטול לא הפך את השם וההחלה־מחדש לא מצאה את שם המקור (ממצא 4).
       מטפלים בהן כאן, לפני השער, כמו ברשומות הממתין. */
    if (e.t === "rename") {
      renameEverywhere(state, e.to as string, e.from as string);
      continue;
    }
    let i = state.players.findIndex((p) => p.name === e.name);
    /* רשומות קנייה מאותבות לפי מזהה/צילום האירוע, לא רק לפי שם — שם ששונה
       מאז ההחלה לא שובר את הביטול. שאר סוגי הרשומות: לפי שם, כמקודם. */
    if (e.t === "add" || e.t === "approve") i = findStampPlayerIndex(state, e);
    if (i === -1) {
      /* החותמת איננה (אין מחזיק חי — השחקן הוסר מאז) וצריכתה היא no-op,
         אבל רשומת אישור נושאת גם את שחזור הממתין שאושר: בלעדיו ההחלה־מחדש
         לא מוצאת ממתין, מתעלמת בשקט, והקנייה המאושרת אובדת מהלייב בלי
         סימן (אושר → הוסר → הודעת האישור נמסרת שוב). ה־no-op חל על צריכת
         החותמת בלבד; שחזור הממתין וניקוי approvedNames מתבצעים בכל מקרה. */
      if (e.t === "approve") {
        if (e.pending) {
          state.pendingApprovals = [
            ...(state.pendingApprovals || []),
            restorePendingSnapshot(e),
          ];
        }
        state.approvedNames = (state.approvedNames || []).filter((n) => n !== e.name);
      }
      continue;
    }
    if (e.t === "add" || e.t === "approve") {
      const sid = stampIdOf(e);
      if (sid) retarget.set(sid, state.players[i].name);
    }
    if (e.t === "add") {
      if (e.created) {
        undoCreatedStamp(state, i, e, e.delta ?? 0);
      } else {
        const p = state.players[i];
        const delta = e.delta as number;
        state.players[i] = {
          ...p,
          buyin: r2((+p.buyin || 0) - delta),
          buyinEvents: delta > 0 ? unstampEvent(state, p, e, delta) : p.buyinEvents,
        };
      }
    } else if (e.t === "out") {
      state.players[i] = { ...state.players[i], cashout: e.before };
    } else if (e.t === "tip") {
      const tipsGiven = Math.max(0, r2((+state.players[i].tipsGiven || 0) - (e.amount as number)));
      state.players[i] = {
        ...state.players[i],
        tipsGiven,
        /* רשומת מורשת שהטיפ בה הוריד מהיציאה — הביטול מחזיר את הדלתא על
           הערך הנוכחי: תיקון יציאה שנעשה אחרי הטיפ לא נדרס. רשומות ישנות
           שנשמרו עם צילום־מוחלט (cashoutBefore) עדיין משוחזרות בדיוק כמו
           קודם. רשומות חדשות (טיפ = רישום בלבד, בלי דלתא ובלי צילום):
           היציאה לא נגעה מעולם — לא נוגעים בה. */
        ...(e.cashDelta !== undefined
          ? {
              cashout:
                state.players[i].cashout !== "" && state.players[i].cashout != null
                  ? String((+state.players[i].cashout || 0) + (e.cashDelta as number))
                  : state.players[i].cashout,
            }
          : e.cashoutBefore !== undefined
            ? { cashout: e.cashoutBefore }
            : {}),
      };
      if (e.tipId != null) {
        state.tips = (state.tips || []).filter((t) => t.id !== e.tipId);
      }
      if (e.bagBefore) {
        if (e.bagV === 2) {
          /* שחזור מדויק של השקית המגדרית שממנה נשלפה המחמאה — השליפה
             הבאה אחרי הביטול חוזרת בדיוק לנקודה שלפני הטיפ. לזכר גם
             מראת־המורשת מתעדכנת, כמו בהחלה. */
          const bagState = state as unknown as Record<string, unknown>;
          bagState[e.female ? "tipComplimentBagF" : "tipComplimentBagM"] = e.bagBefore;
          bagState[e.female ? "tipComplimentLastF" : "tipComplimentLastM"] = e.lastBefore ?? null;
          if (!e.female) {
            state.tipComplimentBag = e.bagBefore;
            state.tipComplimentLast = e.lastBefore ?? null;
          }
        } else {
          state.tipComplimentBag = e.bagBefore;
          state.tipComplimentLast = e.lastBefore ?? null;
        }
      }
    } else if (e.t === "approveOp") {
      /* ביטול אישור־פעולה היסטורית (גל 4ב): ההחלה מתהפכת מהצילומים שברשומה —
         טיפ דרך revertAppliedOpTip (שורת השחקן + רשומת הטיפ + השקית),
         יציאה דרך revertAppliedOpCashout — והממתין חוזר לתור בצילומו
         המלא, כדי שאישור חוזר יחיל אותו שוב בדיוק. */
      const revEntry: UndoEntry = {
        ...e,
        name: state.players[i]?.name ?? e.name,
      };
      if (e.op === "tip") revertAppliedOpTip(state, revEntry);
      else if (e.op === "cashout") revertAppliedOpCashout(state, revEntry);
      if (e.pending) {
        state.pendingApprovals = [
          ...(state.pendingApprovals || []),
          restorePendingSnapshot(revEntry),
        ];
      }
    } else if (e.t === "approve") {
      const j = i;
      const currentName = state.players[j]?.name;
      const amount = e.pending?.amount ?? e.amount ?? 0;
      if (e.created) {
        /* יצירה באישור מתבטלת ברמת החותמת כמו יצירה בישיבה ישירה —
           אירועי קנייה מהודעות אחרות שורדים, והשחקן נשאר איתם. */
        undoCreatedStamp(state, j, e, amount);
      } else {
        /* אישור לשחקן קיים הוסיף קנייה דרך החותמת — הופכים גם אותה:
           חוב, אירוע חתום ו־pot, בדיוק כמו בביטול ריביי. */
        const p = state.players[j];
        if (p && amount > 0) {
          state.players[j] = {
            ...p,
            buyin: Math.max(0, r2((+p.buyin || 0) - amount)),
            buyinEvents: unstampEvent(state, p, e, amount),
          };
        }
      }
      if (e.pending) {
        state.pendingApprovals = [
          ...(state.pendingApprovals || []),
          restorePendingSnapshot(e),
        ];
      }
      state.approvedNames = (state.approvedNames || []).filter(
        (n) => n !== e.name && n !== currentName,
      );
    }
    /* ענף rename לא מופיע כאן — רשומות שינוי־שם מטופלות לפני שער השחקן
       שבראש הלולאה (אין להן שדה name לעבור אותו). */
  }
  // הסרה מוחזרת בסוף, אחרי שכל השאר חזר למקומו
  for (const e of [...entries].reverse()) {
    if (e.t === "remove") {
      const snap = e.player as WaPlayer;
      /* שחקן שהוא אותו אדם כבר יושב = גלגול חי חדש של אותו מושב (הושב
         בהודעת יצירה מאוחרת יותר), לא הצילום שהוסר. החזרת הצילום לצידו
         יוצרת כפילות, וההחלה־מחדש של ההסרה מסירה את הצילום ומשאירה את
         החי — עם אישור "הוסר מהשולחן" מטעה. מדלגים על החזרת הצילום (ועל
         החזרת ה־pot שלו); ההחלה־מחדש תאתר ותסיר את השחקן החי עצמו.
         הזהות נקבעת ברזולוציה של findPlayer (כינוי/קידומת דו־כיוונית),
         לא בשוויון שם: רשומת ההסרה נשמרת בשם המורחב ("דוד בני גיל" —
         ההרחבה קרתה בזמן ההסרה), בעוד הגלגול החי יושב בשם הגולמי
         ("דוד"); שוויון מחרוזות פספס אותו והצילום חזר כרפאים. שקילות
         לא חד־משמעית (ambiguous) לא מדלגת: לא מנחשים אדם, וההתנהגות
         הקיימת (החזרת הצילום) עדיפה על הסרת האדם הלא־נכון. */
      if (snap && findPlayer(state.players, snap.name, ALIASES).index !== -1) continue;
      state.players.splice(e.at as number, 0, snap);
      /* השחקן חוזר עם אירועי הקנייה שלו — גם ה־pot שלהם חוזר לקופה,
         מול הפירוק בהסרה עצמה, כדי שהאינווריאנט יישמר (תצפית גל 2). */
      const potBack = playerPotSum(snap);
      if (potBack) state.savingsPot = r2((Number(state.savingsPot) || 0) + potBack);
    }
    if (e.t === "entries") state.entriesCount = e.before as string;
  }
  return retarget;
}
