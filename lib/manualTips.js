/* הוספת טיפ ידנית מהאפליקציה — גיבוי למצב שהבוט בוואטסאפ נפל.
   משקף אחד־לאחד את סמנטיקת הבוט (lib/wa/apply.js, גוש cmd.kind === "tip"):
   אירוע נכנס ליומן הטיפים של הערב, tipsGiven מצטבר על השחקן, ואם ה־cashout
   כבר מספרי — הטיפ יורד מהערימה (מינימום 0), כי הטיפ יצא ממנה.
   אין כאן הכרזות לקבוצה ואין שינוי בהתחשבנות — tipsGiven כבר זורם לערב השמור. */

import { livePlayerKey, tipsSumByPlayer } from "./liveMerge.js";
import { DEFAULT_ALIASES } from "./poker/helpers.js";

const r2 = (v) => Math.round(v * 100) / 100;

let idSeq = 0;
/** מזהה ייחודי לאירוע מהאפליקציה. קידומת app_ לא מתנגשת עם מזהי הבוט
    (מזהי הודעות וואטסאפ או "tip_..."), והמיזוג לפי מזהה מונע כפילות. */
export function newManualTipId(now = Date.now()) {
  idSeq = (idSeq + 1) % 1000000;
  const rand = Math.floor(Math.random() * 0xffffff).toString(36);
  return `app_${now.toString(36)}_${idSeq.toString(36)}_${rand}`;
}

export function isManualTip(t) {
  return !!t && t.src === "app";
}

/** אירועי הטיפ של שחקן אחד הערב, בסדר כרונולוגי. */
export function playerTipEvents(tips, name, aliases = DEFAULT_ALIASES) {
  const key = livePlayerKey(name, aliases);
  return (tips || [])
    .filter((t) => t && livePlayerKey(t.name, aliases) === key)
    .sort((a, b) => (+a.at || 0) - (+b.at || 0));
}

/**
 * מוסיף טיפ ידני לשחקן. מחזיר { ok:true, players, tips, event }
 * או { ok:false, reason } — reason: "zero" (סכום 0/ריק/שלילי) · "missing" (לא בשולחן).
 * אם ה־cashout מספרי, האירוע מסומן fromCashout עם cashDelta = כמה באמת ירד,
 * כדי שמחיקה תחזיר בדיוק את אותו סכום (גם כשהערימה קטנה מהטיפ).
 */
export function applyManualTip({ players, tips, name, amount, aliases = DEFAULT_ALIASES, now = Date.now() }) {
  const amt = +amount || 0;
  if (!amt || amt <= 0) return { ok: false, reason: "zero" };
  const key = livePlayerKey(name, aliases);
  const idx = (players || []).findIndex((p) => livePlayerKey(p.name, aliases) === key);
  if (idx === -1) return { ok: false, reason: "missing" };
  const p = players[idx];
  const event = { id: newManualTipId(now), name: key, amount: amt, at: now, src: "app" };
  const next = { ...p };
  if (p.cashout !== "" && p.cashout != null) {
    const before = +p.cashout || 0;
    const after = Math.max(0, before - amt);
    next.cashout = String(after);
    event.fromCashout = true;
    event.cashDelta = r2(before - after);
  }
  const nextTips = [...(tips || []), event];
  const logSum = tipsSumByPlayer(nextTips, aliases).get(key) || 0;
  /* כמו הבוט: מצטבר על tipsGiven; לא יורד מתחת לסכום היומן אם כבר היו אירועים */
  next.tipsGiven = Math.max(r2((+p.tipsGiven || 0) + amt), logSum);
  return {
    ok: true,
    players: (players || []).map((x, j) => (j === idx ? next : x)),
    tips: nextTips,
    event,
  };
}

/**
 * מוחק אירוע טיפ ידני (רק src:"app"; אירוע בוט הוא קריאה בלבד).
 * מחזיר { ok:true, players, tips, event } או { ok:false, reason } —
 * reason: "missing" (אין אירוע כזה) · "bot_event".
 */
export function removeManualTip({ players, tips, tipId, aliases = DEFAULT_ALIASES }) {
  const ev = (tips || []).find((t) => t && t.id === tipId);
  if (!ev) return { ok: false, reason: "missing" };
  if (!isManualTip(ev)) return { ok: false, reason: "bot_event" };
  const nextTips = (tips || []).filter((t) => t.id !== tipId);
  const key = livePlayerKey(ev.name, aliases);
  const idx = (players || []).findIndex((p) => livePlayerKey(p.name, aliases) === key);
  let nextPlayers = players || [];
  if (idx !== -1) {
    const p = nextPlayers[idx];
    const next = { ...p };
    if (ev.fromCashout && p.cashout !== "" && p.cashout != null) {
      next.cashout = String((+p.cashout || 0) + (ev.cashDelta ?? ev.amount));
    }
    const logSum = tipsSumByPlayer(nextTips, aliases).get(key) || 0;
    next.tipsGiven = Math.max(logSum, r2((+p.tipsGiven || 0) - (+ev.amount || 0)));
    nextPlayers = nextPlayers.map((x, j) => (j === idx ? next : x));
  }
  return { ok: true, players: nextPlayers, tips: nextTips, event: ev };
}
