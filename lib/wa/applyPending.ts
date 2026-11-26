/* אישור/דחייה של ממתינים — חולץ מ־lib/wa/apply.ts (גל B, מנה 6.7).
   הבלוק הרציף של approve/reject בתוך applyCommandsCore הפך לפונקציית
   מודול אחת עם ctx מפורש כפרמטר ראשון; הגוף זהה מילה־במילה למקור —
   ההמרות היחידות הן המקומיים של הליבה (state/record/acks/problems/
   aliases/cps/now) ל־ctx.* מאותו שם, ו־continue של לולאת הליבה
   ל־return (כל נתיב בבלוק הסתיים ב־continue; אין בו return). חריג
   מתועד: ה־Date.now() הגולמי בנתיב אישור־שחקן־חדש נשאר גולמי בדיוק
   כבמקור — הוא אינו ctx.now.
   צורות הרשומות (pending/pendingOp/approve/approveOp עם כל שדות
   ה־revert) הן חוזה קפוא מול undo.ts — אפס שינוי בכל ליטרל רשומה.
   מעגליות: הקשר הטיפוסי ל־apply.ts הוא import type בלבד (WaApplyCtx/
   WaCmd). קבועי KOBI/KOBI_TIP_OPENER חיים ב־apply.ts ומשותפים גם
   לענף הטיפ שנשאר בליבה — לכן הם מיוצאים משם ומיובאים לכאן כערך;
   השימוש בהם הוא בזמן־קריאה בלבד (לא ברמת המודול), כך שסדר־כניסה
   של applyPending ראשון אינו נוגע בהם לפני אתחול apply.ts.
   היבואנים הם הבעלים הישירים, לא דרך barrel ה־state:
   pickPending/findInState/stampBuyin/stampedEventOf מ־./buyinStamp,
   ‏isOpPending/applyOpTip/applyOpCashout/opTipId מ־./opPending,
   ‏nextTipCompliment/formatTipCompliment מ־../tipCompliments.js,
   ‏isFemaleName/byGender מ־../gender.js, ‏settleLine מ־../report.js
   ו־resolveAlias מ־./parse.js. */

import { settleLine } from "../report.js";
import { formatTipCompliment, nextTipCompliment } from "../tipCompliments.js";
import { byGender, isFemaleName } from "../gender.js";
import { findInState, pickPending, stampBuyin, stampedEventOf } from "./buyinStamp";
import { applyOpCashout, applyOpTip, isOpPending, opTipId } from "./opPending";
import { resolveAlias } from "./parse.js";
import { KOBI, KOBI_TIP_OPENER } from "./apply";
import type { WaApplyCtx, WaCmd } from "./apply";

