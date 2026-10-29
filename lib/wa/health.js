/* ============================================================================
   מצב ערוץ הוואטסאפ (Whapi) — לוגיקה טהורה, בלי תלויות שרת.

   רקע: ב־24.10.2026 ערוץ ה־Whapi פג והבוט שתק שעות בלי שאיש ידע. עדן החליט
   להישאר על הערוץ החינמי המוגבל, ולכן הסטטוס נגזר מאירועי השליחה עצמם:
   כל שליחה (הצלחה או כשל) מעדכנת את config.botHealth של הקבוצה דרך
   healthServer.recordWaSend, והמנהל רואה במסך הלייב אם הערוץ חי לפי
   האירוע האחרון ומתי נרשם כשל אחרון.

   הקובץ הזה חייב להישאר נקי מייבוא־שרת — גם BotToggle (לקוח) משתמש בו.
   ============================================================================ */

/** מצב התחלתי: עוד לא נרשם שום אירוע שליחה. */
export function emptyBotHealth() {
  return {
    lastOkAt: null,
    lastFailAt: null,
    lastFailError: null,
    lastFailWhere: null,
    lastFailCode: null,
    lastFailHint: null,
    fails: 0,
    updatedAt: null,
  };
}

const MAX_ERROR_TEXT = 200;

/**
 * מקפל אירוע שליחה אחד לתוך מצב הערוץ.
 * evt: { ok: boolean, error?: unknown, where?: string, code?: string, hint?: string }
 * now: חותמת זמן (ms) — מוזרקת כדי שהפונקציה תישאר טהורה וניתנת לבדיקה.
 */
export function applyWaEvent(prev, evt, now) {
  const base = { ...emptyBotHealth(), ...(prev || {}) };
  if (evt?.ok) {
    return {
      ...base,
      lastOkAt: now,
      fails: 0,
      updatedAt: now,
    };
  }
  const raw = evt?.error instanceof Error ? evt.error.message : String(evt?.error ?? "");
  return {
    ...base,
    lastFailAt: now,
    lastFailError: raw.slice(0, MAX_ERROR_TEXT) || null,
    lastFailWhere: evt?.where || null,
    lastFailCode: evt?.code || null,
    lastFailHint: evt?.hint || null,
    fails: (base.fails || 0) + 1,
    updatedAt: now,
  };
}

/**
 * תצוגת סטטוס למנהל: state נגזר מהאירוע האחרון בלבד —
 * "down" אם הכשל האחרון מאוחר מההצלחה האחרונה, "up" אם ההפך,
 * "unknown" אם עוד לא נרשם אירוע.
 */
export function botHealthView(health) {
  const h = { ...emptyBotHealth(), ...(health || {}) };
  let state = "unknown";
  if (h.lastFailAt != null && (h.lastOkAt == null || h.lastFailAt >= h.lastOkAt)) {
    state = "down";
  } else if (h.lastOkAt != null) {
    state = "up";
  }
  return { state, ...h };
}

/** "עכשיו" / "לפני 5 דק׳" / "לפני 3 שע׳" / "לפני יומיים" / תאריך קצר. */
export function formatAgoHe(ts, now = Date.now()) {
  if (ts == null) return "";
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? "לפני שעה" : `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "לפני יום";
  if (days < 7) return `לפני ${days} ימים`;
  try {
    return new Date(ts).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}
