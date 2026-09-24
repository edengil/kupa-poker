/* תזכורות אישור ושקט-ביט. מחזירות טקסט וחותמת — בלי קריאת רשת. */

import { BOT_MARK } from "../botMark.js";

const r2 = (v) => Math.round(v * 100) / 100;

export const PENDING_REMIND_MS = 8 * 60 * 1000;
/** כמה זמן בלי עדכון ביט לפני תזכורת (ברירת מחדל: שעתיים). */
export const BIT_IDLE_REMIND_MS = 2 * 60 * 60 * 1000;

function ownerRemindText(state) {
  const list = state.pendingApprovals || [];
  if (!list.length) return null;
  return [
    `${BOT_MARK} תזכורת — עדיין ממתין לאישור`,
    "",
    ...list.map((p) => `• ${p.name} · ${p.amount}₪`),
    "",
    "אשר שם · דחה שם · טעות · לא",
  ].join("\n");
}

function groupPendingNudge(state) {
  const list = state.pendingApprovals || [];
  if (!list.length) return "";
  return `${BOT_MARK} תזכורת: ממתין מחוץ לשולחן — ${list.map((p) => p.name).join(", ")} · אשר / דחה / טעות`;
}

/** חותמת עדכון הביט האחרון: startedAt או buyinEvents.at המאוחר ביותר. */
export function lastBitActivityAt(live) {
  let latest = live?.startedAt || 0;
  for (const p of live?.players || []) {
    for (const e of p.buyinEvents || []) {
      const at = +e?.at || 0;
      if (at > latest) latest = at;
    }
  }
  return latest || null;
}

function ownerBitIdleText(state, now = Date.now()) {
  const players = state?.players || [];
  if (!players.length) return null;
  const pot = r2(players.reduce((t, p) => t + (+p.buyin || 0), 0));
  const last = lastBitActivityAt(state);
  const idleMin = last ? Math.max(1, Math.round((now - last) / 60_000)) : null;
  const idleLabel =
    idleMin == null
      ? ""
      : idleMin >= 120
        ? `${Math.round(idleMin / 60)} שע׳`
        : `${idleMin} דק׳`;
  return [
    `${BOT_MARK} תזכורת — אין עדכון ביט כבר זמן`,
    "",
    `משחק פעיל · ${players.length} שחקנים · קופה ${pot}₪`,
    idleLabel ? `בלי ביט כבר ${idleLabel}` : null,
    "",
    "רשום ביט בקבוצה או באפליקציה.",
  ]
    .filter((line) => line != null)
    .join("\n");
}

function groupBitIdleNudge() {
  return `${BOT_MARK} תזכורת: לא נרשם ביט כבר זמן · יש עדכון?`;
}

/** תזכורת כשיש ממתינים ועבר ה-cooldown. בלי פקודה (שיחה בקבוצה) — רק DM. */
export function maybeRemindPending(live, now = Date.now(), { groupNudge = false } = {}) {
  const pending = live?.pendingApprovals || [];
  if (!pending.length) return null;
  const last = live.pendingRemindedAt || Math.min(...pending.map((p) => p.at || now));
  if (now - last < PENDING_REMIND_MS) return null;
  const next = { ...live, pendingRemindedAt: now };
  return {
    live: next,
    ownerDm: ownerRemindText(next),
    reply: groupNudge ? groupPendingNudge(next) : null,
  };
}

/**
 * תזכורת כשמשחק חי פעיל ואין עדכון ביט זמן רב.
 * בלי פקודה (שיחה בקבוצה) — רק DM; groupNudge מוסיף נדנוד קצר לקבוצה.
 */
export function maybeRemindBitIdle(live, now = Date.now(), { groupNudge = false } = {}) {
  const players = live?.players || [];
  if (!players.length) return null;
  const lastBit = lastBitActivityAt(live);
  if (!lastBit) return null;
  const last = live.bitIdleRemindedAt || lastBit;
  if (now - last < BIT_IDLE_REMIND_MS) return null;
  const next = { ...live, bitIdleRemindedAt: now };
  return {
    live: next,
    ownerDm: ownerBitIdleText(next, now),
    reply: groupNudge ? groupBitIdleNudge() : null,
  };
}

export function decoratePendingReminder(result, now) {
  if (!result) return result;
  const live = result.live;
  if (!live) return result;
  const pending = live.pendingApprovals || [];
  if (!pending.length) {
    if (live.pendingRemindedAt) {
      const cleared = { ...live };
      delete cleared.pendingRemindedAt;
      return { ...result, live: cleared };
    }
    return result;
  }
  if (result.ownerDm) {
    return { ...result, live: { ...live, pendingRemindedAt: now } };
  }
  const last = live.pendingRemindedAt || Math.min(...pending.map((p) => p.at || 0));
  if (now - last < PENDING_REMIND_MS) return result;
  const nudged = { ...live, pendingRemindedAt: now };
  const nudge = groupPendingNudge(nudged);
  return {
    ...result,
    live: nudged,
    ownerDm: ownerRemindText(nudged),
    reply: result.reply ? `${result.reply}\n\n${nudge}` : nudge,
  };
}
