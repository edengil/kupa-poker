import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";
import { runPeriodReports } from "@/lib/runPeriodReports";
import { runPaymentReminders } from "@/lib/runPaymentReminders";
import { runNoticeEmails } from "@/lib/runNoticeEmails";
import { runNoticePushes } from "@/lib/runNoticePushes";
import { runGroupSnapshots } from "@/lib/groupSnapshots";
import { jerusalemHour } from "@/lib/paymentReminder";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { updateGroupCas } from "@/lib/groupCas";
import { envValue } from "@/lib/env";
import { resolveEffectiveSlug } from "@/lib/groupSlug";
import {
  CRON_DAILY_RUNNERS,
  planCronDailyRun,
  markRunnerClaimed,
} from "@/lib/cronDailyClaim";
import { reportError } from "@/lib/monitor";

/* ============================================================================
   משימה יומית אחת (Hobby מאפשר cron פעם ביום לכל ביטוי).

   08:00 שעון ישראל כל השנה:
   cron ב־05:00 UTC (קיץ) וב־06:00 UTC (חורף). רץ רק כשהשעה בישראל היא 8.
   1) דוחות חודשי / רבעוני / שנתי שמגיעים + נעיצה לחודש
   2) תזכורת חלוקה כל בוקר כל עוד בערב האחרון נשארו העברות פתוחות
   3) פוש להתראות הפתוחות, ומייל גיבוי אחרי שלוש התעלמויות

   ידני: /api/cron-daily?secret=<סוד>
         /api/cron-daily?secret=<סוד>&forcePay=1

   הריצה היומית הזו היא גם מנגנון ההשארה־חיה של הפרויקט: runNoticeEmails
   ו־runNoticePushes קוראים את טבלת הקבוצות בכל ריצה, כך שהמסד רואה פעילות
   כל יום ושעון ההשהיה של Supabase (7 ימים) מתאפס. נתיב keep-alive ייעודי
   הוסר בגל 5 — לא היה לו תזמון והקריאה האנונימית שלו נדחתה בהרשאות.

   פריט 9 (גל C, חלופה A) — הקשחת הרצים, בלי שינוי במה שנשלח:
   - בידוד כשל פר־רץ: רץ שזורק מדווח (reportError) ומסומן error בתשובה,
     ושאר הרצים ממשיכים. עד היום זריקה של רץ אחד הפילה את כל הריצה.
   - תביעת יום פר־רץ (lib/cronDailyClaim): מפתח = תאריך ירושלים, נשמר
     ב־groups.config.cronDailyClaims דרך CAS. ירי כפול באותו יום ישראלי
     מדלג על רצים שכבר הושלמו; רץ שנכשל לא נתבע וירוץ שוב בירי חוזר.
     התביעה היא שכבה מעל חותמות השליחה הפרטניות של כל רץ, לא במקומן:
     כשל בקריאת/כתיבת התביעה לא חוסם ריצה (fail-open למצב שלפני הפריט).
   - פרמטר ה־?dst=1 המת הוסר מ־vercel.json — שני זמני הירי נשארו כמות שהם.
   ============================================================================ */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** קריאת מצב התביעות מהשדה הקיים ב־config. כשל → null (רצים כרגיל). */
async function loadClaimState(supabase) {
  try {
    const slug = await resolveEffectiveSlug(supabase, envValue);
    if (!slug) return null;
    const { data: row, error } = await supabase
      .from("groups")
      .select("id, config")
      .eq("slug", slug)
      .single();
    if (error || !row) return null;
    return { groupId: row.id, claims: row.config?.cronDailyClaims || {} };
  } catch {
    return null;
  }
}

/** כתיבת התביעות חזרה דרך CAS על config טרי. כשל מדווח, לא מפיל ריצה. */
async function persistClaims(supabase, groupId, claims) {
  try {
    const res = await updateGroupCas(
      supabase,
      groupId,
      (fresh) => ({
        config: { ...(fresh.config || {}), cronDailyClaims: claims },
      }),
      { columns: "id, config, updated_at" }
    );
    if (!res?.ok) throw new Error("claim write did not land");
  } catch (e) {
    await reportError(e, "cron-daily/claims");
  }
}

/** הרצת רץ אחד בבידוד: זריקה → reportError + תוצאת error, בלי להפיל אחרים. */
async function runIsolated(name, fn) {
  try {
    return { value: await fn(), failed: false };
  } catch (e) {
    await reportError(e, `cron-daily/${name}`);
    return {
      value: { ok: false, error: e instanceof Error ? e.message : String(e) },
      failed: true,
    };
  }
}

export async function GET(request) {
  if (!authorizedCron(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const forceReports = new URL(request.url).searchParams.get("force");
  const forcePay = Boolean(new URL(request.url).searchParams.get("forcePay"));
  const hour = jerusalemHour();
  if (hour !== 8 && !forceReports && !forcePay) {
    return NextResponse.json({ ok: true, skipped: "not 08:00 Israel", hour });
  }

  /* מצב התביעות הוא מקומי לריצה הזו בלבד (עותק פרטי, בלי מצב מודולרי):
     תכנון מול צילום אחד, סימון מקומי, וכתיבה אחת בסוף דרך CAS. */
  const now = new Date();
  const supabase = (() => {
    try {
      return getAdminSupabase();
    } catch {
      return null;
    }
  })();
  const claimState = supabase ? await loadClaimState(supabase) : null;
  const plan = planCronDailyRun(claimState?.claims || {}, now);
  /* force ידני = הוראת מפעיל מפורשת: עוקף את התביעה (כמו שהוא עוקף את
     שער השעה), אבל התוצאות עדיין נרשמות כתביעות של היום. */
  const bypassClaim = Boolean(forceReports || forcePay);
  let claims = claimState?.claims || {};
  let claimsDirty = false;

  const runners = {
    reports: () => runPeriodReports({ force: forceReports }),
    payments: () => runPaymentReminders({ force: forcePay }),
    notices: () => runNoticeEmails(),
    pushes: () => runNoticePushes(),
    /* גל 3 (3.1 + 3.4): צילום גיבוי יומי לכל קבוצה + גיזום צילומים
       (30 יום) ו־diag_events (90 יום). כשל גיבוי מתריע — reportError,
       לא שקט — אבל לא מפיל את שאר תוצאת הריצה. */
    backups: async () => {
      const out = await runGroupSnapshots(getAdminSupabase());
      if (out.failed > 0 || out.errors.length > 0) {
        await reportError(
          new Error(
            `גיבוי יומי חלקי: ${out.snapshotted}/${out.groups} צולמו; שגיאות: ${out.errors.join(" | ")}`
          ),
          "cron-daily/snapshots"
        );
      }
      return out;
    },
  };

  const results = {};
  for (const name of CRON_DAILY_RUNNERS) {
    if (!bypassClaim && plan.claimed.includes(name)) {
      results[name] = { ok: true, skipped: "already claimed", claimKey: plan.key };
      continue;
    }
    const { value, failed } = await runIsolated(name, runners[name]);
    results[name] = value;
    if (!failed) {
      claims = markRunnerClaimed(claims, plan.key, name, now.toISOString());
      claimsDirty = true;
    }
  }

  if (claimsDirty && supabase && claimState?.groupId) {
    await persistClaims(supabase, claimState.groupId, claims);
  }

  return NextResponse.json({
    ok: true,
    claimKey: plan.key,
    reports: results.reports,
    payments: results.payments,
    notices: results.notices,
    pushes: results.pushes,
    backups: results.backups,
  });
}
