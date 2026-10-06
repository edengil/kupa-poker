import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabaseServer";

/* ============================================================================
   התחלת חיבור יומן גוגל — מפנה למסך ההסכמה של גוגל.

   רק הבעלים. ה-redirect_uri חייב להיות רשום ב-OAuth client ב-Cloud Console:
   https://kupa-poker.vercel.app/api/calendar/callback
   ============================================================================ */

export const dynamic = "force-dynamic";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SITE = "https://kupa-poker.vercel.app";
const REDIRECT_URI = `${SITE}/api/calendar/callback`;
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"].join(" ");

async function resolveOwnerId(request) {
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  let supabase;
  let user = null;
  if (bearer) {
    supabase = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data } = await supabase.auth.getUser(bearer);
    user = data?.user || null;
  } else {
    supabase = getServerSupabase();
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  }
  if (!user) return null;
  const { data: group } = await supabase
    .from("groups")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  return group?.id || null;
}

export async function GET(request) {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || "";
  if (!clientId) {
    return NextResponse.json({ error: "חיבור יומן לא הוגדר בשרת", code: "no_client" }, { status: 503 });
  }

  // דורש התחברות בעלים — מעביר למסך התחברות אם לא מחובר
  const groupId = await resolveOwnerId(request).catch(() => null);
  if (!groupId) {
    return NextResponse.redirect(`${SITE}/`, 302);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: groupId,
  });
  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    302
  );
}
