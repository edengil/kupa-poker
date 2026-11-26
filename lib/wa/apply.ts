/* החלת פקודות על ערב חי. לא שולח לוואטסאפ — רק מצב ותשובה אחת. */

import { buildReport, CPS } from "../report.js";
import { BOT_MARK } from "../botMark.js";
import { aliasesOf, findPlayer, READ_ONLY, resolveAlias } from "./parse.js";
import { decoratePendingReminder } from "./reminders.js";
import {
  blank,
  findInState,
  MAX_APPLIED_RECORDS,
  openPlayers,
  pickPending,
  renameEverywhere,
  undo,
} from "./state";
import { allClosedNote, closingStatus } from "./summary";
import { ownerAskText } from "./help.js";
import { applyInfo, NOT_INFO } from "./applyInfo";
import { applyPendingDecision } from "./applyPending";
import { applyClosingCmd, applySettle } from "./applyClosing";
import { applyAdd, applyRemove, applyReopen } from "./applyEntries";
import { applyMoneyCmd, applyTipNoName } from "./applyMoney";

export { helpText } from "./help.js";

import type { UndoEntry, WaLiveState, WaPendingApproval } from "./state";

export interface WaCmd {
  kind: string;
  name?: string;
  chips?: number;
  amount?: number;
  from?: string;
  to?: string;
  left?: number;
  count?: number;
  delta?: number;
  siteUrl?: string;
  slug?: string;
}

export interface WaApplyOpts {
  now?: number;
  /* חותמת הזמן של ההודעה עצמה (מ־Whapi, במילישניות) — לשער המסירה
     המאוחרת ב־applyCommandsCore. שונה מ־now, שהוא זמן העיבוד. */
  msgTs?: number;
  lastSession?: Record<string, unknown> | null;
  knownNames?: Set<string> | string[] | null;
  [k: string]: unknown;
}

/* סוגי פקודות שמזיזות כסף/ג'יטונים — לזיהוי בליעת־כסף בשער המסירה
   המאוחרת (גל 5, פריט 5.5): רק בליעת פקודה כזו מקבלת שורת בריאות
   גלויה לבעלים; כל בליעה מקבלת משואת diag. */
export const WA_MONEY_KINDS = new Set(["add", "tip", "tipNoName", "cashout", "answer"]);

/* ============================================================================
   אין יותר תקרה ואין תור אישור לפקודות כסף בבוט (החלטת עדן 9.11,
   מבטלת את 4.5 ואת המשך 4.5ב): הקבוצה היא רק כניסות/יציאות/טיפים,
   ומה שרושמים זה מה שהיה. כל פקודת כסף — בכל סכום — חלה מיד בנתיב
   הרגיל. טעות מתקנים בעריכת ההודעה (ביטול+החלה־מחדש) או באתר.
   הממתין היחיד שנשאר הוא של שחקן לא־מוכר (החלטה נפרדת, לא של סכום).
   ============================================================================ */

/* --------------------------- החלת הפקודות ---------------------------
   כל הודעה נרשמת ב-live.applied לפי מזהה ההודעה, יחד עם מה שהיא עשתה.
   זה פותר שני דברים בבת אחת:

   עריכה — הודעה שנערכה מגיעה עם אותו מזהה. מבטלים את מה שהיא עשתה קודם
   ומחילים מחדש את הגרסה החדשה.

   כפילות — Whapi חוזרת לפעמים על שליחה שנכשלה. בלי הרישום הזה כניסה
   הייתה נספרת פעמיים, וזה באג ששקט ומגלים אותו רק בסוף הערב.
   -------------------------------------------------------------------- */

export function applyCommands(live: Partial<WaLiveState>, cmds: WaCmd[], msgId: string | null, cps: number = CPS, opts: WaApplyOpts = {}) {
  const now = opts.now ?? Date.now();
  return decoratePendingReminder(applyCommandsCore(live, cmds, msgId, cps, { ...opts, now }), now);
}

/* תוצאת חיפוש השחקן המשותפת של הליבה (findInState או נחיתת ה־retarget
   הישירה) — מיוצאת כטיפוס בשביל applyEntries (גל B, מנה 6.9), שמקבל
   אותה כפרמטר. זו תוספת המשטח היחידה של המנה. */
export type FoundInState = ReturnType<typeof findInState>;

