/* ============================================================================
   כתיבת חותמות תזכורת הבוט ללייב — צד שרת (גל 3ב, ממצא 10).

   הסדר הנכון: שולחים קודם, חותמים אחר כך. כאן כותבים רק את שדה החותמת
   האחד (הצלחה או ניסיון) על גבי הלייב הטרי מהשרת דרך CAS — לא את כל
   אובייקט הלייב שצולם בתחילת הבקשה, כדי לא לדרוס מה שהשתנה בינתיים.
   ============================================================================ */

import { updateGroupCas } from "../groupCas.js";

/** איזו תזכורת זו — לפי החותמה שהמועמד נושא (כמו בנתיבים הקיימים).
 * גל 5: גם חותמת ה־DM של ביט־שקט מזהה את הסוג — כשרק רגל ה־DM בשלה,
 * חותמת הקבוצה לא מתעדכנת. */
export function reminderKind(reminded, now) {
  if (
    reminded?.live?.bitIdleRemindedAt === now ||
    reminded?.live?.bitIdleDmRemindedAt === now
  ) {
    return "bit-idle";
  }
  return "pending";
}

const STAMP_FIELD = {
  pending: {
    sent: "pendingRemindedAt",
    attempt: "pendingRemindAttemptAt",
    dmSent: "pendingDmRemindedAt",
    dmAttempt: "pendingDmRemindAttemptAt",
  },
  "bit-idle": {
    sent: "bitIdleRemindedAt",
    attempt: "bitIdleRemindAttemptAt",
    dmSent: "bitIdleDmRemindedAt",
    dmAttempt: "bitIdleDmRemindAttemptAt",
  },
};

/**
 * כותב את חותמת התזכורת על הלייב הטרי. sent=true — רק אחרי שליחה
 * שהצליחה; sent=false — חותמת ניסיון אחרי כשל (מרסנת, לא מסמנת הצלחה).
 * best-effort: מחזיר אם הכתיבה נחתה; לעולם לא זורק.
 */
export async function writeReminderStamp(supabase, groupId, reminded, now, opts = {}) {
  const kind = reminderKind(reminded, now);
  /* גל 5, פריט 5.6: מצב רגליים — legs: { group, dm } עם תוצאה לכל רגל
     (true = נשלחה, false = נכשלה, null/חסר = לא בשלה/לא רלוונטית).
     כל רגל חותמת את שדה ההצלחה/ניסיון שלה בלבד, כך שהצלחה חלקית לא
     שולחת שוב את הרגל שעברה. חותמת הסוג (sent) נכתבת כשהקבוצה הצליחה,
     או כשרגל ה־DM היא היחידה והצליחה (המשמעות ההיסטורית של החותמת:
     "התזכורת הושלמה") — וכשל של רגל כותב גם את חותמת הניסיון של הסוג,
     כמו עד היום. בלי legs — ההתנהגות הישנה בדיוק. */
  if (opts.legs) {
    const fields = STAMP_FIELD[kind];
    const { group, dm } = opts.legs;
    try {
      const res = await updateGroupCas(
        supabase,
        groupId,
        (fresh) => {
          if (!fresh.live || typeof fresh.live !== "object") return null;
          const next = { ...fresh.live };
          let changed = false;
          const stamp = (f) => {
            if (next[f] !== now) {
              next[f] = now;
              changed = true;
            }
          };
          if (group === true) stamp(fields.sent);
          if (group === false) stamp(fields.attempt);
          if (dm === true) {
            stamp(fields.dmSent);
            /* חותמת הסוג מ־DM לבדו — רק כשהנדנוד כלל לא היה בהיקף
               המועמד (תזכורת DM בלבד). נדנוד שהיה בשל אך דולג/נחסם
               (group: null עם legs.group=true במועמד) לא "עבר". */
            if (group == null && !reminded?.legs?.group) stamp(fields.sent);
          }
          if (dm === false) {
            stamp(fields.dmAttempt);
            stamp(fields.attempt);
          }
          return changed ? { live: next } : null;
        },
        { columns: "id, live, updated_at" }
      );
      return { kind, written: Boolean(res.ok && !res.skipped) };
    } catch {
      return { kind, written: false };
    }
  }
  const { sent } = opts;
  const field = STAMP_FIELD[kind][sent ? "sent" : "attempt"];
  try {
    const res = await updateGroupCas(
      supabase,
      groupId,
      (fresh) => {
        if (!fresh.live || typeof fresh.live !== "object") return null;
        if (fresh.live[field] === now) return null;
        return { live: { ...fresh.live, [field]: now } };
      },
      { columns: "id, live, updated_at" }
    );
    /* skipped (החותמת כבר על הלייב הטרי) הוא ok ב־CAS אבל לא כתיבה
       שנחתה — written מדווח רק על כתיבה בפועל (הערת בודק, גל 3ב). */
    return { kind, written: Boolean(res.ok && !res.skipped) };
  } catch {
    return { kind, written: false };
  }
}
