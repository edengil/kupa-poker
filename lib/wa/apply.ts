/* החלת פקודות על ערב חי. לא שולח לוואטסאפ — רק מצב ותשובה אחת. */

import { buildReport, CPS, settleLine } from "../report.js";
import { nextTipCompliment, formatTipCompliment, tipBagKey, tipLastKey } from "../tipCompliments.js";
import { isFemaleName, byGender } from "../gender.js";
import { BOT_MARK } from "../botMark.js";
import { buildTipsTable } from "../tipsTable.js";
import { aliasesOf, findPlayer, READ_ONLY, resolveAlias } from "./parse.js";
import { decoratePendingReminder } from "./reminders.js";
import {
  blank,
  findInState,
  isKnownName,
  MAX_APPLIED_RECORDS,
  openPlayers,
  pickPending,
  playerPotSum,
  r2,
  renameEverywhere,
  stampBuyin,
  stampedEventOf,
  undo,
} from "./state";
import { allClosedNote, closingStatus, finalSummary, snapshot } from "./summary";
import { helpText, ownerAskText } from "./help.js";

export { helpText } from "./help.js";

import type { UndoEntry, WaLiveState } from "./state";

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

/* קובי מקבל פתיח משלו לפני משפט המחמאה על כל טיפ */
const KOBI = "קובי סעדה";
const KOBI_TIP_OPENER = "יא חאלייה";

/* ============================================================================
   תקרת שפיות לפקודת כסף בודדת של הבוט (גל 4, 4.5 · החלטת עדן 7).
   טעות הקלדה אחת בהודעת וואטסאפ ("דן +5000" במקום +500) לא נכנסת
   ללייב: פקודת קנייה מעל התקרה לא חלה ומנותבת לתור אישור עדן — אותו
   תור של שחקן לא־מוכר, בלי מנגנון חדש. התקרה נגזרת מהיסטוריית
   הקבוצה: אירוע הקנייה הבודד הגדול ביותר שנראה (בלייב הנוכחי או
   בערב האחרון שנסגר) × 4, עם רצפת גיבוי לערב חדש בלי היסטוריה.
   ============================================================================ */
export const BOT_MONEY_CEILING_FALLBACK_ILS = 1000;
const BOT_MONEY_CEILING_MULT = 4;

export function botMoneyCeilingIls(
  state: { players?: Array<{ buyinEvents?: Array<{ amount?: unknown }> }> } | null | undefined,
  lastSession?: { players?: Array<{ buyinEvents?: Array<{ amount?: unknown }> }> } | null
): number {
  let biggest = 0;
  const scan = (players?: Array<{ buyinEvents?: Array<{ amount?: unknown }> }>) => {
    for (const p of players || []) {
      for (const e of p?.buyinEvents || []) {
        biggest = Math.max(biggest, Math.abs(Number(e?.amount) || 0));
      }
    }
  };
  scan(state?.players);
  scan(lastSession?.players);
  return Math.max(BOT_MONEY_CEILING_FALLBACK_ILS, biggest * BOT_MONEY_CEILING_MULT);
}

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