/* הקשר ההחלה המפורש של applyCommandsCore (גל B, מנה 6.0 — הכנה לפיצול
   ליבת הבוט, בלי שום מעבר קוד): כל מה שה־closures הפנימיים של הליבה
   סוגרים עליו מרוכז כאן, כדי שמנות ההמשך יוכלו לקבל את ה־ctx כפרמטר
   ולהוציא ענפים החוצה בצורה מכנית. השדות הם אותם ערכים/הפניות בדיוק
   שהקוד השתמש בהם עד היום: state/record/acks/problems הם אותם אובייקטים
   (מוטציות דרך ה־ctx ודרך המקומיים הן אותה מוטציה), ו־retarget/prevRecord
   מתמלאים פעם אחת בלבד — בבלוק הביטול+ההחלה־מחדש — לפני כל שימוש, ולא
   מוקצים שוב אחר כך. הממשק מיוצא (גל B, מנה 6.5) — נצרך ב־import type
   בלבד על־ידי מודולי ההמשך, בלי קצה זמן־ריצה חזרה לכאן. */
export interface WaApplyCtx {
  state: WaLiveState;
  record: UndoEntry[];
  acks: string[];
  problems: string[];
  aliases: ReturnType<typeof aliasesOf>;
  cps: number;
  now: number;
  retarget: Map<string, string>;
  prevRecord: UndoEntry[] | null;
  live: Partial<WaLiveState>;
  cmds: WaCmd[];
  msgId: string | null;
  opts: WaApplyOpts;
}

