import { NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cronAuth";
import { getAdminSupabase } from "@/lib/supabaseAdmin";
import { reportError } from "@/lib/monitor";
import { envValue } from "@/lib/env";
import { sendToGroup, maybeRemindPending, maybeRemindBitIdle } from "@/lib/whatsapp";
import { trackWaSend } from "@/lib/wa/healthServer";
import { shouldSkipNudge } from "@/lib/wa/quota";
import { reminderKind, writeReminderStamp } from "@/lib/wa/reminderWrite";
import { resolveEffectiveSlug } from "@/lib/groupSlug";

/* ============================================================================
   תזכורות בוט תלויות־זמן — ממתינים לאישור (8 דק׳) וביט שקט (שעתיים).
   עד היום הן רצו רק כתופעת לוואי של הודעות נכנסות ב־webhook: קבוצה שקטה =
   אין תזכורות. הנתיב הזה רץ על שעון (pg_cron במסד או cron חיצוני, עם
   authorizedCron) ומריץ בדיוק את אותה לוגיקה של ה־webhook.

   סדר הפעולות (גל 3ב, ממצא 10): שולחים קודם — ורק שליחה שהצליחה חותמת
   "נשלח". כשל שליחה חותם ניסיון בלבד (מרסן את הניסיון הבא ב־cooldown)
   ומדווח בכנות בתשובה, במקום לסמן הצלחה בשקר.
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
    const slug = await resolveEffectiveSlug(supabase, envValue);
    const { data: row, error } = await supabase
      .from("groups")
      .select("id, slug, live, config")
      .eq("slug", slug)
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

    const kind = reminderKind(reminded, now);
    const token = envValue("WHAPI_TOKEN");
    const ownerPhone = envValue("WHATSAPP_OWNER");
    const groupId = envValue("WHAPI_GROUP_ID");
    /* גל 5, פריט 5.6: כל רגל נשלחת וחותמת בנפרד — הצלחה חלקית (DM עבר,
       נדנוד נכשל) לא שולחת שוב את הרגל שעברה בריצה הבאה. רגל שלא
       ניתנת להרצה (אין טקסט/אין יעד מוגדר) נשארת null ולא נחתמת. */
    const dmDue = reminded.legs ? reminded.legs.dm : Boolean(reminded.ownerDm);
    const groupDue = reminded.legs ? reminded.legs.group : Boolean(reminded.reply);
    let dmOutcome = null;
    let groupOutcome = null;
    if (dmDue && reminded.ownerDm && ownerPhone) {
      try {
        await trackWaSend(
          { supabase, groupId: row.id, where: `wa-reminders/${kind}`, quotaChat: "dm" },
          () => sendToGroup(reminded.ownerDm, { token, groupId: ownerPhone })
        );
        dmOutcome = true;
      } catch (e) {
        dmOutcome = false;
        console.warn(`${kind} remind dm failed:`, e.message);
        await reportError(e, `wa-reminders/${kind}-dm-send`);
      }
    }
    /* גל 5 (5.6): נדנוד קבוצתי לא־חיוני מדלג כשהמכסה קרובה לקיר —
       שומרים מכסה לתזכורות כסף. הרגל לא נחתמת ותיבדק שוב בריצה הבאה. */
    const nudgeQuotaBlocked = groupDue && shouldSkipNudge(row.config?.waQuota);
    if (groupDue && !nudgeQuotaBlocked && reminded.reply && groupId) {
      try {
        await trackWaSend(
          { supabase, groupId: row.id, where: `wa-reminders/${kind}`, quotaChat: "group" },
          () => sendToGroup(reminded.reply, { token, groupId })
        );
        groupOutcome = true;
      } catch (e) {
        groupOutcome = false;
        console.warn(`${kind} remind group failed:`, e.message);
        await reportError(e, `wa-reminders/${kind}-group-send`);
      }
    }
    const sendFailed = dmOutcome === false || groupOutcome === false;

    /* החותמת נכתבת רק עכשיו, פר־רגל: הצלחה → "נשלח"; כשל → ניסיון בלבד.
       אם אף רגל לא ניתנה להרצה (ערוצים לא מוגדרים) — החותמת האחודה
       הישנה, כמו עד היום. נדנוד שחסמה המכסה לא נחתם בכלל — הוא לא
       "נשלח" וגם לא "נכשל"; ייבדק שוב בריצה הבאה. */
    if (nudgeQuotaBlocked) {
      await writeReminderStamp(supabase, row.id, reminded, now, {
        legs: { group: null, dm: dmOutcome },
      });
    } else if (dmOutcome == null && groupOutcome == null) {
      await writeReminderStamp(supabase, row.id, reminded, now, { sent: true });
    } else {
      await writeReminderStamp(supabase, row.id, reminded, now, {
        legs: { group: groupOutcome, dm: dmOutcome },
      });
    }
    if (sendFailed) {
      return NextResponse.json({ ok: true, reminded: kind, sent: false });
    }
    return NextResponse.json({
      ok: true,
      reminded: kind,
      ...(nudgeQuotaBlocked ? { nudgeSkipped: "quota" } : {}),
    });
  } catch (err) {
    await reportError(err, "wa-reminders");
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
