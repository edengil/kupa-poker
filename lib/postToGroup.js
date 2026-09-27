import { getSupabase } from "./supabaseClient";

/**
 * שליחה לקבוצה דרך /api/send בשם המנהל המחובר.
 * זורק שגיאה עם הסבר; err.shareFallback כשנגמרה מכסת Whapi ואפשר לשתף ידנית.
 */
export async function postToGroup(text) {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = { "Content-Type": "application/json" };
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
    err.shareFallback = dataRes.code === "whapi_quota" || Boolean(dataRes.shareFallback);
    throw err;
  }
  return dataRes;
}
