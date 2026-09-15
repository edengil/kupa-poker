import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { sendToGroup } from "@/lib/whatsapp";
import { dueReports, buildPeriodReport } from "@/lib/summary";
import { reportError } from "@/lib/monitor";
import { authorizedCron } from "@/lib/cronAuth";
import {
  normalizePins,
  pinAfterSend,
  pinTypeForReportKind,
} from "@/lib/waPins";

/* ============================================================================
   הדוחות התקופתיים לקבוצה.

   Vercel Cron קורא לכאן כל יום (~08:00 שעון ישראל בקיץ).
   חודשי — כל חודש (סיכום החודש הקודם), ננעץ לחודש.
   רבעוני — בינואר/אפריל/יולי/אוקטובר.
   שנתי (+חצי שנתי) — בינואר.

   מה שכבר נשלח מסומן ב-config.sentReports — בלי כפילות, עם השלמה אם פספסנו את ה-1.

   בדיקה: /api/reports?secret=<סוד>&force=m   (או q / h / y)
   ============================================================================ */

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!authorizedCron(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const force = new URL(request.url).searchParams.get("force");
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

  const token = process.env.WHAPI_TOKEN;
  const sent = { ...(row.config?.sentReports || {}) };
  let pins = normalizePins(row.config?.pins);
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
      const out = await sendToGroup(text, { token, groupId });
      sent[rep.key] = true;
      const pinType = pinTypeForReportKind(rep.kind);
      if (pinType) {
        await pinAfterSend(pinType, out, { key: rep.key }, {
          token,
          pins,
          savePins: async (next) => {
            pins = next;
          },
        });
      }
      results.push({ key: rep.key, sent: true, pinned: Boolean(pinType) });
    } catch (e) {
      await reportError(e, `reports/send ${rep.key}`);
      results.push({ key: rep.key, error: e.message });
    }
  }

  await supabase
    .from("groups")
    .update({ config: { ...(row.config || {}), sentReports: sent, pins } })
    .eq("id", row.id);

  return NextResponse.json({ ok: true, results });
}
