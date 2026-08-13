import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { sendToGroup } from "@/lib/whatsapp";
import { reportError } from "@/lib/monitor";

/* ============================================================================
   שליחת הודעה לקבוצה מתוך האפליקציה.

   הנתיב הזה שולח בשמך בוואטסאפ, ולכן הוא חייב לוודא שזה באמת אתה. הוא לא
   סומך על שום דבר שמגיע מהדפדפן חוץ מעוגיית הסשן: הוא שולף את המשתמש
   מ-Supabase, ומוודא שיש לו קבוצה משלו. בלי זה כל מי שמוצא את הכתובת היה
   יכול לפרסם בקבוצה שלך.
   ============================================================================ */

export const dynamic = "force-dynamic";

const MAX = 4000; // גבול סביר להודעת וואטסאפ

export async function POST(request) {
  const supabase = getServerSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "לא מחובר" }, { status: 401 });
  }

  // RLS כבר מגביל לשורה שלו, אבל בדיקה מפורשת עדיפה על הסתמכות
  const { data: group } = await supabase
    .from("groups")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "אין קבוצה למשתמש הזה" }, { status: 403 });
  }

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
    await sendToGroup(text.trim(), { token, groupId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await reportError(e, "send");
    return NextResponse.json({ error: "השליחה נכשלה" }, { status: 502 });
  }
}
