/* פקודות כסף של הטיפ והיציאה — חולץ מ־lib/wa/apply.ts (גל B, מנה
   6.10, המנה האחרונה והמחמירה של פיצול הליבה). שני שערי כניסה, לא
   אחד — כי שני הענפים יושבים בשני מיקומי דיספאץ' שונים בלולאה:
   ‏applyTipNoName נשארת במיקום המוקדם (לפני settleCancel/rename/
   approve/closing/found) — היא כותבת problems בלבד, בלי state/record/
   acks, והזזתה אחרי found הייתה מפעילה findInState(undefined) וממציאה
   שורת־ערפול. ‏applyMoneyCmd (טיפ עם שם + יציאה) נקראת במיקום המאוחר:
   אחרי חישוב ה־found + שער הערפול, אחרי reopen, וקפדנית לפני קריאת
   הזנב applyAdd — ה־catch-all של הליבה; פקודת כסף לא נופלת אליו לעולם.
   סדר הדיספאץ' המלא נשמר בדיוק: tipNoName ← settleCancel ← rename ←
   approve/reject ← closing/rewrite ← found/ambiguous ← remove ←
   reopen ← tip ← cashout ← add.
   הגופים זהים מילה־במילה למקור — ההמרות היחידות הן המקומיים של
   הליבה (state/record/acks/problems/aliases/cps) ל־ctx.* מאותו שם,
   ‏msgId ל־ctx.msgId (ב־tipId), ו־continue של לולאת הליבה ל־return.
   שני ה־Date.now() הגולמיים בענף הטיפ (ב־tipId וביומן) נשארו גולמיים
   במכוון — אינם ctx.now.
   כללי כסף קפואים: הטיפ הוא רישום בלבד — הענף לעולם לא כותב cashout
   בשום נתיב (הצד השני: checkNightBalance מחזיר טיפים לספירה); אפס
   מגע עם savingsPot/pot בשלושת הענפים (ביציאה ה־pot נשאר על רשומת
   השחקן דרך ה־spread); ה־r2 היחיד במנה הוא tipsGiven; הסכום ברשומות
   וביומן הוא הגולמי אחרי Math.max, לא מעוגל.
   צורות הרשומות הן חוזה קפוא מול undo.ts: רשומת ה־{t:"tip"} היא
   בדיוק 8 שדות (t,name,amount,tipId,bagBefore,lastBefore,female,
   bagV:2) — בלי cashDelta/cashoutBefore, שהיעדרם הוא החוזה (undo
   בודק !== undefined); רשומת ה־{t:"out"} היא בדיוק 3 שדות
   (t,name,before), משותפת עם reopen — בלי שדה מבדיל.
   מכונת השקית בטיפ: bagBefore הוא המפתח המגדרי עם נפילת־מורשת לזכר
   בלבד (רק כשהמפתח המגדרי ריק ו־!female וקיים מפתח מורשת); הכתיבות
   למפתחות המגדריים + מראת־מורשת לזכרים בלבד.
   סוף משחק קובי (מנה 6.10): הקבועים KOBI/KOBI_TIP_OPENER עברו מילה־
   במילה מ־apply.ts ל־lib/tipCompliments.js — הבעלים העלווה של תחום
   הטיפ הטהור; שני הצרכנים כבר מייבאים ממנו. היצוא מ־apply.ts הוסר,
   ואחרי המנה אין שום קצה זמן־ריצה לתוך apply.ts מאף מודול lib/wa —
   כולם צורכים WaApplyCtx/WaCmd/FoundInState ב־import type בלבד.
   היבואנים הם הבעלים הישירים: nextTipCompliment/formatTipCompliment/
   tipBagKey/tipLastKey/KOBI/KOBI_TIP_OPENER מ־../tipCompliments.js,
   ‏isFemaleName/byGender מ־../gender.js, ‏r2 מ־../poker/helpers.js,
   ‏settleLine מ־../report.js ו־resolveAlias מ־./parse.js. */

import { settleLine } from "../report.js";
import { r2 } from "../poker/helpers.js";
import {
  formatTipCompliment,
  KOBI,
  KOBI_TIP_OPENER,
  nextTipCompliment,
  tipBagKey,
  tipLastKey,
} from "../tipCompliments.js";
import { byGender, isFemaleName } from "../gender.js";
import { resolveAlias } from "./parse.js";
import type { FoundInState, WaApplyCtx, WaCmd } from "./apply";

export function applyTipNoName(ctx: WaApplyCtx, cmd: WaCmd): void {
  ctx.problems.push(`טיפ ${cmd.chips} — של מי? תכתוב למשל «אופיר טיפ ${cmd.chips}»`);
}

