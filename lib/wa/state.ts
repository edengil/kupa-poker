/* עזרי מצב טהורים לערב חי: יצירת מצב, ביטול פעולות ושינוי שמות. */

import { DEFAULT_BUYIN } from "../report.js";
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
import type { BuyinEvent, Player, Tip } from "../poker/entities.js";

export const r2 = (v: number): number => Math.round(v * 100) / 100;

/* גל 7 (7.4): ההצהרות של הבוט הן כינויים לטיפוסים הקנוניים ב־
   lib/poker/entities.ts — ישות אחת מוצהרת במקום אחד. שדות ה־Wa*
   הצרים יותר (amount חובה באירוע של בוט) מתועדים שם כאופציונליים
   כי כותבים אחרים לא תמיד כותבים אותם. */
export type WaBuyinEvent = BuyinEvent;
export type WaPlayer = Player;
export type WaTip = Tip;

export interface WaPendingApproval {
  name: string;
  amount: number;
  at: number;
  /* סוג הפעולה הממתינה. חסר = קנייה של שחקן לא־מוכר — הממתין היחיד
     שנוצר היום. "tip"/"cashout" = ממתיני־פעולה היסטוריים מגל 4ב
     (תקרת השפיות, מנגנון שהוסר 9.11): הם לא נוצרים יותר, אבל פריט
     קיים בלייב פתוח עדיין ניתן לאישור/דחייה וביטול עד שהתור מתרוקן.
     "tip": amount = ג'יטוני הטיפ (לא שקלים). "cashout": amount =
     ג'יטוני היציאה. טיפ/יציאה ממתינים נושאים גם את צילום־הלפני של
     כל מה שההחלה תיגע בו, כדי שעריכה/דחייה יחזירו את המצב בדיוק,
     והאישור יחיל את הפעולה פעם אחת בדיוק מהצילום. */
  op?: "tip" | "cashout";
  /* צילום־לפני (טיפ): מצב השקית/אחרון של המגדר שממנו תישלף המחמאה. */
  tipBagBefore?: number[];
  tipLastBefore?: number | null;
  tipFemale?: boolean;
  /* צילום־לפני (יציאה): האם השחקן היה הממתין של הסגירה המודרכת. */
  wasPending?: boolean;
}

export interface WaLiveState {
  entriesCount: string | number;
  addAmt: number;
  startedAt: number | null;
  players: WaPlayer[];
  applied: Record<string, unknown>;
  pending: string | null;
  closing: boolean;
  pendingApprovals: WaPendingApproval[];
  approvedNames: string[];
  pendingRemindedAt: number | null;
  bitIdleRemindedAt?: number | null;
  /* חותמות ניסיון־שליחה (גל 3ב): נכתבות כשהתזכורת נשלחה אך השליחה נכשלה,
     כדי למנוע ספאם ניסיונות על ערוץ פג — בלי לסמן "נשלח" בשקר. חותמת
     ההצלחה (RemindedAt) נכתבת רק אחרי שליחה שהצליחה בפועל. */
  pendingRemindAttemptAt?: number | null;
  bitIdleRemindAttemptAt?: number | null;
  /* חותמות רגל ה־DM של התזכורות (גל 5, פריט 5.6): הצלחה/ניסיון נפרדים
     מרגל הקבוצה, כדי שהצלחה חלקית לא תשלח שוב את הרגל שכבר עברה. */
  pendingDmRemindedAt?: number | null;
  bitIdleDmRemindedAt?: number | null;
  pendingDmRemindAttemptAt?: number | null;
  bitIdleDmRemindAttemptAt?: number | null;
  ts?: number;
  tips: WaTip[];
  tipComplimentBag: number[];
  tipComplimentLast: number | null;
  coupleFills: Array<Record<string, unknown>>;
  savings5: boolean;
  savingsPot: number;
  potDraft?: string;
  /* גל הומור: ספי קופה שכבר הוכרזו הערב (כפולות 500) — הכרזה פעם אחת
     לסף, גם אם ביטול+החלה־מחדש חוצים אותו שוב. */
  potMilestonesAnnounced?: number[];
  /* גל הומור: נבואת הפתיחה כבר נשלחה הערב — פעם אחת בלבד. */
  openingProphecyDone?: boolean;
}

