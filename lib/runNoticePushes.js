import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { reportError } from "@/lib/monitor";
import { collectNotices, planNoticePushes } from "@/lib/notifications";
import { pushToTargets } from "@/lib/push";
import { siteUrlFromEnv } from "@/lib/paymentReminder";

/** פוש להתראות שכבר קיימות. מייל נשאר בנפרד, אחרי שלוש התעלמויות. */
export async function runNoticePushes({ now = new Date() } = {}) {
  const supabase = getAdminSupabase();
  const slug = process.env.KUPA_GROUP_SLUG;
  const { data: row, error } = await supabase
    .from("groups")
    .select("id, data, config, slug")
    .eq("slug", slug)
    .single();
  if (error || !row) return { ok: false, error: "no group" };

  const { data: subscriptions, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, name, email, player_name")
    .eq("group_id", row.id);
  if (subError) return { ok: false, error: "no subscriptions" };

  const sent = { ...(row.config?.noticePushes || {}) };
  const items = collectNotices(row.data || {}, now);
  const plan = planNoticePushes({
    db: row.data || {},
    items,
    subscriptions: subscriptions || [],
    sent,
  });

  const site = siteUrlFromEnv();
  const link = site ? `${String(site).replace(/\/$/, "")}/g/${row.slug || slug}` : `/g/${row.slug || slug}`;
  const results = [];
  for (const job of plan.due) {
    const result = await pushToTargets(job.targets, {
      title: job.title,
      body: job.body,
      url: link,
      tag: job.tag,
    });
    if (result.skipped) {
      results.push({ key: job.key, sent: false, skipped: result.skipped });
      continue;
    }
    if (result.sent > 0) {
      sent[job.key] = now.toISOString();
      results.push({ key: job.key, kind: job.kind, sent: result.sent });
    } else {
      await reportError(new Error("notice push failed"), `notice-push ${job.key}`);
      results.push({ key: job.key, sent: false });
    }
  }

  if (JSON.stringify(sent) !== JSON.stringify(row.config?.noticePushes || {})) {
    const { data: fresh } = await supabase.from("groups").select("config").eq("id", row.id).single();
    await supabase
      .from("groups")
      .update({
        config: { ...(fresh?.config || row.config || {}), noticePushes: sent },
      })
      .eq("id", row.id);
  }

  return { ok: true, due: plan.due.length, results };
}