function applyCommandsCore(live: Partial<WaLiveState>, cmds: WaCmd[], msgId: string | null, cps: number = CPS, opts: WaApplyOpts = {}) {
  const now = opts.now ?? Date.now();
  const aliases = aliasesOf(opts);
  const state = blank(live);

  /* מנה 6.0: איסוף ההקשר המפורש. retarget/prevRecord מתחילים ריקים כאן
     ומתמלאים בבלוק הביטול+ההחלה־מחדש שלמטה — בדיוק כפי שהמקומיים שלהם
     התמלאו שם עד היום; כל שאר השדות סופיים כבר מעכשיו. */
  const ctx: WaApplyCtx = {
    state,
    record: [],
    acks: [],
    problems: [],
    aliases,
    cps,
    now,
    retarget: new Map<string, string>(),
    prevRecord: null,
    live,
    cmds,
    msgId,
    opts,
  };

  /* שער מסירה מאוחרת (ממצא 21): הלייב ריק לגמרי אבל חותמת ההודעה קודמת
     לסוף הערב השמור האחרון — זו לא פתיחת ערב חדש אלא ניסיון־מסירה זקן
     של Whapi להודעה מערב שכבר נסגר ונשמר. בלי השער היא הייתה פותחת
     לייב רפאים עם שחקן אחד. סובלנות של דקה מול סטיות שעון בין Whapi
     למכשיר; כשיש משחק פעיל השער לא חל — הדדופ של applied מטפל. */
  const msgTs = Number(opts.msgTs) || 0;
  const lastEndedAt = Number((opts.lastSession as { endedAt?: unknown } | null)?.endedAt) || 0;
  if (
    msgTs > 0 &&
    lastEndedAt > 0 &&
    msgTs < lastEndedAt - 60_000 &&
    state.players.length === 0 &&
    (state.pendingApprovals || []).length === 0
  ) {
    /* גל 5, פריט 5.5 (E9): השער נשאר בדיוק כמות שהוא — אבל הבליעה כבר
       לא שקטה. התוצאה נושאת סימון gate, והנתיב (route) רושם ממנו משואת
       diag_events + שורת בריאות לבעלים כשנבלעה פקודת כסף. הסימון נושא
       רק מטא־נתונים: סוגי הפקודות, מזהה ההודעה והסיבה — בלי תוכן. */
    return {
      live,
      reply: null,
      gate: {
        reason: "late-delivery",
        kinds: cmds.map((c) => c.kind),
        money: cmds.some((c) => WA_MONEY_KINDS.has(c.kind)),
        msgId: msgId ?? null,
        msgTs,
        lastEndedAt,
      },
    };
  }

  const report = () =>
    buildReport({ players: ctx.state.players, entriesCount: ctx.state.entriesCount as string, startedAt: ctx.state.startedAt, cps: ctx.cps });

  // פקודות מידע — לא נוגעות בנתונים ולכן יוצאות כאן. ענפי המידע חולצו
  // ל־applyInfo (גל B, מנה 6.6) באותו סדר הערכה בדיוק; NOT_INFO מחזיר
  // לכאן רק את נפילת ה־settle, שחולצה ל־applySettle (גל B, מנה 6.8).
  if (cmds.length === 1 && READ_ONLY.has(cmds[0].kind)) {
    const cmd = cmds[0];

    const info = applyInfo(ctx, live, cmd, opts.lastSession, report);
    if (info !== NOT_INFO) return info;

    return applySettle(ctx);
  }

  /* מסירה חוזרת/עריכה: מבטלים את מה שההודעה עשתה ומחילים מחדש. ה־undo
     מחזיר מפת נחיתה (מזהה חותמת → שם נוכחי של השחקן) — ההחלה־מחדש של
     פקודת קנייה נוחתת על השחקן שהביטול נגע בו, בשמו הנוכחי, ולא פותרת
     את השם הגולמי מההודעה מחדש (זהות החותמת: מזהה הודעה + אינדקס פקודה,
     יציבה בין ההחלה למסירה החוזרת של אותה הודעה). */
  /* הרשומה הקודמת של ההודעה נשמרת גם אחרי הביטול: ההחלה־מחדש צריכה
     לדעת מה ההודעה עשתה קודם — בפרט אם היא יצרה בקשת־ממתין שכבר אושרה
     (השער לפני החתמת הקנייה למטה). */
  if (msgId && state.applied[msgId]) {
    ctx.prevRecord = state.applied[msgId] as UndoEntry[];
    ctx.retarget = undo(state, ctx.prevRecord);
    delete state.applied[msgId];
  }

  const record = ctx.record;
  const acks = ctx.acks;
  const problems = ctx.problems;

  for (let ci = 0; ci < cmds.length; ci++) {
    let cmd = cmds[ci];
    const sid = msgId ? `${msgId}:${ci}` : undefined;
    if (READ_ONLY.has(cmd.kind)) continue;

    /* טיפ בלי שם (גל B, מנה 6.10): הענף נשאר במיקום הדיספאץ' המוקדם
       הזה במכוון — הוא כותב problems בלבד, לפני found; גופו ב־
       applyTipNoName שב־applyMoney. */
    if (cmd.kind === "tipNoName") { applyTipNoName(ctx, cmd); continue; }

    if (cmd.kind === "settleCancel") {
      if (state.closing) {
        state.closing = false;
        state.pending = null;
        acks.push("סגירת הערב בוטלה — ממשיכים לשחק");
      }
      continue;
    }

    if (cmd.kind === "rename") {
      const fromRaw = cmd.from;
      const toName = resolveAlias(cmd.to, aliases);
      if (!toName || toName === fromRaw) {
        problems.push("צריך שני שמות שונים: תקן ישן → חדש");
        continue;
      }
      const seated = findPlayer(state.players, fromRaw, aliases);
      if (seated.ambiguous) {
        problems.push(`${fromRaw} → ${seated.ambiguous.join(" / ")}`);
        continue;
      }
      const pendingIdx = pickPending(state.pendingApprovals || [], fromRaw, aliases);
      const fromSeated = seated.index !== -1 ? state.players[seated.index].name : null;
      const fromPending =
        pendingIdx >= 0 ? state.pendingApprovals[pendingIdx].name : null;
      const fromName = fromSeated || fromPending;
      if (!fromName) {
        problems.push(`${fromRaw} לא בשולחן ולא ממתין לאישור`);
        continue;
      }
      if (fromName === toName) {
        problems.push(`${fromName} כבר נקרא כך`);
        continue;
      }
      const clash = state.players.find(
        (p) => p.name === toName && p.name !== fromName
      );
      if (clash) {
        problems.push(`${toName} כבר בשולחן — לא מחליפים אוטומטית`);
        continue;
      }
      renameEverywhere(state, fromName, toName);
      record.push({ t: "rename", from: fromName, to: toName });
      const where = [
        fromSeated ? "בשולחן" : null,
        fromPending ? "בממתינים" : null,
      ]
        .filter(Boolean)
        .join(" + ");
      acks.push(`תוקן: ${fromName} → ${toName}${where ? ` (${where})` : ""}`);
      continue;
    }

    if (cmd.kind === "approve" || cmd.kind === "reject") {
      applyPendingDecision(ctx, cmd, sid);
      continue;
    }

    /* סגירה מודרכת + מלאי (גל B, מנה 6.8): nameOnly/answer/ask ושלישיית
       ה־entries חולצו ל־applyClosingCmd באותו מיקום לולאה ובאותו סדר
       פנימי. ה־rewrite של answer נופל לגוף הגנרי של אותו איטרציה. */
    if (
      cmd.kind === "nameOnly" ||
      cmd.kind === "answer" ||
      cmd.kind === "ask" ||
      cmd.kind === "entries_left" ||
      cmd.kind === "entries" ||
      cmd.kind === "entries_add"
    ) {
      const o = applyClosingCmd(ctx, cmd);
      if (o.action === "return") return o.result;
      if (o.action === "rewrite") cmd = o.cmd;
      else continue;
    }

    /* החלה־מחדש של פקודת קנייה: אם הביטול נגע בשחקן בשביל החותמת של
       הפקודה הזו, מאתרים אותו בשמו הנוכחי ישירות — בלי findInState,
       שפתרון הכינוי/הרחבת־השם שלו עלולים להחזיר שם ישן או אדם אחר. */
    const rtName = cmd.kind === "add" && sid ? ctx.retarget.get(sid) : undefined;
    const rtIdx = rtName ? state.players.findIndex((p) => p.name === rtName) : -1;
    const found =
      rtIdx !== -1 ? { index: rtIdx, resolved: rtName as string } : findInState(state, cmd.name, aliases);
    if (found.ambiguous) {
      problems.push(`${cmd.name} → ${found.ambiguous.join(" / ")}`);
      continue;
    }

    if (cmd.kind === "remove") { applyRemove(ctx, cmd, found); continue; }

    if (cmd.kind === "reopen") { applyReopen(ctx, cmd, found); continue; }

    /* טיפ + יציאה (גל B, מנה 6.10): הגופים ב־applyMoneyCmd שב־
       applyMoney, באותו מיקום לולאה בדיוק — אחרי remove/reopen וקפדנית
       לפני נפילת־הזנב applyAdd, שפקודת כסף לא נופלת אליה לעולם. */
    if (cmd.kind === "tip" || cmd.kind === "cashout") { applyMoneyCmd(ctx, cmd, found); continue; }

    applyAdd(ctx, cmd, sid, found, rtName);
  }

  if (!acks.length && !problems.length) return { live, reply: null };

  if (msgId) {
    state.applied[msgId] = record;
    /* גיזום יומן הביטולים (ממצא 21): בלי תקרה המפה צומחת לאורך כל ערב
       וכל כתיבת לייב נושאת אותה. הוותיקות ביותר נושרות — חלון הביטול
       המעשי של Whapi (ניסיונות־חוזרים ועריכות) קצר בהרבה מ־200 הודעות. */
    const appliedIds = Object.keys(state.applied);
    if (appliedIds.length > MAX_APPLIED_RECORDS) {
      for (const oldId of appliedIds.slice(0, appliedIds.length - MAX_APPLIED_RECORDS)) {
        delete state.applied[oldId];
      }
    }
  }
  state.ts = Date.now();
  /* ביט חדש מאפס את תזכורת השקט — השעון מתחיל מחדש מפעילות אמיתית. */
  if (record.some((e) => e.t === "add" || e.t === "approve")) {
    delete state.bitIdleRemindedAt;
    delete state.bitIdleRemindAttemptAt;
  }

  /* גם האזהרות מקבלות את סימן הבוט. תשובה שכולה אזהרות התחילה פעם ב-⚠️,
     עברה את פילטר ההד (שבודק רק את תחילת ההודעה) ופורסרה מחדש — ככה
     נהרס סיום הערב של 6.8.26. */
  const head = [...acks.map((a) => `${BOT_MARK} ${a}`), ...problems.map((x) => `${BOT_MARK} ⚠️ ${x}`)].join("\n");
  let ownerDm = null;
  if (record.some((e) => e.t === "pending" || e.t === "pendingOp"))
    ownerDm = ownerAskText(state);
  else if (record.some((e) => e.t === "rename")) {
    const renames = record.filter((e) => e.t === "rename");
    ownerDm = [
      `${BOT_MARK} תיקון שם בלייב`,
      "",
      ...renames.map((e) => `• ${e.from} → ${e.to}`),
      "",
      "הערב ממשיך — רק השם עודכן.",
    ].join("\n");
  }

  /* האחרון בשולחן יצא — בסגירה מודרכת או ביציאה רגילה. אישור קצר בלבד:
     בלי דוח הביט הישן, והסיכום המלא עם הלינק יוצא מהאפליקציה פעם אחת. */
  const allClosed =
    record.some((e) => e.t === "out" || (e.t === "approveOp" && e.op === "cashout")) &&
    state.players.length > 0 &&
    !openPlayers(state).length;
  if (allClosed) {
    state.closing = false;
    state.pending = null;
    return { live: state, reply: `${head}\n\n${allClosedNote(state)}`, ownerDm };
  }

  /* סגירה מודרכת: אחרי כל סגירה שואלים מי הבא. */
  if (state.closing) {
    const open = openPlayers(state);
    return {
      live: state,
      reply: `${head}\n\n${closingStatus(state, cps)}\n\nמי הבא? נשארו: ${open.map((p) => p.name).join(", ")}`,
      ownerDm,
    };
  }

  /* טיפ בלבד — רק משפט המחמאה, בלי דוח הכניסות. */
  const onlyTips = record.length > 0 && record.every((e) => e.t === "tip") && !problems.length;
  if (onlyTips) return { live: state, reply: head, ownerDm };

  return { live: state, reply: `${head}\n\n${report()}`, ownerDm };
}

/** תאימות לאחור — פקודה בודדת. */
export function applyCommand(live: Partial<WaLiveState>, cmd: WaCmd, cps: number = CPS) {
  return applyCommands(live, [cmd], null, cps);
}

/* ------------------------------ עזרה ------------------------------ */
