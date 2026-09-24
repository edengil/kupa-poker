/* שליחה ל-Whapi. תיקון שליחה או מכסת נוכחות נוגע רק בקובץ הזה. */

const WHAPI_BASE = "https://gate.whapi.cloud";

/* ---------------------------- שליחה ל-Whapi ---------------------------- */
export async function sendToGroup(text, { token, groupId }) {
  const res = await fetch(`${WHAPI_BASE}/messages/text`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: groupId, body: text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Whapi send failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const out = await res.json().catch(() => ({}));
  // שליחה עלולה לסמן online — מאפסים, אבל עם throttle גלובלי (ראו למטה).
  await setPresenceOffline(token);
  return out;
}

/* ------------------------------------------------------------------
   סטטוס "לא מחובר" ל-WhatsApp.

   כשערוץ ה-API מדווח נוכחות online, וואטסאפ מניח שאתה פעיל במכשיר אחר
   ומפסיק לשלוח התראות דחיפה לטלפון.

   Sandbox של Whapi מוגבל ל־~1,000 קריאות API בחודש. בעבר כל שליחה של הבוט
   עשתה גם PUT /presences/me — בערב פעיל זה הכפיל את הצריכה ושרף את המכסה.
   עכשיו יש throttle גלובלי לכל הקוראים (שליחה + webhook + setup).
   ------------------------------------------------------------------ */
let lastPresenceReset = 0;
/** מרווח מינימלי בין איפוסי נוכחות — חוסך מכסת API בלי לפגוע בהתראות. */
export const PRESENCE_THROTTLE_MS = 10 * 60 * 1000;

/** לטסטים בלבד — מאפס את שעון ה־throttle. */
export function resetPresenceThrottleForTests() {
  lastPresenceReset = 0;
}

export async function setPresenceOffline(token, { force = false } = {}) {
  if (!token) return { skipped: "no_token" };
  const now = Date.now();
  if (!force && now - lastPresenceReset < PRESENCE_THROTTLE_MS) {
    return { skipped: "throttled" };
  }
  lastPresenceReset = now;
  try {
    const res = await fetch(`${WHAPI_BASE}/presences/me`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ presence: "offline" }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listGroups(token) {
  const res = await fetch(`${WHAPI_BASE}/groups?count=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Whapi groups failed (${res.status})`);
  return res.json();
}
