/* תזכורות אישור ושקט-ביט. מחזירות טקסט וחותמת — בלי קריאת רשת. */

import { BOT_MARK } from "../botMark.js";

const r2 = (v) => Math.round(v * 100) / 100;

export const PENDING_REMIND_MS = 8 * 60 * 1000;
/** כמה זמן בלי עדכון ביט לפני תזכורת (ברירת מחדל: שעתיים). */
export const BIT_IDLE_REMIND_MS = 2 * 60 * 60 * 1000;

/* תווית ממתין לתזכורת הבעלים — לפי סוג הפעולה (גל 4ב): קנייה בשקלים,
   טיפ/יציאה בג'יטונים (לא ₪), עם סימון החריגה. */
function remindLine(p) {
  if (p.op === "tip") return `• ${p.name} · טיפ ${p.amount} ג'יטונים — מעל תקרת השפיות`;
  if (p.op === "cashout") return `• ${p.name} · יציאה ${p.amount} ג'יטונים — מעל תקרת השפיות`;
  return `• ${p.name} · ${p.amount}₪`;
}

function ownerRemindText(state) {
  const list = state.pendingApprovals || [];
  if (!list.length) return null;
  return [
    `${BOT_MARK} תזכורת — עדיין ממתין לאישור`,
    "",
    ...list.map(remindLine),
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

/* בשלות פר־רגל (גל 5, פריט 5.6) — מודל אפיזודה:
   האפיזודה מתחילה ב־base0 (הממתין הוותיק / פעילות הביט האחרונה).
   רגל שכבר הצליחה באפיזודה הזו (חותמת הצלחה ≥ base0) לא מוצעת שוב —
   "הצלחה חלקית לא שולחת שוב את הרגל שעברה אחרי cooldown"; הרגל
   החסרה חוזרת אחרי ה־cooldown שלה, כשחותמת הניסיון מרסנת ניסיון
   חוזר אחרי כשל (גל 3ב) ולא דוחה תזכורת ראשונה. רק כשכל הרגליים
   בהיקף הצליחו באפיזודה, הקצב חוזר להיות הרגיל: ירי חוזר כל
   cooldown מחותמת ההצלחה של כל רגל, כמו לפני הגל. חותמות מורשת
   (לפני הגל) נופלות לחותמת הסוג: הצלחה ישנה סימנה שליחה של שתי
   הרגליים, וניסיון ישן מרסן את שתיהן. */
function legsDue({ group, dm }, base0, now, cooldownMs, groupInScope) {
  const sentOf = (leg) => (leg === "group" ? group.sent : dm.sent);
  const scope = groupInScope ? ["group", "dm"] : ["dm"];
  const complete = scope.every((leg) => {
    const s = sentOf(leg);
    return s != null && s >= base0;
  });
  const due = (leg) => {
    const { sent, attempt } = leg === "group" ? group : dm;
    if (complete) {
      return now - Math.max(sent || 0, attempt || 0, base0) >= cooldownMs;
    }
    if (sent != null && sent >= base0) return false;
    return now - Math.max(base0, attempt || 0) >= cooldownMs;
  };
  return { group: groupInScope && due("group"), dm: due("dm") };
}

/** תזכורת כשיש ממתינים ועבר ה-cooldown. בלי פקודה (שיחה בקבוצה) — רק DM.
 * מחזיר שתי צורות מצב (גל 3ב, ממצא 10): live = חותמת "נשלח" — נכתבת רק
 * אחרי שליחה שהצליחה בפועל; attemptLive = חותמת ניסיון בלבד — נכתבת
 * כשהשליחה נכשלה, כדי שהניסיון הבא יחכה cooldown ולא יציף ערוץ פג,
 * אבל גם לא יסומן כהצלחה בשקר. בדיקת הבשלות מתחשבת בשתי החותמות.
 * גל 5, פריט 5.6: הבשלות והחותמות פר־רגל (legs) — לרגל ה־DM חותמות
 * משלה; ה־live של המועמד חותם רק את הרגליים הבשלות. */
export function maybeRemindPending(live, now = Date.now(), { groupNudge = false } = {}) {
  const pending = live?.pendingApprovals || [];
  if (!pending.length) return null;
  const oldest = Math.min(...pending.map((p) => p.at || now));
  const legs = legsDue(
    {
      group: { sent: live.pendingRemindedAt ?? null, attempt: live.pendingRemindAttemptAt },
      dm: {
        /* נפילת מורשת לחותמת הסוג רק כשאין שום חותמת פר־רגל: חותמת
           ניסיון של ה־DM מוכיחה שהרגליים כבר נמדדות בנפרד, ואז הצלחת
           קבוצה בלבד (חותמת הסוג) היא לא הצלחת DM. */
        sent:
          live.pendingDmRemindedAt ??
          (live.pendingDmRemindAttemptAt == null ? live.pendingRemindedAt : null) ??
          null,
        attempt: live.pendingDmRemindAttemptAt ?? live.pendingRemindAttemptAt,
      },
    },
    oldest,
    now,
    PENDING_REMIND_MS,
    groupNudge
  );
  if (!legs.dm && !legs.group) return null;
  const next = { ...live };
  if (legs.group) next.pendingRemindedAt = now;
  if (legs.dm) next.pendingDmRemindedAt = now;
  if (legs.dm && !groupNudge) next.pendingRemindedAt = now;
  const attemptLive = { ...live };
  if (legs.group) attemptLive.pendingRemindAttemptAt = now;
  if (legs.dm) attemptLive.pendingDmRemindAttemptAt = now;
  if (legs.group || legs.dm) attemptLive.pendingRemindAttemptAt = now;
  return {
    live: next,
    attemptLive,
    ownerDm: ownerRemindText(next),
    reply: groupNudge ? groupPendingNudge(next) : null,
    legs,
  };
}

/**
 * תזכורת כשמשחק חי פעיל ואין עדכון ביט זמן רב.
 * בלי פקודה (שיחה בקבוצה) — רק DM; groupNudge מוסיף נדנוד קצר לקבוצה.
 * גל 5, פריט 5.6: בשלות וחותמות פר־רגל, כמו בתזכורת הממתינים.
 */
export function maybeRemindBitIdle(live, now = Date.now(), { groupNudge = false } = {}) {
  const players = live?.players || [];
  if (!players.length) return null;
  const lastBit = lastBitActivityAt(live);
  if (!lastBit) return null;
  const legs = legsDue(
    {
      group: { sent: live.bitIdleRemindedAt ?? null, attempt: live.bitIdleRemindAttemptAt },
      dm: {
        /* נפילת מורשת לחותמת הסוג רק כשאין שום חותמת פר־רגל (כמו
           בתזכורת הממתינים). */
        sent:
          live.bitIdleDmRemindedAt ??
          (live.bitIdleDmRemindAttemptAt == null ? live.bitIdleRemindedAt : null) ??
          null,
        attempt: live.bitIdleDmRemindAttemptAt ?? live.bitIdleRemindAttemptAt,
      },
    },
    lastBit,
    now,
    BIT_IDLE_REMIND_MS,
    groupNudge
  );
  if (!legs.dm && !legs.group) return null;
  const next = { ...live };
  if (legs.group) next.bitIdleRemindedAt = now;
  if (legs.dm) next.bitIdleDmRemindedAt = now;
  if (legs.dm && !groupNudge) next.bitIdleRemindedAt = now;
  const attemptLive = { ...live };
  if (legs.group) attemptLive.bitIdleRemindAttemptAt = now;
  if (legs.dm) attemptLive.bitIdleDmRemindAttemptAt = now;
  if (legs.group || legs.dm) attemptLive.bitIdleRemindAttemptAt = now;
  return {
    live: next,
    attemptLive,
    ownerDm: ownerBitIdleText(next, now),
    reply: groupNudge ? groupBitIdleNudge() : null,
    legs,
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
