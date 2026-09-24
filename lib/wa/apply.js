/* החלת פקודות על ערב חי. לא שולח לוואטסאפ — רק מצב ותשובה אחת. */

import { buildReport, settleLine, netOf, CPS, partitionByNet } from "../report.js";
import { nextTipCompliment, formatTipCompliment } from "../tipCompliments.js";
import { isFemaleName } from "../settlement.js";
import { tipSummaryForSession } from "../nightShare.js";
import { BOT_MARK } from "../botMark.js";
import { assignPodiumMedals } from "../podiumMedals.js";
import { buildLiveClosingInvite } from "../settlementInvite.js";
import { ALIASES, aliasesOf, resolveAlias, findPlayer, READ_ONLY } from "./parse.js";
import { decoratePendingReminder } from "./reminders.js";

const r2 = (v) => Math.round(v * 100) / 100;

/** CTA / הזמנה לחלוקה באפליקציה — בלי רשימת העברות בקבוצה. */
function siteFromCmds(cmds) {
  const hit = (cmds || []).find((c) => c.siteUrl && c.slug);
  return hit ? { siteUrl: hit.siteUrl, slug: hit.slug } : {};
}

function closingInvite(state, cps, cmds, headline) {
  return buildLiveClosingInvite(state, cps, { ...siteFromCmds(cmds), headline });
}

function knownSetOf(list) {
  if (!list) return null;
  if (list instanceof Set) return list.size ? list : null;
  if (Array.isArray(list)) return list.length ? new Set(list) : null;
  return null;
}

function isKnownName(raw, known, extra = [], aliases = ALIASES) {
  const set = knownSetOf(known);
  if (!set) return true; // בלי רשימה (בדיקות ישנות) — לא חוסמים
  const trimmed = String(raw || "").trim();
  const name = resolveAlias(trimmed, aliases);
  const pool = new Set([...set, ...extra].map((n) => resolveAlias(n, aliases)));
  if (pool.has(name) || pool.has(trimmed)) return true;
  if (name.length < 2) return false;
  const hits = [...pool].filter((n) => n.startsWith(name) || name.startsWith(n));
  return hits.length === 1;
}

function pickPending(list, rawName, aliases = ALIASES) {
  if (!list.length) return -1;
  if (!rawName) return list.length === 1 ? 0 : -2; // -2 = צריך לדייק
  const name = resolveAlias(rawName, aliases);
  const exact = list.findIndex(
    (p) => p.name === name || p.name === rawName || resolveAlias(p.name, aliases) === name
  );
  if (exact !== -1) return exact;
  const starts = list
    .map((p, i) => (p.name.startsWith(name) || name.startsWith(p.name) ? i : -1))
    .filter((i) => i !== -1);
  if (starts.length === 1) return starts[0];
  return -1;
}

/** מרחיב שם קצר בשולחן לשם המלא מהכינויים — בלי לדרוס מישהו אחר. */
function expandSeatedName(state, index, canonical, aliases) {
  if (index < 0 || !canonical) return;
  const current = state.players[index]?.name;
  if (!current || current === canonical) return;
  if (state.players.some((p, i) => i !== index && p.name === canonical)) return;
  const aliased = resolveAlias(current, aliases) === canonical;
  const prefix =
    canonical.startsWith(current + " ") || current.startsWith(canonical + " ");
  if (!aliased && !prefix) return;
  renameEverywhere(state, current, canonical);
}

function findInState(state, rawName, aliases) {
  const found = findPlayer(state.players, rawName, aliases);
  if (found.index !== -1 && found.resolved) {
    expandSeatedName(state, found.index, found.resolved, aliases);
  }
  return found;
}

function stampBuyin(player, delta, at = Date.now()) {
  if (!(delta > 0)) return player;
  const events = [...(player.buyinEvents || [])];
  events.push({ amount: delta, at, total: r2(+player.buyin || 0) });
  return { ...player, buyinEvents: events };
}

/* --------------------------- החלת הפקודות ---------------------------
   כל הודעה נרשמת ב-live.applied לפי מזהה ההודעה, יחד עם מה שהיא עשתה.
   זה פותר שני דברים בבת אחת:

   עריכה — הודעה שנערכה מגיעה עם אותו מזהה. מבטלים את מה שהיא עשתה קודם
   ומחילים מחדש את הגרסה החדשה.

   כפילות — Whapi חוזרת לפעמים על שליחה שנכשלה. בלי הרישום הזה כניסה
   הייתה נספרת פעמיים, וזה באג ששקט ומגלים אותו רק בסוף הערב.
   -------------------------------------------------------------------- */

