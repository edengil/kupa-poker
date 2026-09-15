import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";
import { runPeriodReports } from "@/lib/runPeriodReports";
import { runPaymentReminders } from "@/lib/runPaymentReminders";

/* ============================================================================
   משימה יומית אחת (Hobby מאפשר cron פעם ביום לכל ביטוי).

   ~10:00 שעון ישראל בקיץ (07:00 UTC):
   1) דוחות חודשי / רבעוני / שנתי שמגיעים + נעיצה לחודש
   2) תזכורת העברות אם יש ערב מאתמול

   ידני: /api/cron-daily?secret=<סוד>
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
