import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { reportError } from "@/lib/monitor";

/* ============================================================================
   Callback של OAuth — גוגל מפנה לכאן אחרי אישור.
   מחליף code בטוקנים, שומר את ה-refresh_token בטבלת calendar_credentials
   (גישת שרת בלבד, RLS חוסם קליינטים), ומציג דף אישור.
   ============================================================================ */

export const dynamic = "force-dynamic";

const SITE = "https://kupa-poker.vercel.app";
const REDIRECT_URI = `${SITE}/api/calendar/callback`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function htmlPage(title, body) {
  return new NextResponse(
    `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>` +
      `<body style="font-family:system-ui;background:#0f2c1e;color:#f5efe0;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;padding:20px;text-align:center">` +
      `<div style="max-width:420px">${body}</div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const error = url.searchParams.get("error") || "";
  const groupId = url.searchParams.get("state") || "";

  if (error || !code) {
    return htmlPage("החיבור נכשל", `<h1>❌ החיבור נכשל</h1><p>גוגל לא אישרה את החיבור (${error || "no_code"}). נסו שוב.</p><p><a href="/" style="color:#d4a017">חזרה לאפליקציה</a></p>`);
  }

  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    return htmlPage("שגיאת שרת", `<h1>❌ שגיאת שרת</h1><p>הגדרות היומן חסרות בשרת.</p>`);
  }

  let tokens;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`token_exchange:${res.status}`);
    tokens = await res.json();
  } catch (e) {
    await reportError(e, "calendar-callback/exchange");
    return htmlPage("החיבור נכשל", `<h1>❌ החיבור נכשל</h1><p>החלפת הקוד בטוקן נכשלה. נסו שוב.</p><p><a href="/" style="color:#d4a017">חזרה לאפליקציה</a></p>`);
  }

  if (!tokens.refresh_token) {
    return htmlPage("החיבור נכשל", `<h1>❌ החיבור נכשל</h1><p>גוגל לא החזירה refresh token. נסו שוב (ודאו שבחרתם לאשר).</p><p><a href="/" style="color:#d4a017">חזרה לאפליקציה</a></p>`);
  }

  if (!groupId) {
    return htmlPage("החיבור נכשל", `<h1>❌ החיבור נכשל</h1><p>מזהה קבוצה חסר. התחילו שוב מהאפליקציה.</p>`);
  }

  try {
    const admin = getAdminSupabase();
    const { error: upErr } = await admin.from("calendar_credentials").upsert(
      {
        group_id: groupId,
        refresh_token: tokens.refresh_token,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "group_id" }
    );
    if (upErr) throw upErr;
  } catch (e) {
    await reportError(e, "calendar-callback/store");
    return htmlPage("שגיאת שרת", `<h1>❌ שגיאת שרת</h1><p>שמירת החיבור נכשלה. נסו שוב.</p>`);
  }

  return htmlPage(
    "היומן חובר ✅",
    `<h1>✅ היומן חובר בהצלחה!</h1><p>מעכשיו כל ערב שתפתחו ייצור אוטומטית אירוע ביומן גוגל עם השחקנים כאורחים.</p><p><a href="/" style="color:#d4a017">חזרה לאפליקציה</a></p>`
  );
}
