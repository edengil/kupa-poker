import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";
import { runPeriodReports } from "@/lib/runPeriodReports";
import { runPaymentReminders } from "@/lib/runPaymentReminders";
import { runNoticeEmails } from "@/lib/runNoticeEmails";
import { runNoticePushes } from "@/lib/runNoticePushes";
import { jerusalemHour } from "@/lib/paymentReminder";

/* ============================================================================
   משימה יומית אחת (Hobby מאפשר cron פעם ביום לכל ביטוי).

   08:00 שעון ישראל כל השנה:
   cron ב־05:00 UTC (קיץ) וב־06:00 UTC (חורף). רץ רק כשהשעה בישראל היא 8.
   1) דוחות חודשי / רבעוני / שנתי שמגיעים + נעיצה לחודש
   2) תזכורת חלוקה כל בוקר כל עוד בערב האחרון נשארו העברות פתוחות
   3) פוש להתראות הפתוחות, ומייל גיבוי אחרי שלוש התעלמויות

   ידני: /api/cron-daily?secret=<סוד>
         /api/cron-daily?secret=<סוד>&forcePay=1
   ============================================================================ */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (!authorizedCron(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const forceReports = new URL(request.url).searchParams.get("force");
  const forcePay = Boolean(new URL(request.url).searchParams.get("forcePay"));
  const hour = jerusalemHour();
  if (hour !== 8 && !forceReports && !forcePay) {
    return NextResponse.json({ ok: true, skipped: "not 08:00 Israel", hour });
  }

  const reports = await runPeriodReports({ force: forceReports });
  const payments = await runPaymentReminders({ force: forcePay });
  const notices = await runNoticeEmails();
  const pushes = await runNoticePushes();

  return NextResponse.json({ ok: true, reports, payments, notices, pushes });
}
