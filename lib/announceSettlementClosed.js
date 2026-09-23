import { getSupabase } from "./supabaseClient";

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

/** מבקש מהשרת להודיע לקבוצה אם כל ההעברות בערב סומנו. */
export async function announceSettlementClosed(sessionId) {
  const slug = groupSlugFromBrowser();
  if (!slug || !sessionId) return;
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch("/api/settlement-closed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ slug, sessionId }),
  });
}
