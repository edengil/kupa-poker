import { getSupabase } from "../supabaseClient";

function groupSlugFromBrowser() {
  if (typeof window === "undefined") return null;
  const m = String(window.location.pathname || "").match(/\/g\/([^/]+)/);
  if (m) return decodeURIComponent(m[1]);
  try {
    const row = JSON.parse(localStorage.getItem("poker:cache:group") || "null");
    return row?.slug || null;
  } catch {
    return null;
  }
}

/* גל 6 (6.2): התראות־הבונוס בודקות res.ok ומדווחות לקונסול — כשל שרת
   שקט (500 עם גוף תקין) היה נראה עד היום כמו הצלחה. */
async function bonusFetch(path, payload, token) {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.warn(`bonus notify failed: ${path} → ${res.status}`);
  }
  return res;
}

/** שולח לכל שחקן פוש אישי עם ההעברות שלו אחרי סגירת ערב. */
export async function notifyTransfersSettlement(sessionId) {
  const slug = groupSlugFromBrowser();
  if (!slug || !sessionId) return;
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await bonusFetch(
      "/api/notify-transfers",
      { slug, sessionId, action: "settlement" },
      token
    );
  } catch {
    /* פוש הוא בונוס — לא חוסם */
  }
}

/** שחקן אישר תשלום — מתריע למנהל המחובר. */
export async function notifyPaymentConfirmed(sessionId, { transferIndex, payerName, payeeName, amount }) {
  const slug = groupSlugFromBrowser();
  if (!slug || !sessionId || !payerName) return;
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await bonusFetch(
      "/api/notify-transfers",
      { slug, sessionId, action: "paid", transferIndex, payerName, payeeName, amount },
      token
    );
  } catch {
    /* פוש הוא בונוס — לא חוסם */
  }
}
