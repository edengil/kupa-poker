import webpush from "web-push";
import { getAdminSupabase } from "./supabaseAdmin";
import { updateGroupCas } from "./groupCas";

/* ============================================================================
   שליחת התראות פוש לכל המנויים של קבוצה.

   רץ רק בצד השרת. מנוי שהדפדפן שלו כבר לא מכיר (410/404 — המשתמש ביטל או
   החליף מכשיר) נמחק מהטבלה תוך כדי, כדי שהרשימה לא תתמלא בכתובות מתות.
   ============================================================================ */

function configure() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:admin@kupa-poker.app", pub, priv);
  return true;
}

export async function pushToGroup(groupId, { title, body, url, tag }) {
  if (!configure()) {
    console.warn("push skipped: VAPID keys not configured");
    return { sent: 0 };
  }

  const supabase = getAdminSupabase();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("group_id", groupId);
  if (error || !subs?.length) return { sent: 0 };

  const payload = JSON.stringify({ title, body, url, tag });
  const dead = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent += 1;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.id);
        else console.warn("push failed:", e.message);
      }
    })
  );

  if (dead.length) {
    await supabase.from("push_subscriptions").delete().in("id", dead);
  }
  return { sent, removed: dead.length };
}

/** פוש למנויים מסוימים — לא לכל הקבוצה. */
export async function pushToTargets(subs, { title, body, url, tag }) {
  if (!configure()) {
    console.warn("push skipped: VAPID keys not configured");
    return { sent: 0, skipped: "no vapid" };
  }
  const list = (subs || []).filter((s) => s?.endpoint && s?.p256dh && s?.auth);
  if (!list.length) return { sent: 0 };

  const supabase = getAdminSupabase();
  const payload = JSON.stringify({ title, body, url, tag });
  const dead = [];
  let sent = 0;

  await Promise.all(
    list.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent += 1;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.id);
        else console.warn("push failed:", e.message);
      }
    })
  );

  const removable = dead.filter(Boolean);
  if (removable.length) {
    await supabase.from("push_subscriptions").delete().in("id", removable);
  }
  return { sent, removed: removable.length };
}

/* התראת "המשחק התחיל" נשלחת לכל היותר פעם בכמה שעות — משחק אחד בערב,
   וגם אם השולחן התרוקן והתמלא שוב לא מציפים אף אחד. */
const GAME_NOTIFY_GAP_MS = 6 * 60 * 60 * 1000;

export async function notifyGameStart(row, slug) {
  const last = row.config?.lastGameNotifyAt || 0;
  if (Date.now() - last < GAME_NOTIFY_GAP_MS) return { skipped: "too soon" };

  /* גל 3ב (ממצא 10): שולחים קודם, חותמים אחר כך — ורק אם באמת נשלח.
     עד היום החותמת נכתבה לפני הפוש, וכשל/דילוג השתיק את ההתראה ל־6 שעות. */
  const res = await pushToGroup(row.id, {
    title: "המשחק התחיל! 🎰",
    body: "השולחן נפתח — היכנס לראות את הלייב.",
    url: `/g/${slug}`,
    tag: "game-start",
  });
  if ((res?.sent || 0) > 0) {
    const supabase = getAdminSupabase();
    await updateGroupCas(
      supabase,
      row.id,
      (fresh) => ({ config: { ...(fresh.config || {}), lastGameNotifyAt: Date.now() } }),
      { columns: "id, config, updated_at", retries: 2 }
    ).catch(() => null);
  }
  return res;
}