export function applyMoneyCmd(ctx: WaApplyCtx, cmd: WaCmd, found: FoundInState): void {
  /* טיפ מג'יטונים של השחקן (לא מהקופה) — רישום בלבד (עדן, 11.11):
     tipsGiven מצטבר לסטטיסטיקה והאירוע נכנס ליומן, אבל ה־cashout לא
     משתנה בשום מצב, גם אם השחקן כבר סגור עם יציאה מספרית. הטיפים
     עוברים בין השחקנים ונשארים בשולחן — היציאה הנספרת היא האמת, וג'יטוני
     הטיפ מוחזרים לספירה בבדיקת איזון הג'יטונים בשמירה (nightBalance). */
  if (cmd.kind === "tip") {
    if (found.index === -1) {
      ctx.problems.push(`${cmd.name} לא בשולחן`);
      return;
    }
    const p = ctx.state.players[found.index];
    const amount = Math.max(0, +cmd.chips || 0);
    if (!amount) {
      ctx.problems.push(`טיפ של 0 לא נספר`);
      return;
    }
    const tipId = `${ctx.msgId || "tip"}_${ctx.record.length}_${Date.now()}`;
    const female = isFemaleName(p.name);
    /* צילום־לפני של השקית שממנה באמת שולפים (גל 4, פריט 4.2): השקית
       חיה במפתח המגדרי (BagM/BagF), עם נפילת־מורשת לזכר כמו בתוך
       nextTipCompliment. הצילום הישן העתיק את שדה המורשת — והביטול
       "שחזר" שדה שאף אחד לא שולף ממנו, בעוד השליפה בפועל נשארה
       צרכנית. bagV:2 מסמן רשומה עם צילום מגדרי מדויק. */
    const bk = tipBagKey(female);
    const lk = tipLastKey(female);
    const bagState = ctx.state as unknown as Record<string, unknown>;
    let bagBefore = Array.isArray(bagState[bk]) ? [...(bagState[bk] as number[])] : [];
    if (!bagBefore.length && !female && Array.isArray(ctx.state.tipComplimentBag)) {
      bagBefore = [...ctx.state.tipComplimentBag];
    }
    const lastBefore =
      (bagState[lk] as number | null | undefined) ??
      (!female ? ctx.state.tipComplimentLast : null) ??
      null;
    const { template, bag, last, bagKey, lastKey } = nextTipCompliment(ctx.state, { female }) as unknown as {
      template: string;
      bag: number[];
      last: number;
      bagKey: string;
      lastKey: string;
    };
    (ctx.state as unknown as Record<string, unknown>)[bagKey] = bag;
    (ctx.state as unknown as Record<string, unknown>)[lastKey] = last;
    // תאימות לאחור לשדות הישנים
    if (!female) {
      ctx.state.tipComplimentBag = bag;
      ctx.state.tipComplimentLast = last;
    }
    const tipsGiven = r2((+p.tipsGiven || 0) + amount);
    const next = { ...p, tipsGiven };
    /* רישום בלבד: ה־cashout לא משתנה, ולכן גם אין cashDelta ברשומה.
       ביטול של רשומת מורשת (עם cashDelta / cashoutBefore מהמשטר הישן)
       עדיין משחזר את היציאה בדיוק כמו קודם — ראו את ענף ה־"tip" ב־undo. */
    ctx.state.players[found.index] = next;
    ctx.state.tips = [...(ctx.state.tips || []), { id: tipId, name: p.name, amount, at: Date.now() }];
    ctx.record.push({
      t: "tip",
      name: p.name,
      amount,
      tipId,
      bagBefore,
      lastBefore,
      female,
      bagV: 2,
    });
    // BOT_MARK מתווסף אוטומטית על כל ack
    if (resolveAlias(p.name, ctx.aliases) === KOBI) ctx.acks.push(KOBI_TIP_OPENER);
    ctx.acks.push(formatTipCompliment(template, p.name, amount));
    return;
  }
  if (cmd.kind === "cashout") {
    if (found.index === -1) {
      ctx.problems.push(`${cmd.name} לא בשולחן`);
      return;
    }
    const p = ctx.state.players[found.index];
    // סגירה חוזרת = עדכון. דורסים את הערך הקודם ואומרים את זה במפורש
    const wasClosed = p.cashout !== "" && p.cashout != null;
    ctx.record.push({ t: "out", name: p.name, before: p.cashout ?? "" });
    const closed = { ...p, cashout: String(cmd.chips) };
    ctx.state.players[found.index] = closed;
    if (ctx.state.pending === p.name) ctx.state.pending = null;
    ctx.acks.push(
      `${wasClosed ? "עודכן: " : ""}${p.name} ${byGender(p.name, "יצא", "יצאה")} עם ${cmd.chips} ג\'יטונים · ${settleLine(closed, ctx.cps)}`
    );
    return;
  }
}
