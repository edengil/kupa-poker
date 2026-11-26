/* סגירת ערב מודרכת ופקודות מלאי — חולץ מ־lib/wa/apply.ts (גל B, מנה 6.8).
   שתי כניסות: applySettle — נפילת ה־settle של בלוק ה־READ_ONLY (הגוף
   שאחרי applyInfo, כש־applyInfo החזיר NOT_INFO); ו־applyClosingCmd —
   ענפי הלולאה nameOnly/answer/ask ושלישיית ה־entries, במיקום הלולאה
   המדויק של המקור (אחרי דיספאץ' ה־approve/reject, לפני ענפי
   ה־findInState/כסף הגנריים) ובסדר הפנימי המדויק nameOnly ← answer ←
   ask ← entries_left ← entries ← entries_add. הגופים זהים מילה־במילה
   למקור — ההמרות היחידות הן המקומיים של הליבה (state/record/acks/
   problems/aliases/cps/cmds/now) ל־ctx.* מאותו שם, וזרימת הלולאה
   (continue/return/שכתוב cmd) לתוצאת ClosingOutcome מפורשת.
   חוזה ה־ClosingOutcome: ‏"continue" = הליבה ממשיכה ל־continue של
   הלולאה; ‏"return" = הליבה מחזירה את result מיד (ה־acks/record/
   problems שהצטברו מפקודות קודמות באותה הודעה נזרקים, מוטציות המצב
   נשמרות — בדיוק כבמקור); ‏"rewrite" = ה־answer שוכתב ל־cashout
   והליבה ממשיכה לגוף הגנרי של אותו איטרציה עם ה־cmd החדש — ה־cashout
   עצמו אינו מוחל כאן.
   אסימטריות נשמרות במכוון, בלי "תיקון": נפילת ה־settle מנקה pending
   רק כשיש פתוחים (כשאין — closing=false וה־pending לא מנוקה); ל־nameOnly
   יש שער closing ול־ask אין; ‏nameOnly מחזיר על ambiguous/not-found
   בעוד ask דוחף ל־problems וממשיך; מחלק ה־entries_left הוא הקבוע 50
   (לא cps), וב־entries_add אין r2 בעוד ב־entries_left יש.
   כל ההחזרות הן ‏{ live: state } (ה־blank דרך ctx.state) — לעולם לא
   ה־live הגולמי.
   מעגליות: הקשר ל־apply.ts הוא import type בלבד (WaApplyCtx/WaCmd) —
   נמחק בזמן קומפילציה, בלי קצה זמן־ריצה; apply.ts מייבא מכאן את
   applySettle/applyClosingCmd. היבואנים הם הבעלים הישירים, לא דרך
   barrel ה־state: ‏findInState מ־./buyinStamp, ‏openPlayers
   מ־./liveState, ‏closingStatus/finalSummary מ־./summary, ‏BOT_MARK
   מ־../botMark.js ו־r2 מ־../poker/helpers.js — אפס import מ־./state. */

import { BOT_MARK } from "../botMark.js";
import { r2 } from "../poker/helpers.js";
import { findInState } from "./buyinStamp";
import { openPlayers } from "./liveState";
import { closingStatus, finalSummary } from "./summary";
import type { WaApplyCtx, WaCmd } from "./apply";
import type { WaLiveState } from "./liveState";

export interface WaClosingResult {
  live: WaLiveState;
  reply: string;
}

export type ClosingOutcome =
  | { action: "continue" }
  | { action: "return"; result: WaClosingResult }
  | { action: "rewrite"; cmd: WaCmd };

/* נפילת ה־settle: applyInfo החזיר NOT_INFO — או סגירה מודרכת (יש עוד
   פתוחים) או הסיכום הסופי. */
export function applySettle(ctx: WaApplyCtx): WaClosingResult {
  // סיכום כשיש עוד פתוחים — נכנסים לסגירה מודרכת: שם ← ג'יטונים ← הבא
  const open = openPlayers(ctx.state);
  if (open.length) {
    ctx.state.closing = true;
    ctx.state.pending = null;
    return {
      live: ctx.state,
      reply: `${BOT_MARK} סוגרים את הערב 🎯\n\n${closingStatus(ctx.state, ctx.cps)}\n\nממי מתחילים? תכתוב שם ואני אשאל כמה ג'יטונים.\nאפשר גם ישר: "דן יצא 300".`,
    };
  }
  ctx.state.closing = false;
  return {
    live: ctx.state,
    reply: finalSummary(ctx.state, ctx.cps, ctx.cmds, ctx.aliases, ctx.now),
  };
}

