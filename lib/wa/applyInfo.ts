/* פקודות מידע (READ_ONLY) — חולץ מ־lib/wa/apply.ts (גל B, מנה 6.6).
   ארבעת ענפי המידע של applyCommandsCore — help/link/tipsSummary/status —
   הפכו לפונקציית מודול אחת עם ctx מפורש כפרמטר ראשון; הגופים זהים
   מילה־במילה למקור.
   חוזה הנפילה (fallthrough): הבלוק אינו ארבעה ענפים עצמאיים —
   tipsSummary מטופל לפני בדיקת השולחן־הריק, status אחריה, וענף
   ה־pendingApprovals שביניהם חל על כל סוג שנותר. לכן כניסה אחת
   שמחזירה את NOT_INFO ("לא־מידע / המשך") כשהפקודה אינה ענף מידע
   שנסגר כאן — בפועל רק settle עם שולחן לא־ריק — והליבה ממשיכה
   לנפילת ה־settle שנשארה בה (היא כותבת state.closing; שייכת ל־6.8).
   סדר ההערכה נשמר בדיוק: help ← link ← tipsSummary ← שער־הריק
   (ממתינים / אין־משחק) ← status ← NOT_INFO.
   מעגליות: הקשר ל־apply.ts הוא import type בלבד (WaApplyCtx/WaCmd) —
   נמחק בזמן קומפילציה, בלי קצה זמן־ריצה; apply.ts מייבא מכאן את
   applyInfo. היבואנים הם הבעלים הישירים: BOT_MARK מ־lib/botMark.js,
   ‏buildTipsTable מ־lib/tipsTable.js, ‏helpText מ־./help.js ו־snapshot
   מ־./summary — בלי import ערך מ־./state כלל.
   ה־report אינו עובר לכאן כגוף: ה־closure נשאר ב־apply.ts (הוא משמש
   גם את תשובת הליבה הסופית) ומגיע לכאן כפרמטר callback — ענף status
   קורא לו באפס ארגומנטים בדיוק כמו במקור, בלי שכפול של buildReport.
   ‏lastSession אינו שדה ב־WaApplyCtx ולכן מגיע כפרמטר סקלרי מפורש
   (אותו דפוס של name/player במנה 6.5) — ה־ctx לא הורחב. */

import { BOT_MARK } from "../botMark.js";
import { buildTipsTable } from "../tipsTable.js";
import { helpText } from "./help.js";
import { snapshot } from "./summary";
import type { WaApplyCtx, WaCmd } from "./apply";
import type { WaLiveState } from "./state";

/* סנטינל "לא־מידע / המשך": applyInfo לא סגר את הפקודה — הליבה ממשיכה
   לנפילת ה־settle. כל ענף מידע שנסגר מחזיר אובייקט תוצאה, ולכן null
   אינו יכול להתנגש בתוצאה אמיתית. */
export const NOT_INFO = null;

export interface WaInfoResult {
  live: Partial<WaLiveState>;
  reply: string;
}

/* ענפי המידע של בלוק ה־READ_ONLY, באותו סדר הערכה כמו בליבה.
   זהות אובייקט־ההחזרה נשמרת לפי ענף בדיוק כבמקור: help/link/
   tipsSummary/status מחזירים את live המקורי (הפרמטר), ורק ענף
   הממתינים שבשער־הריק מחזיר את state (‏{ live: state }). */
export const applyInfo = (
  ctx: WaApplyCtx,
  live: Partial<WaLiveState>,
  cmd: WaCmd,
  lastSession: Record<string, unknown> | null | undefined,
  report: () => string,
): WaInfoResult | typeof NOT_INFO => {
  if (cmd.kind === "help") return { live, reply: helpText() };

  if (cmd.kind === "link") {
    const url = cmd.siteUrl && cmd.slug ? `${cmd.siteUrl}/g/${cmd.slug}` : null;
    return {
      live,
      reply: url
        ? `${BOT_MARK} הטבלה של הקבוצה:\n${url}\n\nצריך להתחבר עם Google בכניסה.`
        : `${BOT_MARK} הלינק לא מוגדר.`,
    };
  }

  /* טבלת טיפים — הערב החי, ואם אין משחק פתוח אז הערב האחרון שנשמר */
  if (cmd.kind === "tipsSummary") {
    if (ctx.state.players.length) return { live, reply: buildTipsTable(ctx.state, { live: true, now: ctx.now, aliases: ctx.aliases }) };
    if (lastSession) return { live, reply: buildTipsTable(lastSession, { aliases: ctx.aliases }) };
    return { live, reply: `${BOT_MARK} אין משחק פעיל ואין ערב שמור לסכם.` };
  }

  if (!ctx.state.players.length) {
    const waiting = ctx.state.pendingApprovals || [];
    if (waiting.length) {
      return {
        live: ctx.state,
        reply: `${BOT_MARK} אין עדיין שחקנים בשולחן.\nממתינים לאישור: ${waiting.map((p) => p.name).join(", ")} · אשר / דחה / טעות`,
      };
    }
    return { live, reply: `${BOT_MARK} אין משחק פעיל.` };
  }

  if (cmd.kind === "status") {
    return { live, reply: `${BOT_MARK} תמונת מצב\n\n${snapshot(ctx.state, ctx.cps)}\n\n${report()}` };
  }

  return NOT_INFO;
};
