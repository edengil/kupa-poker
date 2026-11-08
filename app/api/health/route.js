import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { envValue, hasEnv } from "@/lib/env";
import { authorizedAdmin } from "@/lib/cronAuth";
import { botHealthView } from "@/lib/wa/health.js";
import { waQuotaView } from "@/lib/wa/quota.js";

/* ============================================================================
   עמוד מצב מרוכז — מבט אחד על בריאות הבוט וההגדרות.

   נבנה כדי שלא נצטרך לאבחן ידנית שוב: קריאה אחת מחזירה אילו משתני סביבה
   קיימים, האם ערוץ ה-Whapi מחובר, לאיזו כתובת רשום ה-webhook, והאם הבוט
   דלוק ומתי נשלח כל דוח לאחרונה.

   שימוש:  GET /api/health?secret=<ADMIN_SECRET>
   (עד להשלמת רוטציית הסודות של גל 4ב מתקבל גם סוד ה־webhook — ראו
   authorizedAdmin ב־lib/cronAuth.js.)

   מוגן בסוד ולא דולף ערכים רגישים: הטוקן לא מוחזר, והסוד בכתובת ה-webhook
   מוסתר. מה שכן מוחזר הוא רק "קיים / לא קיים" ומצב תפעולי.
   ============================================================================ */

export const dynamic = "force-dynamic";

const WHAPI_BASE = "https://gate.whapi.cloud";

/* מסתיר את ערך ה-secret שבתוך כתובת ה-webhook, שהעמוד לא ידליף אותו. */
function maskWebhookUrl(url) {
  if (typeof url !== "string") return url;
  return url.replace(/([?&]secret=)[^&]+/i, "$1***");
}

async function whapiHealth(token) {
  if (!token) return { ok: false, reason: "no WHAPI_TOKEN" };
  try {
    const res = await fetch(`${WHAPI_BASE}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json().catch(() => ({}));
    return {
      ok: res.ok,
      httpStatus: res.status,
      status: j?.status?.text ?? null,
      connectedNumber: j?.user?.id ?? null,
      pushname: j?.user?.pushname ?? null,
      channelId: j?.channel_id ?? null,
      uptimeSec: j?.uptime ?? null,
    };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function whapiWebhooks(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${WHAPI_BASE}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json().catch(() => ({}));
    return {
      offlineMode: j?.offline_mode ?? null,
      webhooks: (j?.webhooks || []).map((w) => ({
        url: maskWebhookUrl(w.url),
        mode: w.mode,
        events: (w.events || []).map((e) => e.type),
      })),
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function groupState() {
  const slug = envValue("KUPA_GROUP_SLUG");
  if (!slug) return { found: false, reason: "no KUPA_GROUP_SLUG" };
  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("groups")
      .select("id, slug, config, data, live, updated_at")
      .eq("slug", slug)
      .single();
    if (error || !data) return { found: false, reason: error?.message || "not found" };
    const sessions = Array.isArray(data.data?.sessions) ? data.data.sessions.length : 0;
    return {
      found: true,
      botOn: Boolean(data.config?.botOn),
      /* סטטוס ערוץ מהאירועים שנרשמו בפועל (config.botHealth) — משלים את
         בדיקת ה־Whapi החיה למעלה: גם אם הבדיקה החיה עברה, כאן רואים מתי
         נרשם כשל השליחה האחרון ומה הייתה השגיאה. */
      botHealth: botHealthView(data.config?.botHealth),
      /* מד מכסת Whapi (גל 5, פריט 5.6) — אותה תצוגה כמו במתג הבוט. */
      waQuota: waQuotaView(data.config?.waQuota),
      gameActive: (data.live?.players?.length || 0) > 0,
      sessions,
      lastReports: data.config?.sentReports || {},
      updatedAt: data.updated_at,
    };
  } catch (e) {
    return { found: false, reason: e.message };
  }
}

export async function GET(request) {
  if (!authorizedAdmin(request)) {
    // אבחון מינימלי גם כשהסוד שגוי — בלי לדלוף שום ערך
    return NextResponse.json(
      {
        error: "forbidden",
        env: {
          hasAdminSecret: hasEnv("ADMIN_SECRET"),
          hasWebhookSecret: hasEnv("WHATSAPP_WEBHOOK_SECRET"),
          hasWhapiToken: hasEnv("WHAPI_TOKEN"),
        },
      },
      { status: 403 }
    );
  }

  const token = envValue("WHAPI_TOKEN");
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));

  const [whapi, webhooks, group] = await Promise.all([
    whapiHealth(token),
    whapiWebhooks(token),
    groupState(),
  ]);

  return NextResponse.json({
    ok: true,
    time: now.toISOString(),
    env: {
      hasWhapiToken: hasEnv("WHAPI_TOKEN"),
      hasWhapiGroupId: hasEnv("WHAPI_GROUP_ID"),
      hasWebhookSecret: hasEnv("WHATSAPP_WEBHOOK_SECRET"),
      hasAdminSecret: hasEnv("ADMIN_SECRET"),
      hasCronSecret: hasEnv("CRON_SECRET"),
      hasSupabaseKey: hasEnv("SUPABASE_SECRET_KEY"),
      hasKupaSlug: hasEnv("KUPA_GROUP_SLUG"),
      hasOwner: hasEnv("WHATSAPP_OWNER"),
      hasErrorAlert: hasEnv("ERROR_ALERT_WEBHOOK"),
      siteUrl: envValue("NEXT_PUBLIC_SITE_URL") || null,
    },
    whapi,
    webhooks,
    group,
  });
}