export function applyPendingDecision(ctx: WaApplyCtx, cmd: WaCmd, sid: string | undefined): void {
  const pending = ctx.state.pendingApprovals || [];
  const idx = pickPending(pending, cmd.name, ctx.aliases);
  if (idx === -2) {
    ctx.problems.push(`כמה ממתינים — כתוב אשר + שם (${pending.map((p) => p.name).join(", ")})`);
    return;
  }
  if (idx < 0) {
    if (!pending.length) return; // "כן" בקבוצה בלי המתנה — מתעלמים
    ctx.problems.push(cmd.name ? `${cmd.name} לא ממתין לאישור` : "אין שחקן שממתין לאישור");
    return;
  }
  const item = pending[idx];
  ctx.state.pendingApprovals = pending.filter((_, i) => i !== idx);
  if (cmd.kind === "reject") {
    if (isOpPending(item)) {
      /* דחיית פעולת־ממתין היסטורית (גל 4ב, מנגנון שהוסר 9.11):
         פריטים כאלה יכולים להתקיים רק בלייב שנוצר לפני ההסרה —
         ממשיכים לטפל בהם עד שהתור מתרוקן: הממתין נצרך ושום דבר
         לא הוחל — הטיפ/היציאה פשוט לא קורים. */
      ctx.record.push({
        t: "pendingOp",
        op: item.op,
        name: item.name,
        amount: item.amount,
        at: item.at,
        pendingBefore: item,
      });
      ctx.acks.push(
        item.op === "tip"
          ? `הטיפ של ${item.name} (${item.amount} ג'יטונים) נדחה — לא נרשם`
          : `היציאה של ${item.name} (${item.amount} ג'יטונים) נדחתה — ${byGender(item.name, "נשאר", "נשארה")} בשולחן`
      );
      return;
    }
    ctx.record.push({ t: "pending", name: item.name, amount: item.amount, at: item.at });
    ctx.acks.push(
      `${item.name} ${byGender(item.name, "נדחה", "נדחתה")} — ${byGender(item.name, "לא נכנס", "לא נכנסה")} לשולחן`
    );
    return;
  }
  /* אישור פעולת־ממתין היסטורית (גל 4ב — טיפ/יציאה ממתינים): ממתינים
     כאלה לא נוצרים יותר (המנגנון הוסר 9.11), אבל פריט קיים בלייב
     ממשיך להיות ניתן לאישור עד שהתור מתרוקן: ההחלה היא אותה לוגיקה
     של הפקודה הרגילה, על צילום־הלפני שנשמר בממתין. השחקן חייב להיות
     בשולחן; אם הוסר מאז ההמתנה — הפעולה אובדת עם הודעה, לא מומצאת
     על שחקן אחר. */
  if (isOpPending(item)) {
    const rtOpName = sid ? ctx.retarget.get(sid) : undefined;
    const opIdx = rtOpName
      ? ctx.state.players.findIndex((p) => p.name === rtOpName)
      : ctx.state.players.findIndex((p) => p.name === item.name);
    if (opIdx === -1) {
      ctx.record.push({
        t: "pendingOp",
        op: item.op,
        name: item.name,
        amount: item.amount,
        at: item.at,
        pendingBefore: item,
      });
      ctx.problems.push(`${item.name} כבר לא בשולחן — הפעולה הממתינה בוטלה`);
      return;
    }
    const opPlayer = ctx.state.players[opIdx];
    if (item.op === "tip") {
      const female = item.tipFemale ?? isFemaleName(opPlayer.name);
      const { template, bag, last, bagKey, lastKey } = nextTipCompliment(ctx.state, {
        female,
      }) as unknown as {
        template: string;
        bag: number[];
        last: number;
        bagKey: string;
        lastKey: string;
      };
      const tipId = opTipId(item);
      applyOpTip(ctx.state, opIdx, item, tipId, {
        bag,
        last,
        bagKey,
        lastKey,
        female,
      });
      ctx.record.push({
        t: "approveOp",
        op: "tip",
        name: opPlayer.name,
        pending: item,
        tipRevert: {
          tipsGiven: +opPlayer.tipsGiven || 0,
          cashout: opPlayer.cashout,
          tipId,
        },
      });
      if (resolveAlias(opPlayer.name, ctx.aliases) === KOBI) ctx.acks.push(KOBI_TIP_OPENER);
      ctx.acks.push(
        `אושר: ${formatTipCompliment(template, opPlayer.name, item.amount)}`
      );
      return;
    }
    const wasPending = ctx.state.pending === opPlayer.name;
    applyOpCashout(ctx.state, opIdx, item);
    const closedPlayer = ctx.state.players[opIdx];
    ctx.record.push({
      t: "approveOp",
      op: "cashout",
      name: opPlayer.name,
      pending: item,
      cashoutRevert: opPlayer.cashout ?? "",
      wasPending,
    });
    ctx.acks.push(
      `אושר: ${opPlayer.name} ${byGender(opPlayer.name, "יצא", "יצאה")} עם ${item.amount} ג'יטונים · ${settleLine(closedPlayer, ctx.cps)}`
    );
    return;
  }
  /* החלה־מחדש של אישור: נוחתים על השחקן שהביטול נגע בו בשמו הנוכחי,
     אם הוא עדיין בשולחן — לא על פתרון שם הממתין מחדש. */
  const rtApproveName = sid ? ctx.retarget.get(sid) : undefined;
  const rtApproveIdx = rtApproveName
    ? ctx.state.players.findIndex((p) => p.name === rtApproveName)
    : -1;
  const already =
    rtApproveIdx !== -1
      ? { index: rtApproveIdx, resolved: rtApproveName as string }
      : findInState(ctx.state, item.name, ctx.aliases);
  // הקנייה עוברת דרך החותמת המרכזית — אירוע אחד, pot ו־savingsPot כמו באפליקציה
  if (already.index !== -1) {
    const p = ctx.state.players[already.index];
    const next = stampBuyin(ctx.state, p, item.amount, ctx.now, sid);
    ctx.state.players[already.index] = next;
    ctx.record.push({
      t: "approve",
      name: p.name,
      pending: item,
      created: false,
      ev: stampedEventOf(p, next),
    });
    if (!ctx.state.approvedNames.includes(p.name)) ctx.state.approvedNames.push(p.name);
    ctx.acks.push(`${p.name} ${byGender(p.name, "אושר", "אושרה")} · +${item.amount}₪ · סה״כ ${next.buyin}₪`);
    return;
  }
  const fresh = {
    /* שחקן שהביטול הסיר לגמרי (החותמה הייתה כל מה שהיה לו) נוצר מחדש
       בשמו הנוכחי מהביטול, לא בשם הגולמי של הממתין. */
    name: rtApproveName ?? resolveAlias(item.name, ctx.aliases),
    buyin: 0,
    cashout: "",
    buyinEvents: [],
  };
  const seated = stampBuyin(ctx.state, fresh, item.amount, ctx.now, sid);
  ctx.state.players.push(seated);
  ctx.state.startedAt = ctx.state.startedAt || Date.now();
  if (!ctx.state.approvedNames.includes(seated.name)) ctx.state.approvedNames.push(seated.name);
  ctx.record.push({
    t: "approve",
    name: seated.name,
    pending: item,
    created: true,
    ev: stampedEventOf(fresh, seated),
  });
  ctx.acks.push(
    `${seated.name} ${byGender(seated.name, "אושר · נכנס", "אושרה · נכנסה")} ב-${item.amount}₪`
  );
  return;
}