function blank(live) {
  return {
    entriesCount: live?.entriesCount ?? "",
    addAmt: live?.addAmt || 50,
    startedAt: live?.startedAt || null,
    players: [...(live?.players || [])],
    applied: { ...(live?.applied || {}) },
    pending: live?.pending ?? null,
    closing: live?.closing ?? false, // סגירה מודרכת בעיצומה
    pendingApprovals: [...(live?.pendingApprovals || [])],
    approvedNames: [...(live?.approvedNames || [])],
    pendingRemindedAt: live?.pendingRemindedAt ?? null,
    bitIdleRemindedAt: live?.bitIdleRemindedAt ?? null,
    /* טיפים: יוצאים מערימת השחקן. tipsGiven על השחקן + יומן tips.
       tipComplimentBag — שקית מחמאות בלי חזרה ברצף. */
    tips: [...(live?.tips || [])],
    tipComplimentBag: Array.isArray(live?.tipComplimentBag) ? [...live.tipComplimentBag] : [],
    tipComplimentLast: live?.tipComplimentLast ?? null,
    coupleFills: [...(live?.coupleFills || [])],
  };
}

const openPlayers = (state) => state.players.filter((p) => p.cashout === "" || p.cashout == null);

/** מבטל את מה שהודעה קודמת עם אותו מזהה כבר עשתה. */
function undo(state, entries) {
  for (const e of [...entries].reverse()) {
    const i = state.players.findIndex((p) => p.name === e.name);
    if (i === -1) continue;
    if (e.t === "add") {
      if (e.created) state.players.splice(i, 1);
      else state.players[i] = { ...state.players[i], buyin: r2((+state.players[i].buyin || 0) - e.delta) };
    } else if (e.t === "out") {
      state.players[i] = { ...state.players[i], cashout: e.before };
    } else if (e.t === "tip") {
      const tipsGiven = Math.max(0, r2((+state.players[i].tipsGiven || 0) - e.amount));
      state.players[i] = { ...state.players[i], tipsGiven };
      if (e.tipId != null) {
        state.tips = (state.tips || []).filter((t) => t.id !== e.tipId);
      }
      if (e.bagBefore) {
        state.tipComplimentBag = e.bagBefore;
        state.tipComplimentLast = e.lastBefore ?? null;
      }
    } else if (e.t === "pending") {
      state.pendingApprovals = (state.pendingApprovals || []).filter(
        (p) => !(p.name === e.name && p.amount === e.amount && p.at === e.at)
      );
    } else if (e.t === "approve") {
      const j = state.players.findIndex((p) => p.name === e.name);
      if (e.created && j !== -1) state.players.splice(j, 1);
      if (e.pending) state.pendingApprovals = [...(state.pendingApprovals || []), e.pending];
      state.approvedNames = (state.approvedNames || []).filter((n) => n !== e.name);
    } else if (e.t === "rename") {
      renameEverywhere(state, e.to, e.from);
    }
  }
  // הסרה מוחזרת בסוף, אחרי שכל השאר חזר למקומו
  for (const e of [...entries].reverse()) {
    if (e.t === "remove") state.players.splice(e.at, 0, e.player);
    if (e.t === "entries") state.entriesCount = e.before;
  }
}

/** מחליף שם בכל מקומות הלייב של ערב פעיל (שולחן, ממתינים, טיפים…). */
function renameEverywhere(state, from, to) {
  for (const p of state.players || []) {
    if (p.name === from) p.name = to;
  }
  if (state.pending === from) state.pending = to;
  state.pendingApprovals = (state.pendingApprovals || []).map((p) =>
    p.name === from ? { ...p, name: to } : p
  );
  state.approvedNames = (state.approvedNames || []).map((n) => (n === from ? to : n));
  state.tips = (state.tips || []).map((t) => (t.name === from ? { ...t, name: to } : t));
  state.coupleFills = (state.coupleFills || []).map((c) => {
    if (!c || typeof c !== "object") return c;
    const next = { ...c };
    if (next.name === from) next.name = to;
    if (next.a === from) next.a = to;
    if (next.b === from) next.b = to;
    return next;
  });
}

export function applyCommands(live, cmds, msgId, cps = CPS, opts = {}) {
  const now = opts.now ?? Date.now();
  return decoratePendingReminder(applyCommandsCore(live, cmds, msgId, cps, { ...opts, now }), now);
}

