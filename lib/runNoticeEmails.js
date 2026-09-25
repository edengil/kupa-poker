import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { reportError } from "@/lib/monitor";
import { collectNotices, planNoticeEmails } from "@/lib/notifications";
import { sendPlayerNotice } from "@/lib/noticeMail";
import { jerusalemYmd, siteUrlFromEnv } from "@/lib/paymentReminder";

function noticeText(job, link) {
  const lines = [job.title, "", job.body];
  if (job.actorRole && job.actorName) lines.push(`מי שצריך לפעול: ${job.actorRole} · ${job.actorName}`);
  lines.push("", "ההתראה מחכה באפליקציה. זה מייל אחד על הפריט הזה.");
  if (link) lines.push(link);
  return lines.join("\n");
}

/** גיבוי מייל להתראות שהתעלמו מהן. לא נשלח שוב לאותו פריט ולאותו שחקן. */
export async function runNoticeEmails({ now = new Date() } = {}) {
  const supabase = getAdminSupabase();
  const slug = process.env.KUPA_GROUP_SLUG;
  const { data: row, error } = await supabase
    .from("groups")
    .select("id, data, config, slug")
    .eq("slug", slug)
    .single();
  if (error || !row) return { ok: false, error: "no group" };

  const { data: views, error: viewError } = await supabase
    .from("group_views")
    .select("email, name, at")
    .eq("group_id", row.id);
  if (viewError) return { ok: false, error: "no views" };

  const sent = { ...(row.config?.noticeEmails || {}) };
  const firstSeen = { ...(row.config?.noticeFirstSeen || {}) };
  const items = collectNotices(row.data || {}, now);
  const plan = planNoticeEmails({
    db: row.data || {},
    items,
    views: views || [],
    sent,
    firstSeen,
    now,
  });

  const site = siteUrlFromEnv();
  const link = site ? `${String(site).replace(/\/$/, "")}/g/${row.slug || slug}` : "";
  const results = [];
  for (const job of plan.due) {
    const result = await sendPlayerNotice({
      to: job.email,
      subject: `קופה — ${job.title}`,
      text: noticeText(job, link),
    });
    if (result.sent) {
      sent[job.key] = jerusalemYmd(now);
      results.push({ key: job.key, sent: true });
    } else {
      await reportError(new Error(result.reason || "notice email failed"), `notice-email ${job.key}`);
      results.push({ key: job.key, sent: false });
    }
  }

  const changed =
    JSON.stringify(plan.firstSeen) !== JSON.stringify(firstSeen) ||
    JSON.stringify(sent) !== JSON.stringify(row.config?.noticeEmails || {});
  if (changed) {
    const { data: fresh } = await supabase.from("groups").select("config").eq("id", row.id).single();
    await supabase
      .from("groups")
      .update({
        config: {
          ...(fresh?.config || row.config || {}),
          noticeFirstSeen: plan.firstSeen,
          noticeEmails: sent,
        },
      })
      .eq("id", row.id);
  }

  return { ok: true, due: plan.due.length, results };
}
