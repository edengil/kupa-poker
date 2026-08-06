"use client";

/* ============================================================================
   סנכרון בזמן אמת.

   הבחירה כאן היא Broadcast ולא Postgres Changes, ובכוונה: Postgres Changes
   מכבד RLS, ולצופה אנונימי אין ולא תהיה גישה לטבלת groups. כדי שזה יעבוד היה
   צריך לפתוח את הטבלה לקריאה ציבורית — בדיוק מה שהסכימה נועדה למנוע.

   לכן מה שעובר בערוץ הוא ping בלבד, בלי נתונים. הצופה שמקבל אותו קורא מחדש
   דרך public_group(slug), אותה פונקציה מוגבלת שהוא כבר משתמש בה. גם אם מישהו
   ישדר ping מזויף, כל מה שיקרה זה קריאה מיותרת אחת.
   ============================================================================ */

const channelName = (slug) => `group:${slug}`;

/** צד הבעלים: ערוץ ששולח ping אחרי כל כתיבה שנחתה במסד. */
export function createBroadcaster(supabase, slug) {
  const channel = supabase.channel(channelName(slug));
  let ready = false;

  channel.subscribe((status) => {
    ready = status === "SUBSCRIBED";
  });

  return {
    ping() {
      if (!ready) return;
      channel.send({
        type: "broadcast",
        event: "update",
        payload: { at: Date.now() },
      });
    },
    dispose() {
      supabase.removeChannel(channel);
    },
  };
}

/** צד הצופה: מאזין ל-ping ומחזיר פונקציית ניתוק. */
export function subscribeToGroup(supabase, slug, onPing) {
  const channel = supabase
    .channel(channelName(slug))
    .on("broadcast", { event: "update" }, () => onPing())
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/** קריאה מחדש של התמונה הציבורית. אותה פונקציה שהשרת משתמש בה. */
export async function fetchSnapshot(supabase, slug) {
  const { data, error } = await supabase.rpc("public_group", { p_slug: slug });
  if (error) {
    console.error("Refresh failed:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { id: row.id, name: row.name, data: row.data, live: row.live, updatedAt: row.updated_at } : null;
}

/* ============================================================================
   נוכחות — מי צופה ממש עכשיו.

   Supabase Realtime מחזיק מצב נוכחות פר ערוץ: כל מי שמחובר "מסמן" את עצמו,
   וכשהוא סוגר את הדף או מאבד רשת הוא נעלם משם לבד. זה עדיף על טבלה עם
   heartbeat, כי אין מה לנקות ואין שורות שנשארות תקועות.
   ============================================================================ */

const presenceTopic = (slug) => `presence:${slug}`;

/** מצטרף לערוץ הנוכחות ומסמן את עצמו. מחזיר פונקציית עזיבה. */
export function joinPresence(supabase, slug, me, onChange) {
  const channel = supabase.channel(presenceTopic(slug), {
    config: { presence: { key: me.id } },
  });

  const emit = () => {
    const state = channel.presenceState();
    const list = Object.values(state)
      .map((entries) => entries[0])
      .filter(Boolean)
      .sort((a, b) => (a.since || 0) - (b.since || 0));
    onChange(list);
  };

  channel
    .on("presence", { event: "sync" }, emit)
    .on("presence", { event: "join" }, emit)
    .on("presence", { event: "leave" }, emit)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ ...me, since: Date.now() });
      }
    });

  return () => supabase.removeChannel(channel);
}

/** צד הבעלים: מסתכל בלי לסמן את עצמו כצופה. */
export function watchPresence(supabase, slug, onChange) {
  const channel = supabase.channel(presenceTopic(slug));
  const emit = () => {
    const state = channel.presenceState();
    onChange(
      Object.values(state)
        .map((entries) => entries[0])
        .filter(Boolean)
        .sort((a, b) => (a.since || 0) - (b.since || 0))
    );
  };
  channel
    .on("presence", { event: "sync" }, emit)
    .on("presence", { event: "join" }, emit)
    .on("presence", { event: "leave" }, emit)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/** רושם כניסה ביומן. נכשל בשקט — צפייה חשובה יותר מרישום. */
export async function logView(supabase, groupId, user) {
  try {
    await supabase.from("group_views").insert({
      group_id: groupId,
      user_id: user.id,
      email: user.email ?? null,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    });
  } catch (e) {
    console.warn("view log failed:", e.message);
  }
}