export function applyClosingCmd(ctx: WaApplyCtx, cmd: WaCmd): ClosingOutcome {
  /* שם בלבד — חלק מהסגירה המודרכת: מסמן את השחקן הבא ושואל כמה ג'יטונים.
     מחוץ למצב סגירה זו סתם הודעה בקבוצה ומתעלמים ממנה בשקט. */
  if (cmd.kind === "nameOnly") {
    if (!ctx.state.closing) return { action: "continue" };
    const who = findInState(ctx.state, cmd.name, ctx.aliases);
    if (who.ambiguous) {
      return { action: "return", result: { live: ctx.state, reply: `${BOT_MARK} מתכוון ל־${who.ambiguous.join(" או ")}? תדייק.` } };
    }
    if (who.index === -1) {
      const open = openPlayers(ctx.state);
      return {
        action: "return",
        result: {
          live: ctx.state,
          reply: `${BOT_MARK} לא מצאתי את "${cmd.name}" בשולחן.\nנשארו פתוחים: ${open.map((p) => p.name).join(", ")}`,
        },
      };
    }
    const p = ctx.state.players[who.index];
    if (p.cashout !== "" && p.cashout != null) {
      /* שם של מי שכבר סגור = כנראה תיקון. שואלים שוב במקום לדחות —
         טעויות בספירת ג'יטונים מתגלות בדיוק בשלב הזה. */
      ctx.state.pending = p.name;
      return {
        action: "return",
        result: {
          live: ctx.state,
          reply: `${BOT_MARK} ${p.name} כבר רשום עם ${p.cashout} ג'יטונים — כמה במקום?\n("${p.name} חוזר" מחזיר אותו למשחק)`,
        },
      };
    }
    ctx.state.pending = p.name;
    return { action: "return", result: { live: ctx.state, reply: `${BOT_MARK} כמה ג'יטונים ל${p.name}?` } };
  }

  // תשובה למה שהבוט שאל. בלי שאלה פתוחה מספר בודד הוא סתם הודעה בקבוצה.
  if (cmd.kind === "answer") {
    if (!ctx.state.pending) return { action: "continue" };
    return { action: "rewrite", cmd: { kind: "cashout", name: ctx.state.pending, chips: cmd.chips } };
  }

  if (cmd.kind === "ask") {
    const who = findInState(ctx.state, cmd.name, ctx.aliases);
    if (who.ambiguous) {
      ctx.problems.push(`${cmd.name} → ${who.ambiguous.join(" / ")}`);
      return { action: "continue" };
    }
    if (who.index === -1) {
      ctx.problems.push(`${cmd.name} לא בשולחן`);
      return { action: "continue" };
    }
    ctx.state.pending = ctx.state.players[who.index].name;
    return { action: "return", result: { live: ctx.state, reply: `${BOT_MARK} כמה ג'יטונים ל${ctx.state.pending}?` } };
  }

  if (cmd.kind === "entries_left") {
    ctx.record.push({ t: "entries", before: ctx.state.entriesCount });
    const pot = ctx.state.players.reduce((t, p) => t + (+p.buyin || 0), 0);
    const next = r2(pot / 50 + cmd.left);
    ctx.state.entriesCount = String(next);
    ctx.acks.push(`המלאי תוקן: ${cmd.left} בחוץ · סה״כ ${next} כניסות`);
    return { action: "continue" };
  }

  if (cmd.kind === "entries") {
    ctx.record.push({ t: "entries", before: ctx.state.entriesCount });
    ctx.state.entriesCount = String(cmd.count);
    ctx.acks.push(`הוכנו ${cmd.count} כניסות`);
    return { action: "continue" };
  }

  if (cmd.kind === "entries_add") {
    ctx.record.push({ t: "entries", before: ctx.state.entriesCount });
    const next = (+ctx.state.entriesCount || 0) + cmd.delta;
    ctx.state.entriesCount = String(next);
    ctx.acks.push(`נוספו ${cmd.delta} כניסות · סה״כ ${next}`);
    return { action: "continue" };
  }

  return { action: "continue" };
}
