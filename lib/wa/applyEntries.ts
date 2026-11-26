/* כניסות שחקנים — הסרה / פתיחה־מחדש / הוספה — חולץ מ־lib/wa/apply.ts
   (גל B, מנה 6.9). שלוש פונקציות: applyRemove ו־applyReopen נקראות
   מהליבה בדיספאץ' מפורש לפי kind (אחרי חישוב ה־found המשותף, שנשאר
   בליבה כי גם tip/cashout צורכים אותו), ו־applyAdd היא נפילת־הזנב
   (fallthrough) האחרונה של גוף הלולאה — הליבה קוראת לה בלי שער kind
   כלל, ואין בתוכה שער kind !== "add": הסמנטיקה הקפואה נמדדת על הקוד,
   לא על מה שהמפרסר יכול לשלוח היום.
   הגופים זהים מילה־במילה למקור — ההמרות היחידות הן המקומיים של
   הליבה (state/record/acks/problems/aliases/now/opts.knownNames)
   ל־ctx.* מאותו שם, ו־continue של לולאת הליבה ל־return. חריג מתועד:
   ה־Date.now() הגולמי בנתיב הושבת שחקן חדש (startedAt) נשאר גולמי
   בדיוק כבמקור — הוא אינו ctx.now (כמו במנה 6.7). stampedEventOf
   נקרא פעמיים בנתיב הריביי (לרשומה ולשער ההומור) — שתי הקריאות
   נשמרו. prevRecord נקרא מ־ctx, לעולם לא כפרמטר; sid הוא פרמטר
   (לכל איטרציה, בשביל stampBuyin); found ו־rtName מגיעים כפרמטרים
   מהחישוב המשותף בליבה.
   צורות הרשומות ({t:"remove" עם צילום השחקן המלא + אינדקס},
   {t:"out", before} — אותה צורה כמו של cashout, {t:"pending" עם
   pendingBefore}, {t:"add" עם created/ev}) הן חוזה קפוא מול undo.ts —
   אפס שינוי בכל ליטרל רשומה.
   מעגליות: הקשר ל־apply.ts הוא import type בלבד (WaApplyCtx/WaCmd/
   FoundInState) — נמחק בזמן קומפילציה, בלי קצה זמן־ריצה; אפס import
   ערך מ־./apply. היבואנים הם הבעלים הישירים, לא דרך barrel ה־state:
   stampBuyin/stampedEventOf/isKnownName/playerPotSum מ־./buyinStamp,
   ‏r2 מ־../poker/helpers.js, ‏byGender מ־../gender.js, ‏resolveAlias
   מ־./parse.js, וארבע פונקציות ההומור מ־./applyHumor (קצה אח־חדש
   מאושר — שימוש בזמן־קריאה בלבד). renameEverywhere אינו נצרך כאן
   ואינו מיובא. */

import { r2 } from "../poker/helpers.js";
import { byGender } from "../gender.js";
import { isKnownName, playerPotSum, stampBuyin, stampedEventOf } from "./buyinStamp";
import { resolveAlias } from "./parse.js";
import { pushOpeningProphecy, pushPotMilestone, pushRebuyJoke, totalTablePot } from "./applyHumor";
import type { FoundInState, WaApplyCtx, WaCmd } from "./apply";

export function applyRemove(ctx: WaApplyCtx, cmd: WaCmd, found: FoundInState): void {
  if (found.index === -1) {
    ctx.problems.push(`${cmd.name} לא בשולחן`);
    return;
  }
  const p = ctx.state.players[found.index];
  ctx.record.push({ t: "remove", name: p.name, at: found.index, player: p });
  ctx.state.players.splice(found.index, 1);
  /* הסרה מפרקת גם את ה־pot שהשחקן צבר: savingsPot הוא סכום ה־pot של
     האירועים החיים, ואירועיו של המוסר כבר לא חיים. בלעדיו הקופה
     נשארת מנופחת, ומסירה חוזרת של הודעת היצירה מחזירה את השחקן עם
     קופה כפולה מהאירועים (תצפית גל 2). ביטול ההסרה ב־undo מחזיר
     את ה־pot יחד עם השחקן. */
  const potSum = playerPotSum(p);
  if (potSum) ctx.state.savingsPot = r2((Number(ctx.state.savingsPot) || 0) - potSum);
  ctx.acks.push(`${p.name} ${byGender(p.name, "הוסר", "הוסרה")} מהשולחן`);
  return;
}

export function applyReopen(ctx: WaApplyCtx, cmd: WaCmd, found: FoundInState): void {
  if (found.index === -1) {
    ctx.problems.push(`${cmd.name} לא בשולחן`);
    return;
  }
  const p = ctx.state.players[found.index];
  if (p.cashout === "" || p.cashout == null) {
    ctx.problems.push(`${p.name} בכלל ${byGender(p.name, "לא סגור", "לא סגורה")}`);
    return;
  }
  ctx.record.push({ t: "out", name: p.name, before: p.cashout });
  ctx.state.players[found.index] = { ...p, cashout: "" };
  ctx.acks.push(`${p.name} ${byGender(p.name, "חזר", "חזרה")} לשולחן — היציאה בוטלה`);
  return;
}

