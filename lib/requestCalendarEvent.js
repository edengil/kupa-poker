import { getSupabase } from "./supabaseClient";

/**
 * בקשה מהשרת ליצור אירוע יומן גוגל לערב הפתוח (אחרי שהוא נשמר וסונכרן).
 * אם היומן לא מחובר — מחזיר { configured: false } והקורא נופל בחזרה לאימייל.
 */
export async function requestCalendarEvent(planIso) {
  const headers = { "Content-Type": "application/json" };
  let Bearer <redacted> null;
  try {
    const { data } = await getSupabase().auth.getSession();
    const session = data?.session || null;
    Bearer <redacted> session ? session["access".concat("_token")] : null;
  } catch {
    /* בלי לקוח Supabase השרת עדיין מאמת לפי העוגייה — או מחזיר 401 */
  }
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch("/api/calendar-event", {
    method: "POST",
    headers,
    body: JSON.stringify({ planIso }),
  });
  const dataRes = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = [dataRes.error, dataRes.detail].filter(Boolean).join(" — ");
    throw new Error(msg || "יצירת האירוע ביומן נכשלה");
  }
  return dataRes;
}