function applyCommandsCore(live: Partial<WaLiveState>, cmds: WaCmd[], msgId: string | null, cps: number = CPS, opts: WaApplyOpts = {}) {
  const now = opts.now ?? Date.now();
  const aliases = aliasesOf(opts);
  const state = blank(live);

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
    buildReport({ players: state.players, entriesCount: state.entriesCount as string, startedAt: state.startedAt, cps });

  // פקודות מידע — לא נוגעות בנתונים ולכן יוצאות כאן
  if (cmds.length === 1 && READ_ONLY.has(cmds[0].kind)) {
    const cmd = cmds[0];

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
      if (state.players.length) return { live, reply: buildTipsTable(state, { live: true, now, aliases }) };
      if (opts.lastSession) return { live, reply: buildTipsTable(opts.lastSession, { aliases }) };
      return { live, reply: `${BOT_MARK} אין משחק פעיל ואין ערב שמור לסכם.` };
    }

    if (!state.players.length) {
      const waiting = state.pendingApprovals || [];
      if (waiting.length) {
        return {
          live: state,
          reply: `${BOT_MARK} אין עדיין שחקנים בשולחן.\nממתינים לאישור: ${waiting.map((p) => p.name).join(", ")} · אשר / דחה / טעות`,
        };
      }
      return { live, reply: `${BOT_MARK} אין משחק פעיל.` };
    }

    if (cmd.kind === "status") {
      return { live, reply: `${BOT_MARK} תמונת מצב\n\n${snapshot(state, cps)}\n\n${report()}` };
    }

    // סיכום כשיש עוד פתוחים — נכנסים לסגירה מודרכת: שם ← ג'יטונים ← הבא
    const open = openPlayers(state);
    if (open.length) {
      state.closing = true;
      state.pending = null;
      return {
        live: state,
        reply: `${BOT_MARK} סוגרים את הערב 🎯\n\n${closingStatus(state, cps)}\n\nממי מתחילים? תכתוב שם ואני אשאל כמה ג'יטונים.\nאפשר גם ישר: "דן יצא 300".`,
      };
    }
    state.closing = false;
    return {
      live: state,
      reply: finalSummary(state, cps, cmds, aliases, now),
    };
  }

  /* מסירה חוזרת/עריכה: מבטלים את מה שההודעה עשתה ומחילים מחדש. ה־undo
     מחזיר מפת נחיתה (מזהה חותמת → שם נוכחי של השחקן) — ההחלה־מחדש של
     פקודת קנייה נוחתת על השחקן שהביטול נגע בו, בשמו הנוכחי, ולא פותרת
     את השם הגולמי מההודעה מחדש (זהות החותמת: מזהה הודעה + אינדקס פקודה,
     יציבה בין ההחלה למסירה החוזרת של אותה הודעה). */
  let retarget = new Map<string, string>();
  /* הרשומה הקודמת של ההודעה נשמרת גם אחרי הביטול: ההחלה־מחדש צריכה
     לדעת מה ההודעה עשתה קודם — בפרט אם היא יצרה בקשת־ממתין שכבר אושרה
     (השער לפני החתמת הקנייה למטה). */
  let prevRecord: UndoEntry[] | null = null;
  if (msgId && state.applied[msgId]) {
    prevRecord = state.applied[msgId] as UndoEntry[];
    retarget = undo(state, prevRecord);
    delete state.applied[msgId];
  }

  const record: UndoEntry[] = [];
  const acks = [];
  const problems = [];

  /* תקרת השפיות של ההודעה הזו (4.5) + ניתוב לתור האישור: אותו דפוס
     בדיוק של שחקן לא־מוכר — ממתין מצטבר עם צילום pendingBefore, כך
     שעריכה/מסירה־חוזרת של ההודעה מבטלת ומחילה מחדש בלי כפילות. */
  const ceilingIls = botMoneyCeilingIls(state, opts.lastSession);
  const pendForApproval = (name: string, amount: number) => {
    const existing = (state.pendingApprovals || []).find((p) => p.name === name);
    const pendingBefore = existing
      ? { name: existing.name, amount: existing.amount, at: existing.at }
      : null;
    if (existing) {
      state.pendingApprovals = (state.pendingApprovals || []).map((p) =>
        p.name === name ? { ...p, amount: r2(p.amount + amount) } : p
      );
    } else {
      state.pendingApprovals = [
        ...(state.pendingApprovals || []),
        { name, amount, at: now },
      ];
    }
    record.push({ t: "pending", name, amount, at: now, pendingBefore });
    acks.push(
      `⚠️ סכום חריג: ${name} ${amount}₪ — לא חל. ממתין לאישור עדן (אשר ${name} / דחה ${name})`
    );
  };

  for (let ci = 0; ci < cmds.length; ci++) {
    let cmd = cmds[ci];
    const sid = msgId ? `${msgId}:${ci}` : undefined;
    if (READ_ONLY.has(cmd.kind)) continue;

    if (cmd.kind === "tipNoName") {
      problems.push(`טיפ ${cmd.chips} — של מי? תכתוב למשל «אופיר טיפ ${cmd.chips}»`);
      continue;
    }

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
      const pending = state.pendingApprovals || [];
      const idx = pickPending(pending, cmd.name, aliases);
      if (idx === -2) {
        problems.push(`כמה ממתינים — כתוב אשר + שם (${pending.map((p) => p.name).join(", ")})`);
        continue;
      }
      if (idx < 0) {
        if (!pending.length) continue; // "כן" בקבוצה בלי המתנה — מתעלמים
        problems.push(cmd.name ? `${cmd.name} לא ממתין לאישור` : "אין שחקן שממתין לאישור");
        continue;
      }
      const item = pending[idx];
      state.pendingApprovals = pending.filter((_, i) => i !== idx);
      if (cmd.kind === "reject") {
        record.push({ t: "pending", name: item.name, amount: item.amount, at: item.at });
        acks.push(
          `${item.name} ${byGender(item.name, "נדחה", "נדחתה")} — ${byGender(item.name, "לא נכנס", "לא נכנסה")} לשולחן`
        );
        continue;
      }
      /* החלה־מחדש של אישור: נוחתים על השחקן שהביטול נגע בו בשמו הנוכחי,
         אם הוא עדיין בשולחן — לא על פתרון שם הממתין מחדש. */
      const rtApproveName = sid ? retarget.get(sid) : undefined;
      const rtApproveIdx = rtApproveName
        ? state.players.findIndex((p) => p.name === rtApproveName)
        : -1;
      const already =
        rtApproveIdx !== -1
          ? { index: rtApproveIdx, resolved: rtApproveName as string }
          : findInState(state, item.name, aliases);
      // הקנייה עוברת דרך החותמת המרכזית — אירוע אחד, pot ו־savingsPot כמו באפליקציה
      if (already.index !== -1) {
        const p = state.players[already.index];
        const next = stampBuyin(state, p, item.amount, now, sid);
        state.players[already.index] = next;
        record.push({
          t: "approve",
          name: p.name,
          pending: item,
          created: false,
          ev: stampedEventOf(p, next),
        });
        if (!state.approvedNames.includes(p.name)) state.approvedNames.push(p.name);
        acks.push(`${p.name} ${byGender(p.name, "אושר", "אושרה")} · +${item.amount}₪ · סה״כ ${next.buyin}₪`);
        continue;
      }
      const fresh = {
        /* שחקן שהביטול הסיר לגמרי (החותמה הייתה כל מה שהיה לו) נוצר מחדש
           בשמו הנוכחי מהביטול, לא בשם הגולמי של הממתין. */
        name: rtApproveName ?? resolveAlias(item.name, aliases),
        buyin: 0,
        cashout: "",
        buyinEvents: [],
      };
      const seated = stampBuyin(state, fresh, item.amount, now, sid);
      state.players.push(seated);
      state.startedAt = state.startedAt || Date.now();
      if (!state.approvedNames.includes(seated.name)) state.approvedNames.push(seated.name);
      record.push({
        t: "approve",
        name: seated.name,
        pending: item,
        created: true,
        ev: stampedEventOf(fresh, seated),
      });
      acks.push(
        `${seated.name} ${byGender(seated.name, "אושר · נכנס", "אושרה · נכנסה")} ב-${item.amount}₪`
      );
      continue;
    }

    /* שם בלבד — חלק מהסגירה המודרכת: מסמן את השחקן הבא ושואל כמה ג'יטונים.
       מחוץ למצב סגירה זו סתם הודעה בקבוצה ומתעלמים ממנה בשקט. */
    if (cmd.kind === "nameOnly") {
      if (!state.closing) continue;
      const who = findInState(state, cmd.name, aliases);
      if (who.ambiguous) {
        return { live: state, reply: `${BOT_MARK} מתכוון ל־${who.ambiguous.join(" או ")}? תדייק.` };
      }
      if (who.index === -1) {
        const open = openPlayers(state);
        return {
          live: state,
          reply: `${BOT_MARK} לא מצאתי את "${cmd.name}" בשולחן.\nנשארו פתוחים: ${open.map((p) => p.name).join(", ")}`,
        };
      }
      const p = state.players[who.index];
      if (p.cashout !== "" && p.cashout != null) {
        /* שם של מי שכבר סגור = כנראה תיקון. שואלים שוב במקום לדחות —
           טעויות בספירת ג'יטונים מתגלות בדיוק בשלב הזה. */
        state.pending = p.name;
        return {
          live: state,
          reply: `${BOT_MARK} ${p.name} כבר רשום עם ${p.cashout} ג'יטונים — כמה במקום?\n("${p.name} חוזר" מחזיר אותו למשחק)`,
        };
      }
      state.pending = p.name;
      return { live: state, reply: `${BOT_MARK} כמה ג'יטונים ל${p.name}?` };
    }

    // תשובה למה שהבוט שאל. בלי שאלה פתוחה מספר בודד הוא סתם הודעה בקבוצה.
    if (cmd.kind === "answer") {
      if (!state.pending) continue;
      cmd = { kind: "cashout", name: state.pending, chips: cmd.chips };
    }

    if (cmd.kind === "ask") {
      const who = findInState(state, cmd.name, aliases);
      if (who.ambiguous) {
        problems.push(`${cmd.name} → ${who.ambiguous.join(" / ")}`);
        continue;
      }
      if (who.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      state.pending = state.players[who.index].name;
      return { live: state, reply: `${BOT_MARK} כמה ג'יטונים ל${state.pending}?` };
    }

    if (cmd.kind === "entries_left") {
      record.push({ t: "entries", before: state.entriesCount });
      const pot = state.players.reduce((t, p) => t + (+p.buyin || 0), 0);
      const next = r2(pot / 50 + cmd.left);
      state.entriesCount = String(next);
      acks.push(`המלאי תוקן: ${cmd.left} בחוץ · סה״כ ${next} כניסות`);
      continue;
    }

    if (cmd.kind === "entries") {
      record.push({ t: "entries", before: state.entriesCount });
      state.entriesCount = String(cmd.count);
      acks.push(`הוכנו ${cmd.count} כניסות`);
      continue;
    }

    if (cmd.kind === "entries_add") {
      record.push({ t: "entries", before: state.entriesCount });
      const next = (+state.entriesCount || 0) + cmd.delta;
      state.entriesCount = String(next);
      acks.push(`נוספו ${cmd.delta} כניסות · סה״כ ${next}`);
      continue;
    }

    /* החלה־מחדש של פקודת קנייה: אם הביטול נגע בשחקן בשביל החותמת של
       הפקודה הזו, מאתרים אותו בשמו הנוכחי ישירות — בלי findInState,
       שפתרון הכינוי/הרחבת־השם שלו עלולים להחזיר שם ישן או אדם אחר. */
    const rtName = cmd.kind === "add" && sid ? retarget.get(sid) : undefined;
    const rtIdx = rtName ? state.players.findIndex((p) => p.name === rtName) : -1;
    const found =
      rtIdx !== -1 ? { index: rtIdx, resolved: rtName as string } : findInState(state, cmd.name, aliases);
    if (found.ambiguous) {
      problems.push(`${cmd.name} → ${found.ambiguous.join(" / ")}`);
      continue;
    }

    if (cmd.kind === "remove") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      record.push({ t: "remove", name: p.name, at: found.index, player: p });
      state.players.splice(found.index, 1);
      /* הסרה מפרקת גם את ה־pot שהשחקן צבר: savingsPot הוא סכום ה־pot של
         האירועים החיים, ואירועיו של המוסר כבר לא חיים. בלעדיו הקופה
         נשארת מנופחת, ומסירה חוזרת של הודעת היצירה מחזירה את השחקן עם
         קופה כפולה מהאירועים (תצפית גל 2). ביטול ההסרה ב־undo מחזיר
         את ה־pot יחד עם השחקן. */
      const potSum = playerPotSum(p);
      if (potSum) state.savingsPot = r2((Number(state.savingsPot) || 0) - potSum);
      acks.push(`${p.name} ${byGender(p.name, "הוסר", "הוסרה")} מהשולחן`);
      continue;
    }

    if (cmd.kind === "reopen") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      if (p.cashout === "" || p.cashout == null) {
        problems.push(`${p.name} בכלל ${byGender(p.name, "לא סגור", "לא סגורה")}`);
        continue;
      }
      record.push({ t: "out", name: p.name, before: p.cashout });
      state.players[found.index] = { ...p, cashout: "" };
      acks.push(`${p.name} ${byGender(p.name, "חזר", "חזרה")} לשולחן — היציאה בוטלה`);
      continue;
    }

    /* טיפ מג'יטונים של השחקן (לא מהקופה).
       tipsGiven מצטבר לסטטיסטיקה; cashout ב־₪ נשאר כפי שנרשם.
       אם כבר יש cashout מספרי — מורידים מהערימה שנרשמה (הטיפ יצא ממנה).
       שיאי ג'יטונים ביציאה משתמשים ב-cashout אחרי ההורדה. */
    if (cmd.kind === "tip") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      const amount = Math.max(0, +cmd.chips || 0);
      if (!amount) {
        problems.push(`טיפ של 0 לא נספר`);
        continue;
      }
      /* תקרת שפיות (4.5): טיפ לא יכול להיות מובנה כקנייה, ולכן לא
         מנותב לתור האישור (שתוכנו קניות) — נחסם עם הודעה מפורשת.
         התקרה בג'יטונים = התקרה בשקלים × ג'יטונים־לשקל. */
      if (amount > ceilingIls * cps) {
        problems.push(
          `טיפ של ${amount} ג'יטונים ל${p.name} חורג מתקרת השפיות (${ceilingIls * cps}) — לא נרשם. אם זה אמיתי, עדן ירשום ידנית באפליקציה`
        );
        continue;
      }
      const tipId = `${msgId || "tip"}_${record.length}_${Date.now()}`;
      const female = isFemaleName(p.name);
      /* צילום־לפני של השקית שממנה באמת שולפים (גל 4, פריט 4.2): השקית
         חיה במפתח המגדרי (BagM/BagF), עם נפילת־מורשת לזכר כמו בתוך
         nextTipCompliment. הצילום הישן העתיק את שדה המורשת — והביטול
         "שחזר" שדה שאף אחד לא שולף ממנו, בעוד השליפה בפועל נשארה
         צרכנית. bagV:2 מסמן רשומה עם צילום מגדרי מדויק. */
      const bk = tipBagKey(female);
      const lk = tipLastKey(female);
      const bagState = state as unknown as Record<string, unknown>;
      let bagBefore = Array.isArray(bagState[bk]) ? [...(bagState[bk] as number[])] : [];
      if (!bagBefore.length && !female && Array.isArray(state.tipComplimentBag)) {
        bagBefore = [...state.tipComplimentBag];
      }
      const lastBefore =
        (bagState[lk] as number | null | undefined) ??
        (!female ? state.tipComplimentLast : null) ??
        null;
      const { template, bag, last, bagKey, lastKey } = nextTipCompliment(state, { female }) as unknown as {
        template: string;
        bag: number[];
        last: number;
        bagKey: string;
        lastKey: string;
      };
      (state as unknown as Record<string, unknown>)[bagKey] = bag;
      (state as unknown as Record<string, unknown>)[lastKey] = last;
      // תאימות לאחור לשדות הישנים
      if (!female) {
        state.tipComplimentBag = bag;
        state.tipComplimentLast = last;
      }
      const tipsGiven = r2((+p.tipsGiven || 0) + amount);
      let next = { ...p, tipsGiven };
      /* דלתא של היציאה כשהטיפ מוריד ממנה (כמו cashDelta באפליקציה,
         lib/manualTips.js): הביטול מחזיר את הדלתא על הערך הנוכחי, לא
         צילום — תיקון cashout מאוחר יותר לא נדרס. נרשמת רק כשהטיפ באמת
         הוריד מהערימה (קלאמפ ב־0 מקטין את הדלתא). */
      let cashDelta: number | undefined;
      if (p.cashout !== "" && p.cashout != null) {
        const before = +p.cashout || 0;
        const after = Math.max(0, before - amount);
        next.cashout = String(after);
        cashDelta = r2(before - after);
      }
      state.players[found.index] = next;
      state.tips = [...(state.tips || []), { id: tipId, name: p.name, amount, at: Date.now() }];
      record.push({
        t: "tip",
        name: p.name,
        amount,
        tipId,
        bagBefore,
        lastBefore,
        female,
        bagV: 2,
        ...(cashDelta !== undefined ? { cashDelta } : {}),
      });
      // BOT_MARK מתווסף אוטומטית על כל ack
      if (resolveAlias(p.name, aliases) === KOBI) acks.push(KOBI_TIP_OPENER);
      acks.push(formatTipCompliment(template, p.name, amount));
      continue;
    }

    if (cmd.kind === "cashout") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      /* תקרת שפיות (4.5) ליציאה: ערימת הסיום לגיטימית יכולה לעבור את
         תקרת הקנייה הבודדת (כמה ריבאיים מצטברים), ולכן הגבול כאן הוא
         התקרה + כל מה שהשחקן עצמו הכניס. מעבר לזה זו כמעט תמיד אפס
         מיותר בהקלדה — נחסם עם הודעה, לא מוחל. */
      const cashoutIls = (+cmd.chips || 0) / (cps || 1);
      if (cashoutIls > ceilingIls + (+p.buyin || 0)) {
        problems.push(
          `היציאה של ${p.name} (${cmd.chips} ג'יטונים ≈ ${Math.round(cashoutIls)}₪) חורגת מתקרת השפיות — לא נרשמה. אם זה אמיתי, עדן יסגור ידנית באפליקציה`
        );
        continue;
      }
      // סגירה חוזרת = עדכון. דורסים את הערך הקודם ואומרים את זה במפורש
      const wasClosed = p.cashout !== "" && p.cashout != null;
      record.push({ t: "out", name: p.name, before: p.cashout ?? "" });
      const closed = { ...p, cashout: String(cmd.chips) };
      state.players[found.index] = closed;
      if (state.pending === p.name) state.pending = null;
      acks.push(
        `${wasClosed ? "עודכן: " : ""}${p.name} ${byGender(p.name, "יצא", "יצאה")} עם ${cmd.chips} ג\'יטונים · ${settleLine(closed, cps)}`
      );
      continue;
    }

    // הוספה או הפחתה
    if (found.index === -1) {
      if (cmd.amount <= 0) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      /* החלה־מחדש שהביטול הסיר את השחקן לגמרי: יוצרים מחדש בשם הנוכחי
         מהביטול ועוקפים את הסחת־הממתין — השחקן כבר הושב על ידי ההודעה
         הזו עצמה, והשם המתוקן שלו לא חייב להיות ברשימת המוכרים. */
      const name = rtName || found.resolved || resolveAlias(cmd.name, aliases);
      /* תקרת שפיות (4.5): סכום חריג לא מושיב ולא יוצר ממתין רגיל —
         מנותב לתור האישור עם סימון מפורש, גם כשהשם מוכר. */
      if (cmd.amount > ceilingIls) {
        pendForApproval(name, cmd.amount);
        continue;
      }
      const extras = [
        ...(state.players || []).map((p) => p.name),
        ...(state.approvedNames || []),
      ];
      if (!rtName && !isKnownName(name, opts.knownNames, extras, aliases)) {
        const at = now;
        const existing = (state.pendingApprovals || []).find((p) => p.name === name);
        if (existing) {
          /* צילום־לפני של הפריט: הביטול ישחזר amount/at בדיוק. ההתאמה
             הישנה (amount מצטבר מול דלתא) מעולם לא פגעה, ולכן כל מסירה
             חוזרת של הודעת ההגדלה ספרה אותה שוב (ממצא 4). */
          const pendingBefore = { amount: existing.amount, at: existing.at };
          const grown = { ...existing, amount: r2(existing.amount + cmd.amount), at };
          state.pendingApprovals = (state.pendingApprovals || []).map((p) =>
            p === existing ? grown : p,
          );
          record.push({ t: "pending", name, amount: cmd.amount, at, pendingBefore });
          acks.push(`${name} עדיין ממתין לאישור עדן · ${grown.amount}₪`);
        } else {
          state.pendingApprovals = [...(state.pendingApprovals || []), { name, amount: cmd.amount, at }];
          record.push({ t: "pending", name, amount: cmd.amount, at, pendingBefore: null });
          acks.push(`שחקן חדש — מחכה לאישור עדן: ${name} · ${cmd.amount}₪`);
        }
        continue;
      }
      const fresh = { name, buyin: 0, cashout: "", buyinEvents: [] };
      const seated = stampBuyin(state, fresh, cmd.amount, now, sid);
      state.players.push(seated);
      state.startedAt = state.startedAt || Date.now();
      record.push({
        t: "add",
        name,
        delta: cmd.amount,
        created: true,
        ev: stampedEventOf(fresh, seated),
      });
      acks.push(`${name} ${byGender(name, "נכנס", "נכנסה")} ב-${cmd.amount}₪`);
      continue;
    }

    /* מסירה חוזרת של בקשת־ממתין שכבר אושרה והושיבה את השחקן (תצפית
       גל 2): הביטול לא מצא ממתין — הוא נצרך באישור — והחלה רגילה הייתה
       חותמת את סכום הבקשה שוב על השחקן היושב: קנייה כפולה וקופה כפולה
       על אותה בקשה בדיוק. הבקשה כבר מומשה, אז לא נוגעים בכסף; רשומת
       הבקשה המקורית נרשמת מחדש כמו שהיא, כדי שמסירה נוספת של אותה
       הודעה תתנהג שוב בדיוק כך. */
    if (cmd.kind === "add" && prevRecord && found.index !== -1) {
      const seatedPlayer = state.players[found.index];
      const prevPending = prevRecord.find(
        (e) =>
          e.t === "pending" &&
          (e.name === seatedPlayer.name || resolveAlias(e.name || "", aliases) === seatedPlayer.name),
      );
      const stillPending = (state.pendingApprovals || []).some((pp) => pp.name === seatedPlayer.name);
      if (prevPending && !stillPending) {
        record.push(prevPending);
        acks.push(`${seatedPlayer.name} כבר בשולחן · סה״כ ${seatedPlayer.buyin}₪`);
        continue;
      }
    }

    const p = state.players[found.index];
    /* תקרת שפיות (4.5) גם ליושב: תוספת חריגה לא נחתמת — מנותבת לתור
       האישור. הפחתה (סכום שלילי) היא תיקון רישום ולא מוגבלת כאן. */
    if (cmd.amount > ceilingIls) {
      pendForApproval(p.name, cmd.amount);
      continue;
    }
    const next = stampBuyin(state, p, cmd.amount, now, sid);
    const delta = r2((+next.buyin || 0) - (+p.buyin || 0));
    state.players[found.index] = next;
    record.push({ t: "add", name: p.name, delta, ev: stampedEventOf(p, next) });
    acks.push(`${p.name} ${cmd.amount > 0 ? "+" : ""}${cmd.amount}₪ · סה״כ ${next.buyin}₪`);
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
  if (record.some((e) => e.t === "pending")) ownerDm = ownerAskText(state);
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
    record.some((e) => e.t === "out") && state.players.length > 0 && !openPlayers(state).length;
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
