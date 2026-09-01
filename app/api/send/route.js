import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
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
   ============================================================================ */

export const dynamic = "force-dynamic";

const MAX = 4000; // גבול סביר להודעת וואטסאפ

async function resolveOwner(request) {
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (bearer) {
    const admin = getAdminSupabase();
    const { data: userData, error } = await admin.auth.getUser(bearer);
    if (error || !userData?.user) return { error: "לא מחובר", status: 401 };
    const { data: group } = await admin
      .from("groups")
      .select("id, config")
      .eq("owner_id", userData.user.id)
      .limit(1)
      .maybeSingle();
    if (!group) return { error: "אין קבוצה למשתמש הזה", status: 403 };
    return { user: userData.user, group, supabase: admin };
  }

  const supabase = getServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "לא מחובר", status: 401 };

  const { data: group } = await supabase
    .from("groups")
    .select("id, config")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!group) return { error: "אין קבוצה למשתמש הזה", status: 403 };
  return { user, group, supabase };
}

export async function POST(request) {
  const auth = await resolveOwner(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { group, supabase } = auth;

  let text;
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "אין טקסט לשלוח" }, { status: 400 });
  }
  if (text.length > MAX) {
    return NextResponse.json({ error: "ההודעה ארוכה מדי" }, { status: 400 });
  }

  const token = process.env.WHAPI_TOKEN;
  const groupId = process.env.WHAPI_GROUP_ID;
  if (!token || !groupId) {
    return NextResponse.json({ error: "הבוט לא מוגדר" }, { status: 503 });
  }

  try {
    const body = text.trim();
    const sent = await sendToGroup(body, { token, groupId });
    if (isNightShareText(body)) {
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
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    await reportError(e, "send");
    return NextResponse.json({ error: "השליחה נכשלה" }, { status: 502 });
  }
}
