import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabaseServer";
import { sendToGroup } from "@/lib/whatsapp";
import { reportError } from "@/lib/monitor";
import {
  isNightShareText,
  nightIsoFromText,
  pinAfterSend,
  normalizePins,
} from "@/lib/waPins";

/* ============================================================================
   שליחת הודעה לקבוצה מתוך האפליקציה.

   הנתיב הזה שולח בשמך בוואטסאפ, ולכן הוא חייב לוודא שזה באמת אתה.
   תומך גם בעוגיית סשן וגם ב-Bearer (אמין יותר במובייל / PWA).
   עם Bearer משתמשים בלקוח של המשתמש עצמו — בלי מפתח אדמין.
   ============================================================================ */

export const dynamic = "force-dynamic";

const MAX = 4000; // גבול סביר להודעת וואטסאפ
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function userClientFromBearer(bearer) {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${bearer}` },
      fetch: (url, opts = {}) => fetch(url, { ...opts, cache: "no-store" }),
    },
  });
}

async function resolveOwner(request) {
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearer) {
    try {
      const supabase = userClientFromBearer(bearer);
      const { data: userData, error } = await supabase.auth.getUser(bearer);
      if (error || !userData?.user) {
        return { error: "לא מחובר — התחבר מחדש", status: 401, code: "auth" };
      }
      const { data: group, error: gErr } = await supabase
        .from("groups")
        .select("id, config")
        .eq("owner_id", userData.user.id)
        .limit(1)
        .maybeSingle();
      if (gErr) {
        return { error: "שגיאת מסד נתונים", status: 500, code: "db", detail: gErr.message };
      }
      if (!group) {
        return { error: "אין קבוצה למשתמש הזה", status: 403, code: "no_group" };
      }
      return { user: userData.user, group, supabase };
    } catch (e) {
      return {
        error: "אימות נכשל",
        status: 500,
        code: "auth_crash",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const supabase = getServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "לא מחובר — התחבר מחדש", status: 401, code: "auth" };
  }

  const { data: group, error: gErr } = await supabase
    .from("groups")
    .select("id, config")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  if (gErr) {
    return { error: "שגיאת מסד נתונים", status: 500, code: "db", detail: gErr.message };
  }
  if (!group) {
    return { error: "אין קבוצה למשתמש הזה", status: 403, code: "no_group" };
  }
  return { user, group, supabase };
}

export async function POST(request) {
  let auth;
  try {
    auth = await resolveOwner(request);
  } catch (e) {
    await reportError(e, "send/auth");
    return NextResponse.json(
      { error: "אימות נכשל", code: "auth_crash" },
      { status: 500 }
    );
  }
  if (auth.error) {
    return NextResponse.json(
      { error: auth.error, code: auth.code, detail: auth.detail },
      { status: auth.status }
    );
  }
  const { group, supabase } = auth;

  let text;
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה", code: "bad_json" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "אין טקסט לשלוח", code: "empty" }, { status: 400 });
  }
  if (text.length > MAX) {
    return NextResponse.json({ error: "ההודעה ארוכה מדי", code: "too_long" }, { status: 400 });
  }

  const token = process.env.WHAPI_TOKEN;
  const groupId = process.env.WHAPI_GROUP_ID;
  if (!token || !groupId) {
    return NextResponse.json(
      {
        error: "שליחה לוואטסאפ לא מוגדרת בשרת (חסר טוקן או מזהה קבוצה)",
        code: "whapi_env",
      },
      { status: 503 }
    );
  }

  try {
    const body = text.trim();
    const sent = await sendToGroup(body, { token, groupId });
    if (isNightShareText(body)) {
      try {
        await pinAfterSend(
          "night",
          sent,
          { iso: nightIsoFromText(body) },
          {
            token,
            pins: normalizePins(group.config?.pins),
            savePins: async (pins) => {
              await supabase
                .from("groups")
                .update({ config: { ...(group.config || {}), pins } })
                .eq("id", group.id);
            },
          }
        );
      } catch (pinErr) {
        // ההודעה כבר יצאה — נעיצה היא בונוס, לא סיבה להגיד למשתמש שנכשל
        await reportError(pinErr, "send/pin");
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    await reportError(e, "send");
    const raw = e instanceof Error ? e.message : String(e);
    // מצב Whapi נפוץ: 401 = טוקן מת, 404 = מזהה קבוצה לא תקין
    let hint = "השליחה לקבוצה נכשלה";
    if (/\(401\)/.test(raw)) hint = "טוקן הוואטסאפ לא תקף — צריך לחדש ב־Whapi";
    else if (/\(403\)/.test(raw)) hint = "אין הרשאה לשלוח לקבוצה בוואטסאפ";
    else if (/\(404\)/.test(raw)) hint = "מזהה הקבוצה בוואטסאפ לא נמצא";
    else if (/\(429\)/.test(raw)) hint = "יותר מדי שליחות — נסה שוב בעוד דקה";
    return NextResponse.json(
      { error: hint, code: "whapi_send", detail: raw.slice(0, 180) },
      { status: 502 }
    );
  }
}
