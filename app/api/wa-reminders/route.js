import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { reportError } from "@/lib/monitor";
import { envValue } from "@/lib/env";
import { sendToGroup, maybeRemindPending, maybeRemindBitIdle } from "@/lib/whatsapp";
import { trackWaSend } from "@/lib/wa/healthServer";

/* ============================================================================
   תזכורות בוט תלויות־זמן — ממתינים לאישור (8 דק׳) וביט שקט (שעתיים).
   עד היום הן רצו רק כתופעת לוואי של הודעות נכנסות ב־webhook: קבוצה שקטה =
   אין תזכורות. הנתיב הזה רץ על שעון (pg_cron במסד או cron חיצוני, עם
   authorizedCron) ומריץ בדיוק את אותה לוגיקה של ה־webhook.
   ============================================================================ */

export const dynamic = "force-dynamic";

/** הרשאה: authorizedCron הרגיל, או הטוקן הייעודי של הנתיב הזה (pg_cron במסד). */
function authorized(request) {
  const token = envValue("WA_REMINDERS_TOKEN");
  const header = request.headers.get("authorization") || "";
  if (token && header === `Bearer ${token}`) return true;
  return authorizedCron(request);
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const supabase = getAdminSupabase();
    const { data: row, error } = await supabase
      .from("groups")
      .select("id, slug, live, config")
      .eq("slug", envValue("KUPA_GROUP_SLUG"))
      .single();
    if (error || !row) return NextResponse.json({ ok: true, skipped: "no group" });
    if (!row.config?.botOn) return NextResponse.json({ ok: true, skipped: "bot off" });

    const live = row.live || null;
    const now = Date.now();
    /* ממתינים לאישור קודמים לתזכורת ביט שקט — כמו ב־webhook, בלי ספאם כפול. */
    const reminded =
      maybeRemindPending(live, now, { groupNudge: false }) ||
      maybeRemindBitIdle(live, now, { groupNudge: true });
    if (!reminded) return NextResponse.json({ ok: true, reminded: null });

    const kind = reminded.live?.bitIdleRemindedAt === now ? "bit-idle" : "pending";
    const { error: writeError } = await supabase
      .from("groups")
      .update({ live: reminded.live })
      .eq("id", row.id);
    if (writeError) {
      await reportError(writeError, `wa-reminders/${kind}`);
      return NextResponse.json({ error: "write failed" }, { status: 500 });
    }

    const token = envValue("WHAPI_TOKEN");
    const ownerPhone = envValue("WHATSAPP_OWNER");
    const groupId = envValue("WHAPI_GROUP_ID");
    try {
      if (reminded.ownerDm && ownerPhone) {
        await trackWaSend(
          { supabase, groupId: row.id, where: `wa-reminders/${kind}` },
          () => sendToGroup(reminded.ownerDm, { token, groupId: ownerPhone })
        );
      }
      if (reminded.reply && groupId) {
        await trackWaSend(
          { supabase, groupId: row.id, where: `wa-reminders/${kind}` },
          () => sendToGroup(reminded.reply, { token, groupId })
        );
      }
    } catch (e) {
      console.warn(`${kind} remind failed:`, e.message);
    }
    return NextResponse.json({ ok: true, reminded: kind });
  } catch (err) {
    await reportError(err, "wa-reminders");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
