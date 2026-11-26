/* הומור ערב חי (בדיחת כניסה חוזרת, סף קופה, נבואת פתיחה) — חולץ
   מ־lib/wa/apply.ts (גל B, מנה 6.5). ארבעת ה־closures של
   applyCommandsCore הפכו לפונקציות מודול עם ctx מפורש כפרמטר ראשון;
   הגופים זהים מילה־במילה למקור.
   מעגליות: הקשר ל־apply.ts הוא import type בלבד (WaApplyCtx) — נמחק
   בזמן קומפילציה, בלי קצה זמן־ריצה; apply.ts מייבא מכאן את ארבע
   הפונקציות. היבואנים הם הבעלים הישירים: הפורמטרים מ־
   lib/tipSummaryCopy.js, ‏isFemaleName מ־lib/gender.js ו־r2
   מ־lib/poker/helpers.js — לעולם לא דרך ./state. */

import { formatRebuyJoke, formatPotMilestoneLine, formatOpeningProphecy } from "../tipSummaryCopy.js";
import { isFemaleName } from "../gender.js";
import { r2 } from "../poker/helpers.js";
import type { WaApplyCtx } from "./apply";

/* שורת הומור לכניסה שלישית ומעלה של אותו שחקן באותו ערב. נקראת רק
   אחרי שהחותמת הוחלה — buyinEvents כבר כולל את הכניסה הנוכחית. */
export const pushRebuyJoke = (ctx: WaApplyCtx, name: string, player: { buyinEvents?: unknown[] }) => {
  const joke = formatRebuyJoke(name, (player.buyinEvents || []).length, isFemaleName, ctx.now);
  if (joke) ctx.acks.push(joke);
};

/* סך קופת השולחן (סכום הכניסות) — אותה הגדרה כמו בתמונת המצב. */
export const totalTablePot = (ctx: WaApplyCtx) => r2(ctx.state.players.reduce((t, p) => t + (+p.buyin || 0), 0));

/* ציון חציית סף קופה (כפולת 500): לפני < סף ≤ אחרי. כל סף מוכרז פעם
   אחת בערב — נרשם במצב, כך שביטול+החלה־מחדש של אותה הודעה לא מכריז
   שוב. כשכמה ספים נחצים בכניסה אחת — מוכרז הגבוה שבהם. */
export const pushPotMilestone = (ctx: WaApplyCtx, before: number, after: number) => {
  if (!(after > before)) return;
  const announced = ctx.state.potMilestonesAnnounced || [];
  const crossed: number[] = [];
  for (let t = 500; t <= after; t += 500) {
    if (before < t && !announced.includes(t)) crossed.push(t);
  }
  if (!crossed.length) return;
  ctx.state.potMilestonesAnnounced = [...announced, ...crossed];
  ctx.acks.push(formatPotMilestoneLine(crossed[crossed.length - 1], ctx.now));
};

/* נבואת פתיחה — פעם אחת בערב, בכניסה הראשונה כשהשולחן היה ריק.
   הדגל במצב שורד ביטול+החלה־מחדש של הודעת הפתיחה. */
export const pushOpeningProphecy = (ctx: WaApplyCtx, wasEmptyTable: boolean) => {
  if (!wasEmptyTable || ctx.state.openingProphecyDone) return;
  ctx.state.openingProphecyDone = true;
  ctx.acks.push(formatOpeningProphecy(ctx.now));
};