export function applyAdd(ctx: WaApplyCtx, cmd: WaCmd, sid: string | undefined, found: FoundInState, rtName: string | undefined): void {
  // הוספה או הפחתה
  if (found.index === -1) {
    if (cmd.amount <= 0) {
      ctx.problems.push(`${cmd.name} לא בשולחן`);
      return;
    }
    /* החלה־מחדש שהביטול הסיר את השחקן לגמרי: יוצרים מחדש בשם הנוכחי
       מהביטול ועוקפים את הסחת־הממתין — השחקן כבר הושב על ידי ההודעה
       הזו עצמה, והשם המתוקן שלו לא חייב להיות ברשימת המוכרים. */
    const name = rtName || found.resolved || resolveAlias(cmd.name, ctx.aliases);
    const extras = [
      ...(ctx.state.players || []).map((p) => p.name),
      ...(ctx.state.approvedNames || []),
    ];
    if (!rtName && !isKnownName(name, ctx.opts.knownNames, extras, ctx.aliases)) {
      const at = ctx.now;
      const existing = (ctx.state.pendingApprovals || []).find((p) => p.name === name);
      if (existing) {
        /* צילום־לפני של הפריט: הביטול ישחזר amount/at בדיוק. ההתאמה
           הישנה (amount מצטבר מול דלתא) מעולם לא פגעה, ולכן כל מסירה
           חוזרת של הודעת ההגדלה ספרה אותה שוב (ממצא 4). */
        const pendingBefore = { amount: existing.amount, at: existing.at };
        const grown = { ...existing, amount: r2(existing.amount + cmd.amount), at };
        ctx.state.pendingApprovals = (ctx.state.pendingApprovals || []).map((p) =>
          p === existing ? grown : p,
        );
        ctx.record.push({ t: "pending", name, amount: cmd.amount, at, pendingBefore });
        ctx.acks.push(`${name} עדיין ממתין לאישור עדן · ${grown.amount}₪`);
      } else {
        ctx.state.pendingApprovals = [...(ctx.state.pendingApprovals || []), { name, amount: cmd.amount, at }];
        ctx.record.push({ t: "pending", name, amount: cmd.amount, at, pendingBefore: null });
        ctx.acks.push(`שחקן חדש — מחכה לאישור עדן: ${name} · ${cmd.amount}₪`);
      }
      return;
    }
    const fresh = { name, buyin: 0, cashout: "", buyinEvents: [] };
    const potBefore = totalTablePot(ctx);
    const wasEmptyTable = ctx.state.players.length === 0 && !ctx.state.startedAt;
    const seated = stampBuyin(ctx.state, fresh, cmd.amount, ctx.now, sid);
    ctx.state.players.push(seated);
    ctx.state.startedAt = ctx.state.startedAt || Date.now();
    ctx.record.push({
      t: "add",
      name,
      delta: cmd.amount,
      created: true,
      ev: stampedEventOf(fresh, seated),
    });
    ctx.acks.push(`${name} ${byGender(name, "נכנס", "נכנסה")} ב-${cmd.amount}₪`);
    pushRebuyJoke(ctx, name, seated);
    pushOpeningProphecy(ctx, wasEmptyTable);
    pushPotMilestone(ctx, potBefore, totalTablePot(ctx));
    return;
  }

  /* מסירה חוזרת של בקשת־ממתין שכבר אושרה והושיבה את השחקן (תצפית
     גל 2): הביטול לא מצא ממתין — הוא נצרך באישור — והחלה רגילה הייתה
     חותמת את סכום הבקשה שוב על השחקן היושב: קנייה כפולה וקופה כפולה
     על אותה בקשה בדיוק. הבקשה כבר מומשה, אז לא נוגעים בכסף; רשומת
     הבקשה המקורית נרשמת מחדש כמו שהיא, כדי שמסירה נוספת של אותה
     הודעה תתנהג שוב בדיוק כך. */
  if (cmd.kind === "add" && ctx.prevRecord && found.index !== -1) {
    const seatedPlayer = ctx.state.players[found.index];
    const prevPending = ctx.prevRecord.find(
      (e) =>
        e.t === "pending" &&
        (e.name === seatedPlayer.name || resolveAlias(e.name || "", ctx.aliases) === seatedPlayer.name),
    );
    const stillPending = (ctx.state.pendingApprovals || []).some((pp) => pp.name === seatedPlayer.name);
    if (prevPending && !stillPending) {
      ctx.record.push(prevPending);
      ctx.acks.push(`${seatedPlayer.name} כבר בשולחן · סה״כ ${seatedPlayer.buyin}₪`);
      return;
    }
  }

  const p = ctx.state.players[found.index];
  const potBefore = totalTablePot(ctx);
  const next = stampBuyin(ctx.state, p, cmd.amount, ctx.now, sid);
  const delta = r2((+next.buyin || 0) - (+p.buyin || 0));
  ctx.state.players[found.index] = next;
  ctx.record.push({ t: "add", name: p.name, delta, ev: stampedEventOf(p, next) });
  ctx.acks.push(`${p.name} ${cmd.amount > 0 ? "+" : ""}${cmd.amount}₪ · סה״כ ${next.buyin}₪`);
  /* רק כשהחותמת באמת הוסיפה אירוע כניסה — הפחתה לא סופרת כניסה */
  if (stampedEventOf(p, next)) {
    pushRebuyJoke(ctx, p.name, next);
    pushPotMilestone(ctx, potBefore, totalTablePot(ctx));
  }
}
