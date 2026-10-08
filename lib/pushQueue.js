/* עיבוד תור ההתראות.
   נקרא מ-cron או מנתיב API — שולף פריטי pending, שולח, ומעדכן סטטוס.
   עם ניסיונות חוזרים: עד 3 ניסיונות, אחר כך failed. */

import { pushToTargets } from "./push.js";
import { subscriptionPlayer } from "./notifications.js";

const MAX_ATTEMPTS = 3;

/**
 * מעבד פריטי תור ממתינים.
 * @param {object} supabase לקוח service_role
 * @param {object} opts { limit }
 * @returns {Promise<{processed: number, failed: number}>}
 */
export async function processPushQueue(supabase, { limit = 20 } = {}) {
  const { data: items, error } = await supabase
    .from("push_queue")
    .select("id, group_id, kind, title, body, url, tag, targets, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!items?.length) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (const item of items) {
    // סימון כבטיפול למניעת כפילות
    await supabase
      .from("push_queue")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("status", "pending");

    try {
      await sendQueueItem(supabase, item);
      await supabase
        .from("push_queue")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", item.id);
      processed++;
    } catch (err) {
      const attempts = (item.attempts || 0) + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await supabase
        .from("push_queue")
        .update({
          status,
          attempts,
          last_error: err instanceof Error ? err.message : String(err),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (status === "failed") failed++;
    }
  }

  return { processed, failed };
}

async function sendQueueItem(supabase, item) {
  // טעינת נתוני הקבוצה לזיהוי שחקנים
  const { data: group } = await supabase
    .from("groups")
    .select("id, data")
    .eq("id", item.group_id)
    .single();
  if (!group) throw new Error("group not found");

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, name, player_name")
    .eq("group_id", item.group_id);

  let targets = subs || [];
  // סינון לפי שחקנים אם צוינו מטרות
  if (Array.isArray(item.targets) && item.targets.length > 0) {
    const wanted = new Set(item.targets.map((t) => t.player_name).filter(Boolean));
    targets = targets.filter((s) => {
      const player = subscriptionPlayer(group.data, s);
      return player && wanted.has(player);
    });
  }

  if (!targets.length) return; // אין למי לשלוח — לא שגיאה

  const res = await pushToTargets(targets, {
    title: item.title,
    body: item.body,
    url: item.url,
    tag: item.tag,
  });

  if ((res.failed || 0) > 0 && (res.sent || 0) === 0) {
    throw new Error(`all pushes failed (${res.failed})`);
  }
}

/**
 * הוספת פריט לתור.
 * @param {object} supabase לקוח service_role
 */
export async function enqueuePush(supabase, { groupId, kind, title, body, url, tag, targets }) {
  const { error } = await supabase.from("push_queue").insert({
    group_id: groupId,
    kind,
    title,
    body,
    url: url || null,
    tag: tag || null,
    targets: targets || null,
  });
  if (error) throw error;
}
