import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { updateGroupCas } from "@/lib/groupCas";
import { sendToGroup } from "@/lib/whatsapp";
import { trackWaSend } from "@/lib/wa/healthServer";
import { reportError } from "@/lib/monitor";
import {
  jerusalemYmd,
  isPaymentReminderWindow,
  sessionsDueForPaymentReminder,
  buildPaymentReminderText,
  siteUrlFromEnv,
  PAYMENT_REMINDER_HOUR,
} from "@/lib/paymentReminder";
import { computePaymentSpeed } from "@/lib/poker/paymentSpeed";

/** תזכורת העברות בכל בוקר (~08:00 ישראל) כל עוד נשארו העברות פתוחות. */
export async function runPaymentReminders({ force = false } = {}) {
  const today = jerusalemYmd();
  if (!isPaymentReminderWindow(new Date(), { force })) {
    return {
      ok: true,
      today,
      skipped: "not reminder hour",
      hour: PAYMENT_REMINDER_HOUR,
      results: [],
    };
  }

  const supabase = getAdminSupabase();
  const slug = process.env.KUPA_GROUP_SLUG;
  const { data: row, error } = await supabase
    .from("groups")
    .select("id, data, config, slug")
    .eq("slug", slug)
    .single();
  if (error || !row) return { ok: false, error: "no group" };

  const groupId = process.env.WHAPI_GROUP_ID;
  const token = process.env.WHAPI_TOKEN;
  if (!groupId || !token) return { ok: false, error: "WHAPI missing" };

  const sent = { ...(row.config?.sentPaymentReminders || {}) };
  /* התאמה אישית לפי מהירות התשלום ההיסטורית של כל חייב */
  const paymentStats = computePaymentSpeed(row.data || {}).byName;
  const due = sessionsDueForPaymentReminder(row.data?.sessions, today, {
    force,
    alreadySent: sent,
    paymentStats,
  });

  if (!due.length) {
    return { ok: true, today, due: [], results: [] };
  }

  const siteUrl = siteUrlFromEnv();
  const results = [];

  for (const { session, check } of due) {
    const text = buildPaymentReminderText(session, check.unpaid, {
      siteUrl,
      slug: row.slug || slug,
      paymentStats,
    });
    try {
      await trackWaSend(
        { supabase, groupId: row.id, where: `payment-reminders/${session.id}` },
        () => sendToGroup(text, { token, groupId })
      );
      sent[session.id] = today;
      results.push({ id: session.id, iso: session.iso, sent: true });
    } catch (e) {
      await reportError(e, `payment-reminders/send ${session.id}`);
      results.push({ id: session.id, error: e.message });
    }
  }

  /* כתיבת החותמות דרך CAS על config טרי (גל 3ב): חותמת שלא נחתה לא
     מדווחת כהצלחה — התזכורות פשוט יישלחו שוב מחר, והכשל נרשם. */
  const stampRes = await updateGroupCas(
    supabase,
    row.id,
    (fresh) => ({
      config: {
        ...(fresh.config || {}),
        sentPaymentReminders: { ...(fresh.config?.sentPaymentReminders || {}), ...sent },
      },
    }),
    { columns: "id, config, updated_at" }
  ).catch(() => null);
  if (!stampRes?.ok) {
    await reportError(new Error("payment reminder stamps did not land"), "payment-reminders/stamps");
    return { ok: false, today, results, error: "stamp write failed" };
  }

  return { ok: true, today, results };
}
