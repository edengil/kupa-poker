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

/** שולח לכל שחקן פוש אישי עם ההעברות שלו אחרי סגירת ערב. */
export async function notifyTransfersSettlement(sessionId) {
  const slug = groupSlugFromBrowser();
  if (!slug || !sessionId) return;
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/notify-transfers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ slug, sessionId, action: "settlement" }),
    });
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
    await fetch("/api/notify-transfers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ slug, sessionId, action: "paid", transferIndex, payerName, payeeName, amount }),
    });
  } catch {
    /* פוש הוא בונוס — לא חוסם */
  }
}
