import { getSupabase } from "./supabaseClient";

/**
 * שליחה לקבוצה דרך /api/send בשם המנהל המחובר.
 * זורק שגיאה עם הסבר; err.shareFallback כשנגמרה מכסת Whapi ואפשר לשתף ידנית.
 */
export async function postToGroup(text) {
  const headers = { "Content-Type": "application/json" };
  let token = null;
  try {
    const { data } = await getSupabase().auth.getSession();
    token = data.session?.access_token || null;
  } catch {
    /* בלי לקוח Supabase השרת עדיין מאמת לפי העוגייה — או מחזיר 401 */
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch("/api/send", {
    method: "POST",
    headers,
    body: JSON.stringify({ text }),
  });
  const dataRes = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = [dataRes.error, dataRes.detail].filter(Boolean).join(" — ");
    const err = new Error(msg || "השליחה נכשלה");
    err.code = dataRes.code || null;
    err.shareFallback = dataRes.code === "whapi_quota" || Boolean(dataRes.shareFallback);
    throw err;
  }
  return dataRes;
}