function applyCommandsCore(live, cmds, msgId, cps = CPS, opts = {}) {
  const now = opts.now ?? Date.now();
  const aliases = aliasesOf(opts);
  const state = blank(live);
  const report = () =>
    buildReport({ players: state.players, entriesCount: state.entriesCount, startedAt: state.startedAt, cps });

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
    const pot = r2(state.players.reduce((t, p) => t + (+p.buyin || 0), 0));
    state.closing = false;
    return {
      live: state,
      reply: closingInvite(state, cps, cmds, "חשבון סופי"),
    };
  }

  if (msgId && state.applied[msgId]) {
    undo(state, state.applied[msgId]);
    delete state.applied[msgId];
  }

  const record = [];
  const acks = [];
  const problems = [];

  for (let cmd of cmds) {
    if (READ_ONLY.has(cmd.kind)) continue;

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
        acks.push(`${item.name} נדחה — לא נכנס לשולחן`);
        continue;
      }
      const already = findInState(state, item.name, aliases);
      if (already.index !== -1) {
        const p = state.players[already.index];
        const buyin = r2((+p.buyin || 0) + item.amount);
        state.players[already.index] = stampBuyin({ ...p, buyin }, item.amount, now);
        record.push({ t: "approve", name: p.name, pending: item, created: false });
        if (!state.approvedNames.includes(p.name)) state.approvedNames.push(p.name);
        acks.push(`${p.name} אושר · +${item.amount}₪ · סה״כ ${buyin}₪`);
        continue;
      }
      const seated = {
        name: resolveAlias(item.name, aliases),
        buyin: item.amount,
        cashout: "",
        buyinEvents: [{ amount: item.amount, at: now, total: item.amount }],
      };
      state.players.push(seated);
      state.startedAt = state.startedAt || Date.now();
      if (!state.approvedNames.includes(seated.name)) state.approvedNames.push(seated.name);
      record.push({ t: "approve", name: seated.name, pending: item, created: true });
      acks.push(`${seated.name} אושר · נכנס ב-${item.amount}₪`);
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

    const found = findInState(state, cmd.name, aliases);
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
      acks.push(`${p.name} הוסר מהשולחן`);
      continue;
    }

    if (cmd.kind === "reopen") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      if (p.cashout === "" || p.cashout == null) {
        problems.push(`${p.name} בכלל לא סגור`);
        continue;
      }
      record.push({ t: "out", name: p.name, before: p.cashout });
      state.players[found.index] = { ...p, cashout: "" };
      acks.push(`${p.name} חזר לשולחן — היציאה בוטלה`);
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
      const tipId = `${msgId || "tip"}_${record.length}_${Date.now()}`;
      const bagBefore = [...(state.tipComplimentBag || [])];
      const lastBefore = state.tipComplimentLast;
      const female = isFemaleName(p.name);
      const { template, bag, last, bagKey, lastKey } = nextTipCompliment(state, { female });
      state[bagKey] = bag;
      state[lastKey] = last;
      // תאימות לאחור לשדות הישנים
      if (!female) {
        state.tipComplimentBag = bag;
        state.tipComplimentLast = last;
      }
      const tipsGiven = r2((+p.tipsGiven || 0) + amount);
      let next = { ...p, tipsGiven };
      if (p.cashout !== "" && p.cashout != null) {
        next.cashout = String(Math.max(0, (+p.cashout || 0) - amount));
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
      });
      // BOT_MARK מתווסף אוטומטית על כל ack
      acks.push(formatTipCompliment(template, p.name, amount));
      continue;
    }

    if (cmd.kind === "cashout") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      // סגירה חוזרת = עדכון. דורסים את הערך הקודם ואומרים את זה במפורש
      const wasClosed = p.cashout !== "" && p.cashout != null;
      record.push({ t: "out", name: p.name, before: p.cashout ?? "" });
      const closed = { ...p, cashout: String(cmd.chips) };
      state.players[found.index] = closed;
      if (state.pending === p.name) state.pending = null;
      acks.push(
        `${wasClosed ? "עודכן: " : ""}${p.name} יצא עם ${cmd.chips} ג\'יטונים · ${settleLine(closed, cps)}`
      );
      continue;
    }

    // הוספה או הפחתה
    if (found.index === -1) {
      if (cmd.amount <= 0) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const name = found.resolved || resolveAlias(cmd.name, aliases);
      const extras = [
        ...(state.players || []).map((p) => p.name),
        ...(state.approvedNames || []),
      ];
      if (!isKnownName(name, opts.knownNames, extras, aliases)) {
        const at = now;
        const existing = (state.pendingApprovals || []).find((p) => p.name === name);
        if (existing) {
          existing.amount = r2(existing.amount + cmd.amount);
          existing.at = at;
          record.push({ t: "pending", name, amount: cmd.amount, at });
          acks.push(`${name} עדיין ממתין לאישור עדן · ${existing.amount}₪`);
        } else {
          state.pendingApprovals = [...(state.pendingApprovals || []), { name, amount: cmd.amount, at }];
          record.push({ t: "pending", name, amount: cmd.amount, at });
          acks.push(`שחקן חדש — מחכה לאישור עדן: ${name} · ${cmd.amount}₪`);
        }
        continue;
      }
      const seated = {
        name,
        buyin: cmd.amount,
        cashout: "",
        buyinEvents: [{ amount: cmd.amount, at: now, total: cmd.amount }],
      };
      state.players.push(seated);
      state.startedAt = state.startedAt || Date.now();
      record.push({ t: "add", name, delta: cmd.amount, created: true });
      acks.push(`${name} נכנס ב-${cmd.amount}₪`);
      continue;
    }

    const p = state.players[found.index];
    const buyin = Math.max(0, r2((+p.buyin || 0) + cmd.amount));
    const delta = r2(buyin - (+p.buyin || 0));
    let next = { ...p, buyin };
    if (delta > 0) next = stampBuyin(next, delta, now);
    state.players[found.index] = next;
    record.push({ t: "add", name: p.name, delta });
    acks.push(`${p.name} ${cmd.amount > 0 ? "+" : ""}${cmd.amount}₪ · סה״כ ${buyin}₪`);
  }

  if (!acks.length && !problems.length) return { live, reply: null };

  if (msgId) state.applied[msgId] = record;
  state.ts = Date.now();
  /* ביט חדש מאפס את תזכורת השקט — השעון מתחיל מחדש מפעילות אמיתית. */
  if (record.some((e) => e.t === "add" || e.t === "approve")) {
    delete state.bitIdleRemindedAt;
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

  /* סגירה מודרכת: אחרי כל סגירה שואלים מי הבא, וכשנסגר האחרון —
     החשבון הסופי יוצא לקבוצה לבד, בלי שביקשו "סיכום" שוב. */
  if (state.closing) {
    const open = openPlayers(state);
    if (!open.length) {
      state.closing = false;
      state.pending = null;
      return {
        live: state,
        reply: `${head}\n\n${closingInvite(state, cps, cmds, "כולם סגורים! חשבון סופי")}`,
        ownerDm,
      };
    }
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

function ownerAskText(state) {
  const list = state.pendingApprovals || [];
  if (!list.length) return null;
  return [
    `${BOT_MARK} שחקן חדש מחכה לאישור`,
    "",
    ...list.map((p) => `• ${p.name} · ${p.amount}₪`),
    "",
    "אשר שם",
    "דחה שם · טעות · לא",
    "אפשר גם בקבוצה.",
  ].join("\n");
}

/** תאימות לאחור — פקודה בודדת. */
export function applyCommand(live, cmd, cps = CPS) {
  return applyCommands(live, [cmd], null, cps);
}

/* --------------------------- תמונת מצב ---------------------------
   מה שאי אפשר לקרוא מרשימת הביט לבד: כמה עוד בשולחן, כמה מהמלאי יצא,
   וכמה זמן משחקים.
   ---------------------------------------------------------------- */
function snapshot(state, cps = CPS) {
  const ps = state.players;
  const closed = ps.filter((p) => p.cashout !== "" && p.cashout != null);
  const pot = r2(ps.reduce((t, p) => t + (+p.buyin || 0), 0));
  const prepared = state.entriesCount === "" || state.entriesCount == null ? null : +state.entriesCount || 0;

  // רק מה שאין בדוח שמתחתיו — התאריך, השעון ומונה הכניסות כבר שם
  const rows = [
    `${ps.length} שחקנים · ${ps.length - closed.length} בשולחן · ${closed.length} סגרו`,
    `קופה ${pot}₪ · ${r2(pot * cps)} ג'יטונים`,
  ];
  if (prepared !== null && prepared - pot / 50 <= 3) rows.push(`⚠️ נשארו ${r2(prepared - pot / 50)} כניסות בלבד`);
  if (state.pending) rows.push(`⏳ מחכה לג'יטונים של ${state.pending}`);
  return rows.join("\n");
}

/* ------------------------ מצב ביניים בסגירה ------------------------
   נשלח עם "סיום משחק" ואחרי כל שחקן שנסגר: כמה כל אחד נכנס, מי כבר סגור
   ועם מה, ומי עוד פתוח — כדי שאפשר יהיה להמשיך בלי לגלול אחורה. */
function closingStatus(state, cps = CPS) {
  const pot = r2(state.players.reduce((t, p) => t + (+p.buyin || 0), 0));
  const netWord = (p) => {
    const net = netOf(p, cps);
    if (net === 0) return "סגר באפס";
    return net > 0 ? `מגיע ${net}₪` : `חייב ${-net}₪`;
  };
  const { winners, even, losers, open } = partitionByNet(state.players, cps);
  const closedLine = (x) =>
    `✅ ${x.p.name} · נכנס ${r2(+x.p.buyin || 0)}₪ · יצא ${r2(+x.p.cashout || 0)} ג׳ · ${netWord(x.p)}`;
  const openLine = (p) => `⏳ ${p.name} · נכנס ${r2(+p.buyin || 0)}₪`;
  const groups = [
    winners.map(closedLine),
    even.map(closedLine),
    losers.map(closedLine),
    open.map(openLine),
  ].filter((g) => g.length);
  const lines = groups.flatMap((g, i) => (i ? ["", ...g] : g));
  return [`קופה ${pot}₪ · ${r2(pot * cps)} ג'יטונים`, ...lines].join("\n");
}

/* -------------------------- חשבון סופי --------------------------
   זוכים קודם (הגדול קודם + מדליות 1–3), אחריהם מי שסגר באפס, ובסוף
   החייבים (החוב הקטן קודם, הגדול אחרון) — עם שורת רווח בין הקבוצות.
   בסוף בלוק טיפים: שבח למי שנתן, צחוק על מי שלא. */
function settleSummary(state, cps = CPS) {
  const withNet = state.players.map((p) => ({ p, net: netOf(p, cps) }));
  const winSorted = withNet.filter((x) => x.net > 0).sort((a, b) => b.net - a.net);
  const win = assignPodiumMedals(winSorted, (x) => x.net).map(({ item: x, medal }) => {
    const line = settleLine(x.p, cps);
    return medal ? `${medal} ${line}` : line;
  });
  const even = withNet.filter((x) => x.net === 0).map((x) => settleLine(x.p, cps));
  /* חייבים: חוב קטן קודם (−50 לפני −150) */
  const owe = withNet
    .filter((x) => x.net < 0)
    .sort((a, b) => b.net - a.net)
    .map((x) => settleLine(x.p, cps));
  const body = [win, even, owe].filter((g) => g.length).map((g) => g.join("\n")).join("\n\n");

  const tipLines = tipSummaryForSession(state, withNet);
  if (!tipLines) return body;
  return `${body}\n\n${tipLines}`;
}

/* ------------------------------ עזרה ------------------------------ */
export function helpText() {
  return [
    `${BOT_MARK} מה אני יודע לעשות`,
    "",
    "כניסה 💰",
    "כמה פקודות בהודעה אחת — שורה לכל פקודה, תשובה אחת",
    "*דן 50* — הכי מהיר (כשמשחק פעיל)",
    "דן עוד 50 · דן נכנס 50",
    "דן עוד — סכום ברירת המחדל",
    "",
    "סגירת שחקן 🎯",
    "*דן יצא 300* — יצא עם 300 ג'יטונים",
    "דן יצא — ואז אשאל כמה",
    "",
    "טיפים 💸",
    "*אופיר טיפ 10* — טיפ מג'יטונים (מהערימה שלו)",
    "אופיר נתן טיפ 10 · אופיר 10 טיפ",
    "",
    "סיום הערב 🏁",
    "*סיום משחק* / *סיכום* / *שלח סיכום* —",
    "מראה מי נכנס בכמה ומי עוד פתוח,",
    "וסוגרים אחד־אחד עד חשבון סופי אוטומטי",
    "בטל סיום — יציאה מהסגירה",
    "",
    "מצב 📊",
    "*קופה* — תמונת מצב של השולחן",
    "לינק — הקישור לצפייה",
    "",
    "תיקונים 🛠",
    "דן פחות 50 — ביטול כניסה",
    "הסר דן — הסרת שחקן",
    "*תקן אופיר → אופיר סנה* — תיקון שם בלייב",
    "תקן אופיר ל-אופיר סנה · תקן אופיר -> אופיר סנה",
    "*דן יצא 350* — תיקון ג'יטונים אחרי סגירה (דורס)",
    "דן חוזר — ביטול יציאה, חוזר לשולחן",
    "",
    "מלאי כניסות",
    "כניסות 30 · עוד 5 כניסות",
    "נשארו 3 כניסות — תיקון המונה למה שבקופסה",
    "",
    "בוט (רק המנהל)",
    "בוט · בוט הדלק · בוט כבה",
    "",
    "שחקן חדש",
    "אשר שם · דחה שם · טעות · לא",
    "שם לא מוכר מחכה בחוץ עד שאישור — הבוט מזכיר אם שכחת",
  ].join("\n");
}
