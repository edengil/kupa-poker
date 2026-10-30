/* ============================================================================
   כתיבת חותמות תזכורת הבוט ללייב — צד שרת (גל 3ב, ממצא 10).

   הסדר הנכון: שולחים קודם, חותמים אחר כך. כאן כותבים רק את שדה החותמת
   האחד (הצלחה או ניסיון) על גבי הלייב הטרי מהשרת דרך CAS — לא את כל
   אובייקט הלייב שצולם בתחילת הבקשה, כדי לא לדרוס מה שהשתנה בינתיים.
   ============================================================================ */

import { updateGroupCas } from "../groupCas.js";

/** איזו תזכורת זו — לפי החותמה שהמועמד נושא (כמו בנתיבים הקיימים). */
export function reminderKind(reminded, now) {
  return reminded?.live?.bitIdleRemindedAt === now ? "bit-idle" : "pending";
}

const STAMP_FIELD = {
  pending: { sent: "pendingRemindedAt", attempt: "pendingRemindAttemptAt" },
  "bit-idle": { sent: "bitIdleRemindedAt", attempt: "bitIdleRemindAttemptAt" },
};

/**
 * כותב את חותמת התזכורת על הלייב הטרי. sent=true — רק אחרי שליחה
 * שהצליחה; sent=false — חותמת ניסיון אחרי כשל (מרסנת, לא מסמנת הצלחה).
 * best-effort: מחזיר אם הכתיבה נחתה; לעולם לא זורק.
 */
export async function writeReminderStamp(supabase, groupId, reminded, now, { sent }) {
  const kind = reminderKind(reminded, now);
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
    return { kind, written: Boolean(res.ok) };
  } catch {
    return { kind, written: false };
  }
}
