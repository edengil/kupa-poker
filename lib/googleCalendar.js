/* ============================================================================
   Google Calendar API — אירועי ערב פוקר עם סנכרון דו-כיווני.

   - יצירת אירוע אוטומטית בפתיחת ערב, עם כל השחקנים (בעלי אימייל) כאורחים.
     גוגל שולחת להם זימון אוטומטית.
   - קריאת תשובות האורחים (accepted/declined) לסנכרון לאפליקציה.
   - הסרת אורח מהאירוע (כשעונה "לא מגיע" באפליקציה).

   האימות: OAuth2 refresh token במשתני הסביבה של השרת בלבד —
   GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET /
   GOOGLE_CALENDAR_REFRESH_TOKEN. אם חסר — הפיצ'ר כבוי בשקט והמערכת
   נופלת בחזרה לזימוני האימייל הרגילים.
   ============================================================================ */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_API = "https://www.googleapis.com/calendar/v3";
const EVENT_HOURS = 4;

function calEnv() {
  return {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || "",
  };
}

/**
 * קורא refresh token שמור בטבלת calendar_credentials (חיבור דרך האפליקציה).
 * מחזיר null אם אין. גישת שרת בלבד (service role עוקף RLS).
 */
export async function getStoredRefreshToken(groupId) {
  if (!groupId) return null;
  try {
    const { getAdminSupabase } = await import("@/lib/supabaseAdmin");
    const admin = getAdminSupabase();
    const { data } = await admin
      .from("calendar_credentials")
      .select("refresh_token")
      .eq("group_id", groupId)
      .maybeSingle();
    return data?.refresh_token || null;
  } catch {
    return null;
  }
}

/** פותר את ה-refresh token: קודם מה-DB (חיבור דרך האפליקציה), אחר כך מ-env. */
async function resolveRefreshToken(groupId) {
  return (await getStoredRefreshToken(groupId)) || calEnv().refreshToken || "";
}

/** האם החיבור ליומן מוגדר (DB או env). */
export async function calendarConfigured(groupId) {
  const { clientId, clientSecret } = calEnv();
  if (!clientId || !clientSecret) return false;
  return Boolean(await resolveRefreshToken(groupId));
}

async function getAccessToken(groupId) {
  const { clientId, clientSecret } = calEnv();
  const refreshToken = await resolveRefreshToken(groupId);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("calendar_not_configured");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`calendar_token_failed:${res.status}`);
  const json = await res.json();
  if (!json.access_token) throw new Error("calendar_token_empty");
  return json.access_token;
}

async function calFetch(path, { method = "GET", body = null, query = "", groupId = null } = {}) {
  const token = await getAccessToken(groupId);
  const res = await fetch(`${CAL_API}${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : null,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`calendar_api_failed:${res.status}:${text.slice(0, 200)}`);
  }
  return res.json();
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** בונה dateTime מקומי "YYYY-MM-DDTHH:MM:SS" מתוך iso + time. */
export function localDateTime(iso, time) {
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.test(time || "") ? time : "20:00";
  return `${iso}T${t}:00`;
}

/** מוסיף שעות למחרוזת "YYYY-MM-DDTHH:MM:SS" — לחישוב סוף האירוע. */
export function addHours(dateTimeStr, hours) {
  const d = new Date(dateTimeStr);
  if (Number.isNaN(d.getTime())) return null;
  const e = new Date(d.getTime() + hours * 3600 * 1000);
  return `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}T${pad(e.getHours())}:${pad(e.getMinutes())}:00`;
}

/**
 * יוצר אירוע ערב ביומן עם האורחים. גוגל שולחת זימון אוטומטית.
 * @returns {Promise<string>} מזהה האירוע שנוצר.
 */
export async function createEveningEvent({ iso, time, location, title, description, attendeeEmails, groupId = null }) {
  const start = localDateTime(iso, time);
  const end = addHours(start, EVENT_HOURS);
  if (!end) throw new Error("calendar_bad_time");
  const attendees = [...new Set((attendeeEmails || []).filter(Boolean))].map((email) => ({ email }));
  const event = await calFetch("/calendars/primary/events?sendUpdates=all", {
    method: "POST",
    groupId,
    body: {
      summary: title,
      location: location || undefined,
      description: description || undefined,
      start: { dateTime: start, timeZone: "Asia/Jerusalem" },
      end: { dateTime: end, timeZone: "Asia/Jerusalem" },
      attendees,
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: false,
    },
  });
  return event.id;
}

/**
 * מחזיר את תשובות האורחים לאירוע: [{ email, responseStatus }].
 * responseStatus: needsAction | declined | tentative | accepted
 */
export async function getEventAttendeeResponses(eventId, groupId = null) {
  const event = await calFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, { groupId });
  return (event.attendees || []).map((a) => ({
    email: (a.email || "").toLowerCase(),
    responseStatus: a.responseStatus || "needsAction",
  }));
}

/** מוסיף אורחים לאירוע קיים (גוגל שולחת להם זימון). */
export async function addEventAttendees(eventId, emails, groupId = null) {
  const list = [...new Set((emails || []).filter(Boolean))];
  if (!list.length) return;
  const event = await calFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, { groupId });
  const existing = new Set((event.attendees || []).map((a) => (a.email || "").toLowerCase()));
  const toAdd = list.filter((e) => !existing.has(e.toLowerCase()));
  if (!toAdd.length) return;
  await calFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "PATCH",
    groupId,
    body: { attendees: [...(event.attendees || []), ...toAdd.map((email) => ({ email }))] },
  });
}

/** מסיר אורח מאירוע קיים. */
export async function removeEventAttendee(eventId, email, groupId = null) {
  const event = await calFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, { groupId });
  const keep = (event.attendees || []).filter(
    (a) => (a.email || "").toLowerCase() !== String(email).toLowerCase()
  );
  if (keep.length === (event.attendees || []).length) return;
  await calFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "PATCH",
    groupId,
    body: { attendees: keep },
  });
}
