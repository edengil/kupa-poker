import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { sendToGroup } from "@/lib/whatsapp";
import { reportError } from "@/lib/monitor";
import {
  jerusalemYmd,
  isPaymentReminderWindow,
  sessionsDueForPaymentReminder,
  buildPaymentReminderText,
  siteUrlFromEnv,
  PAYMENT_REMINDER_HOUR,
} from "@/lib/paymentReminder";

/* ============================================================================
   תזכורת ביום שאחרי המשחק ב־10:00 שעון ישראל — לינק לסימון העברות.

   דוגמה: שיחקנו חמישי → שישי ב־10 בבוקר (רק אם נשארו העברות פתוחות).
   בימים בלי ערב אתמול — לא נשלחת הודעה.

   Vercel cron ב־07:00 ו־08:00 UTC (חורף/קיץ) + בדיקת שעה מקומית.
   dedup ב־config.sentPaymentReminders לפי מזהה הערב.

   בדיקה: /api/payment-reminders?secret=<סוד>&force=1
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

  const force = Boolean(new URL(request.url).searchParams.get("force"));
  const today = jerusalemYmd();
  if (!isPaymentReminderWindow(new Date(), { force })) {
    return NextResponse.json({
      ok: true,
      today,
      skipped: "not reminder hour",
      hour: PAYMENT_REMINDER_HOUR,
      results: [],
    });
  }

  const supabase = getAdminSupabase();
  const slug = process.env.KUPA_GROUP_SLUG;
  const { data: row, error } = await supabase
    .from("groups")
    .select("id, data, config, slug")
    .eq("slug", slug)
    .single();
  if (error || !row) return NextResponse.json({ error: "no group" }, { status: 500 });

  const groupId = process.env.WHAPI_GROUP_ID;
  const token = process.env.WHAPI_TOKEN;
  if (!groupId || !token) {
    return NextResponse.json({ error: "WHAPI missing" }, { status: 500 });
  }

  const sent = { ...(row.config?.sentPaymentReminders || {}) };
  const due = sessionsDueForPaymentReminder(row.data?.sessions, today, {
    force,
    alreadySent: sent,
  });

  if (!due.length) {
    return NextResponse.json({ ok: true, today, due: [], results: [] });
  }

  const siteUrl = siteUrlFromEnv();
  const results = [];

  for (const { session, check } of due) {
    const text = buildPaymentReminderText(session, check.unpaid, {
      siteUrl,
      slug: row.slug || slug,
    });
    try {
      await sendToGroup(text, { token, groupId });
      sent[session.id] = today;
      results.push({ id: session.id, iso: session.iso, sent: true });
    } catch (e) {
      await reportError(e, `payment-reminders/send ${session.id}`);
      results.push({ id: session.id, error: e.message });
    }
  }

  await supabase
    .from("groups")
    .update({ config: { ...(row.config || {}), sentPaymentReminders: sent } })
    .eq("id", row.id);

  return NextResponse.json({ ok: true, today, results });
}