export interface UndoEntry {
  t: string;
  name?: string;
  delta?: number;
  created?: boolean;
  ev?: WaBuyinEvent;
  before?: string | number;
  amount?: number;
  tipId?: string | number;
  /* דלתא של סכום היציאה שהטיפ הוריד בפועל (כמו cashDelta באפליקציה) —
     הביטול מחזיר אותה על הערך הנוכחי, כך שתיקון יציאה מאוחר לא נדרס
     (שער 0.3). רשומות חדשות נושאות את השדה הזה בלבד. */
  cashDelta?: number;
  /* צילום־לפני של סכום היציאה — נשמר רק לרשומות ישנות שנכתבו לפני מעבר
     הדלתא; הביטול משחזר אותן בדיוק כמו קודם. */
  cashoutBefore?: string | number;
  /* צילום־לפני של פריט הממתין שפעולת "pending" שינתה: null = הפעולה
     יצרה את הפריט (הביטול מסיר אותו); אובייקט = הפעולה הגדילה פריט קיים
     (הביטול מחזיר amount/at לערכי הצילום). רשומות ישנות בלי השדה נופלות
     להתאמת name+amount+at ההיסטורית (ממצא 4). */
  /* לרשומות "pending" הצילום הוא {amount, at} של פריט הקנייה; לרשומות
     "pendingOp" (גל 4ב) הוא פריט הממתין המלא, כי שחזורו דורש גם את
     שדות הפעולה (op/צילומי הטיפ/היציאה). */
  pendingBefore?: { amount: number; at: number } | WaPendingApproval | null;
  /* רשומות גל 4ב (טיפ/יציאה חריגים בתור האישור — מנגנון שהוסר 9.11,
     נשמרות לטובת ממתינים היסטוריים שעדיין פתוחים בלייב קיים):
     "pendingOp" — הודעת הפקודה יצרה/החליפה ממתין מסוג op; הביטול
     מסיר/משיב את הממתין כמו ב־"pending" של הקניות, ואם הממתין כבר נצרך
     (אושר/נדחה) זה no-op — שוב, כמו בקנייה.
     "approveOp" — הודעת האישור החילה את הממתין; רק ביטולה הופך את
     ההחלה, דרך השדות שלמטה, ומשיב את הממתין מהצילום שבשדה pending.
     tipRevert = צילום שורת השחקן לפני החלת הטיפ (tipsGiven + cashout);
     הביטול מחזיר את השדות האלה ומסיר את רשומת הטיפ לפי tipId.
     cashoutRevert = ה־cashout שלפני החלת היציאה (מחרוזת, "" = היה
     פתוח). wasPending = השחקן היה ממתין־הסגירה לפני היציאה. */
  op?: "tip" | "cashout";
  tipRevert?: { tipsGiven: number; cashout: string | number | null | undefined; tipId: string | number };
  cashoutRevert?: string | number | null;
  wasPending?: boolean;
  bagBefore?: number[];
  lastBefore?: number | null;
  female?: boolean;
  /* גרסת צילום השקית: 2 = bagBefore/lastBefore הם הצילום המדויק של
     המפתח המגדרי (BagM/BagF) שממנו נשלפה המחמאה; בלי השדה — רשומת
     מורשת, והצילום הוא של שדות המורשת (גל 4, פריט 4.2). */
  bagV?: number;
  at?: number;
  pending?: WaPendingApproval;
  player?: WaPlayer;
  to?: string;
  from?: string;
}

/** תקרת יומן הביטולים (applied) בלייב — ראו את הגיזום ב־apply. */
export const MAX_APPLIED_RECORDS = 200;

/** אתחול מצב הלייב לפקודת בוט — הבעלים היחיד של צורת הלייב בצד הבוט.
 * מתחיל מהאובייקט השמור כמו שהוא ומנרמל רק את השדות שהבוט עצמו מנהל;
 * כל שדה אחר (של האפליקציה — actionLog/planSnap/handOfNight/liveAnnounced/
 * cps/editedAt, או שדה עתידי) עובר כמו שהוא. רשימת שדות סגורה כאן מחקה
 * שדות של האפליקציה מהמסד בכל פקודת בוט (ממצא 5); הצד של האפליקציה
 * לאותו חוזה הוא pickLiveMeta ב־lib/liveMeta.js. */
