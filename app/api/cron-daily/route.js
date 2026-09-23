import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";
import { runPeriodReports } from "@/lib/runPeriodReports";
import { runPaymentReminders } from "@/lib/runPaymentReminders";

/* ============================================================================
   משימה יומית אחת (Hobby מאפשר cron פעם ביום לכל ביטוי).

   ~08:00 שעון ישראל בקיץ (05:00 UTC):
   1) דוחות חודשי / רבעוני / שנתי שמגיעים + נעיצה לחודש
   2) תזכורת חלוקה אם יש ערב מאתמול ועדיין יש העברות פתוחות

   ידני: /api/cron-daily?secret=<סוד>
         /api/cron-daily?secret=<סוד>&forcePay=1
   ============================================================================ */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (!authorizedCron(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const forceReports = new URL(request.url).searchParams.get("force");
  const forcePay = Boolean(new URL(request.url).searchParams.get("forcePay"));

  const reports = await runPeriodReports({ force: forceReports });
  const payments = await runPaymentReminders({ force: forcePay });

  return NextResponse.json({ ok: true, reports, payments });
}
