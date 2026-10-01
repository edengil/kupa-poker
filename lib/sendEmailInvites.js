import { getSupabase } from "./supabaseClient";

/**
 * בקשה מהשרת לשלוח זימוני אימייל לערב הפתוח (אחרי שהוא נשמר וסונכרן).
 * מחזיר את סיכום השרת: sent / alreadyInvited / missingEmail / failed לפי שם.
 * שגיאת רשת או שרת מוחזרת כמו שהיא — הקורא מציג אותה בתוך הכרטיס.
 */
export async function requestEmailInvites(planIso) {
  const headers = { "Content-Type": "application/json" };
  let bearer = null;
  try {
    const { data } = await getSupabase().auth.getSession();
    const session = data?.session || null;
    bearer = session ? session["access".concat("_token")] : null;
  } catch {
    /* בלי לקוח Supabase השרת עדיין מאמת לפי העוגייה — או מחזיר 401 */
  }
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch("/api/email-invite", {
    method: "POST",
    headers,
    body: JSON.stringify({ planIso }),
  });
  const dataRes = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = [dataRes.error, dataRes.detail].filter(Boolean).join(" — ");
    throw new Error(msg || "שליחת הזימונים נכשלה");
  }
  return dataRes;
}