export function blank(live?: Partial<WaLiveState> | null): WaLiveState {
  const src = (live && typeof live === "object" ? live : {}) as Partial<WaLiveState>;
  const out = {
    ...src,
    entriesCount: src.entriesCount ?? "",
    addAmt: src.addAmt || DEFAULT_BUYIN,
    startedAt: src.startedAt || null,
    players: [...(src.players || [])],
    applied: { ...(src.applied || {}) },
    pending: src.pending ?? null,
    closing: src.closing ?? false, // סגירה מודרכת בעיצומה
    pendingApprovals: [...(src.pendingApprovals || [])],
    approvedNames: [...(src.approvedNames || [])],
    pendingRemindedAt: src.pendingRemindedAt ?? null,
    bitIdleRemindedAt: src.bitIdleRemindedAt ?? null,
    /* טיפים: יוצאים מערימת השחקן. tipsGiven על השחקן + יומן tips.
       tipComplimentBag — שקית מחמאות בלי חזרה ברצף. */
    tips: [...(src.tips || [])],
    tipComplimentBag: Array.isArray(src.tipComplimentBag) ? [...src.tipComplimentBag] : [],
    tipComplimentLast: src.tipComplimentLast ?? null,
    coupleFills: [...(src.coupleFills || [])],
    /* 5% לקופה הצדדית: דלוק אוטומטית (עדן, 2026-10-14) — מכובה רק אם כובה
       במפורש באפליקציה. חייב לעבור דרך blank, אחרת כל כתיבת בוט מוחקת אותו. */
    savings5: src.savings5 !== false,
    savingsPot: Number(src.savingsPot) || 0,
    /* עריכת המנהל לסכום הקופה של הערב (אישור בסוף ערב) — חייבת לעבור דרך
       blank, אחרת כל כתיבת בוט מוחקת אותה, כמו שקרה ל־savings5 בעבר. */
    potDraft: typeof src.potDraft === "string" ? src.potDraft : "",
  } as WaLiveState;
  /* חותמות הניסיון של גל 3ב (ממצא 10): מפתח חסר = לא נוסה מעולם, מפתח
     עם חותמת = נוסה. ה־spread מעביר מהאובייקט השמור גם null מפורש —
     מוחקים אותו, כדי שערב שלא נוסתה בו תזכורת לא יישא את המפתח בכלל
     ולא ישנה צורה. חותמת אמיתית עוברת כמו שהיא. */
  if (out.pendingRemindAttemptAt == null) delete out.pendingRemindAttemptAt;
  if (out.bitIdleRemindAttemptAt == null) delete out.bitIdleRemindAttemptAt;
  /* אותו חוזה צורה לחותמות רגל ה־DM (גל 5, פריט 5.6). */
  if (out.pendingDmRemindedAt == null) delete out.pendingDmRemindedAt;
  if (out.bitIdleDmRemindedAt == null) delete out.bitIdleDmRemindedAt;
  if (out.pendingDmRemindAttemptAt == null) delete out.pendingDmRemindAttemptAt;
  if (out.bitIdleDmRemindAttemptAt == null) delete out.bitIdleDmRemindAttemptAt;
  return out;
}

export const openPlayers = (state: WaLiveState): WaPlayer[] =>
  state.players.filter((p) => p.cashout === "" || p.cashout == null);

/** מחליף שם בכל מקומות הלייב של ערב פעיל (שולחן, ממתינים, טיפים…). */
export function renameEverywhere(state: WaLiveState, from: string, to: string): void {
  for (const p of state.players || []) {
    if (p.name === from) p.name = to;
  }
  if (state.pending === from) state.pending = to;
  state.pendingApprovals = (state.pendingApprovals || []).map((p) =>
    p.name === from ? { ...p, name: to } : p,
  );
  state.approvedNames = (state.approvedNames || []).map((n) => (n === from ? to : n));
  state.tips = (state.tips || []).map((t) => (t.name === from ? { ...t, name: to } : t));
  state.coupleFills = (state.coupleFills || []).map((c) => {
    if (!c || typeof c !== "object") return c;
    /* הצורה האמיתית של אירוע מילוי (lib/poker/coupleFills.js):
       { couple: [שם, שם], from, to, chips, at } — אין name/a/b. הגרסה
       הקודמת שכתבה את המפתחות הלא־קיימים האלה, כך ששינוי־שם בבוט השאיר
       את המילויים על השם הישן והם הפסיקו להיספר לזוג (ביקורת O2). */
    const next = { ...c };
    if (Array.isArray(next.couple)) {
      next.couple = next.couple.map((n) => (n === from ? to : n));
    }
    if (next.from === from) next.from = to;
    if (next.to === from) next.to = to;
    return next;
  });
}
