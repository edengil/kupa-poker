import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { sendToGroup } from "@/lib/whatsapp";
import { dueReports, buildPeriodReport } from "@/lib/summary";
import { reportError } from "@/lib/monitor";

/* ============================================================================
   הדוחות התקופתיים לקבוצה.

   ה-cron של Vercel קורא לכאן פעם בחודש (ב-1 בבוקר שעון ישראל), והנתיב מחליט
   לבד מה מגיע לשלוח: חודשי תמיד, רבעוני אחרי סוף רבעון, חצי-שנתי ביולי
   ובינואר, ושנתי בינואר. מה שכבר נשלח מסומן ב-config ולא נשלח שוב — כך
   שגם הרצה ידנית כפולה לא תציף את הקבוצה.

   בדיקה ידנית:  /api/reports?secret=<הסוד>&force=m   (או q / h / y)
   ============================================================================ */

export const dynamic = "force-dynamic";

function authorized(request) {
  const url = new URL(request.url);
  const qs = url.searchParams.get("secret");
  const header = request.headers.get("authorization") || "";
  return (
    (Boolean(process.env.WHATSAPP_WEBHOOK_SECRET) && qs === process.env.WHATSAPP_WEBHOOK_SECRET) ||
    (Boolean(process.env.CRON_SECRET) && header === `Bearer ${process.env.CRON_SECRET}`)
  );
}

export async function GET(request) {
  if (!authorized(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const force = new URL(request.url).searchParams.get("force");
  // התאריך מוכרע לפי שעון ישראל, לא לפי השרת — אחרת דוח של ה-1 בחודש
  // עלול להישלח ב-31 בערב
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const due = dueReports(now, force);
  if (!due.length) return NextResponse.json({ ok: true, due: [] });

  const supabase = getAdminSupabase();
  const { data: row, error } = await supabase
    .from("groups")
    .select("id, data, config")
    .eq("slug", process.env.KUPA_GROUP_SLUG)
    .single();
  if (error || !row) return NextResponse.json({ error: "no group" }, { status: 500 });

  const groupId = process.env.WHAPI_GROUP_ID;
  if (!groupId) return NextResponse.json({ error: "WHAPI_GROUP_ID missing" }, { status: 500 });

  const sent = { ...(row.config?.sentReports || {}) };
  const results = [];

  for (const rep of due) {
    if (!force && sent[rep.key]) {
      results.push({ key: rep.key, skipped: "already sent" });
      continue;
    }
    const text = buildPeriodReport(row.data, rep);
    if (!text) {
      results.push({ key: rep.key, skipped: "no sessions" });
      continue;
    }
    try {
      await sendToGroup(text, { token: process.env.WHAPI_TOKEN, groupId });
      sent[rep.key] = true;
      results.push({ key: rep.key, sent: true });
    } catch (e) {
      await reportError(e, `reports/send ${rep.key}`);
      results.push({ key: rep.key, error: e.message });
    }
  }

  await supabase
    .from("groups")
    .update({ config: { ...(row.config || {}), sentReports: sent } })
    .eq("id", row.id);

  return NextResponse.json({ ok: true, results });
}
