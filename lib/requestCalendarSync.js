import { getSupabase } from "./supabaseClient";

/**
 * בקשת סנכרון דו-כיווני עם אירוע היומן: תשובות אורחים → אפליקציה,
 * ומסרבים מהאפליקציה מוסרים מהאירוע. מחזיר { synced, removed }.
 */
export async function requestCalendarSync() {
  const headers = { "Content-Type": "application/json" };
  let token = null;
  try {
    const { data } = await getSupabase().auth.getSession();
    const session = data?.session || null;
    token = session ? session.access_token : null;
  } catch {
    /* בלי לקוח Supabase השרת עדיין מאמת לפי העוגייה — או מחזיר 401 */
  }
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch("/api/calendar-sync", { method: "POST", headers });
  const dataRes = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(dataRes.error || "הסנכרון נכשל");
  }
  return dataRes;
}
