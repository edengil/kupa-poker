import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { sendToGroup } from "@/lib/whatsapp";
import { dueReports, buildPeriodReport } from "@/lib/summary";
import { reportError } from "@/lib/monitor";
import {
  normalizePins,
  pinAfterSend,
  pinTypeForReportKind,
  extractSentMessageId,
} from "@/lib/waPins";

/** שליחת דוחות תקופתיים שמגיעים עכשיו (או force). */
export async function runPeriodReports({ force = null } = {}) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const due = dueReports(now, force);
  if (!due.length) return { ok: true, due: [], results: [] };

  const supabase = getAdminSupabase();
  const { data: row, error } = await supabase
    .from("groups")
    .select("id, data, config")
    .eq("slug", process.env.KUPA_GROUP_SLUG)
    .single();
  if (error || !row) return { ok: false, error: "no group" };

  const groupId = process.env.WHAPI_GROUP_ID;
  const token = process.env.WHAPI_TOKEN;
  if (!groupId || !token) return { ok: false, error: "WHAPI missing" };

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
      let pinned = false;
      if (pinType) {
        const pinRes = await pinAfterSend(pinType, out, { key: rep.key }, {
          token,
          pins,
          savePins: async (next) => {
            pins = next;
          },
        });
        pinned = Boolean(pinRes?.ok);
      }
      results.push({
        key: rep.key,
        sent: true,
        pinned,
        messageId: extractSentMessageId(out),
        preview: text.split("\n").slice(0, 3).join(" | "),
      });
    } catch (e) {
      await reportError(e, `reports/send ${rep.key}`);
      results.push({ key: rep.key, error: e.message });
    }
  }

  await supabase
    .from("groups")
    .update({ config: { ...(row.config || {}), sentReports: sent, pins } })
    .eq("id", row.id);

  return { ok: true, results };
}
