import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { updateGroupCas } from "@/lib/groupCas";
import { sendToGroup, sendImageToGroup } from "@/lib/whatsapp";
import { trackWaSend } from "@/lib/wa/healthServer";
import { dueReports, buildPeriodReport } from "@/lib/summary";
import { renderSummaryCardPng, summaryCardFileName } from "@/lib/summaryCardPng";
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
      const out = await trackWaSend(
        { supabase, groupId: row.id, where: `reports/${rep.key}` },
        () => sendToGroup(text, { token, groupId })
      );
      sent[rep.key] = true;
      // כרטיס תמונה מעוצב מצורף לסיכום חודשי ורבעוני
      let cardSent = false;
      if (rep.kind === "m" || rep.kind === "q") {
        try {
          const scope =
            rep.kind === "m"
              ? { kind: "month", y: rep.y, mo: rep.mo }
              : { kind: "quarter", y: rep.y, q: rep.q };
          const png = await renderSummaryCardPng(row.data, scope);
          if (png) {
            await trackWaSend(
              { supabase, groupId: row.id, where: `reports/card ${rep.key}` },
              () =>
                sendImageToGroup(png, {
                  token,
                  groupId,
                  caption: rep.kind === "m" ? `🏆 כרטיס סיכום ${rep.mo}/${String(rep.y).slice(2)}` : `🏆 כרטיס סיכום רבעון ${rep.q}/${String(rep.y).slice(2)}`,
                  fileName: summaryCardFileName(scope),
                })
            );
            cardSent = true;
          }
        } catch (e) {
          await reportError(e, `reports/card ${rep.key}`);
        }
      }
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
        cardSent,
        pinned,
        messageId: extractSentMessageId(out),
        preview: text.split("\n").slice(0, 3).join(" | "),
      });
    } catch (e) {
      await reportError(e, `reports/send ${rep.key}`);
      results.push({ key: rep.key, error: e.message });
    }
  }

  /* כתיבת החותמות והנעיצות דרך CAS על config טרי (גל 3ב): חותמת שלא
     נחתה לא מדווחת כהצלחה — הדוח יישלח שוב בריצה הבאה, והכשל נרשם. */
  const stampRes = await updateGroupCas(
    supabase,
    row.id,
    (fresh) => ({
      config: {
        ...(fresh.config || {}),
        sentReports: { ...(fresh.config?.sentReports || {}), ...sent },
        pins,
      },
    }),
    { columns: "id, config, updated_at" }
  ).catch(() => null);
  if (!stampRes?.ok) {
    await reportError(new Error("period report stamps did not land"), "reports/stamps");
    return { ok: false, results, error: "stamp write failed" };
  }

  return { ok: true, results };
}
