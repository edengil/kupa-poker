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
  return row ? { data: row.data, live: row.live, updatedAt: row.updated_at } : null;
}
