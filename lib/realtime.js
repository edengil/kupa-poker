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

/* מזהה מכשיר קריא — נשמר בתוך רשומת הטאב הראשונה (שדה d) ולא בעמודה
   נפרדת, כדי לא לדרוש שינוי סכימה. מספיק בשביל "מהטלפון או מהמחשב". */
function deviceLabel() {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iPhone"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "מחשב"
    : /Macintosh/.test(ua) ? "Mac"
    : "מכשיר אחר";
  const browser = /Edg/i.test(ua) ? "Edge"
    : /OPR|Opera/i.test(ua) ? "Opera"
    : /CriOS|Chrome/i.test(ua) ? "Chrome"
    : /FxiOS|Firefox/i.test(ua) ? "Firefox"
    : /Safari/i.test(ua) ? "Safari"
    : "";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone;
  return `${os}${browser ? ` · ${browser}` : ""}${standalone ? " · מהאפליקציה" : ""}`;
}

/** רושם כניסה ביומן ומחזיר את מזהה השורה, כדי שאפשר יהיה לעדכן אותה בהמשך
    (יציאה, טאבים). נכשל בשקט — צפייה חשובה יותר מרישום. */
export async function logView(supabase, groupId, user) {
  try {
    const { data, error } = await supabase
      .from("group_views")
      .insert({
        group_id: groupId,
        user_id: user.id,
        email: user.email ?? null,
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        tabs: [{ tab: "table", at: new Date().toISOString(), d: deviceLabel() }],
      })
      .select("id")
      .single();
    if (error) throw error;
    return data?.id ?? null;
  } catch (e) {
    console.warn("view log failed:", e.message);
    return null;
  }
}

/* ============================================================================
   מעקב ביקור חי.

   השורה שנפתחה ב-logView ממשיכה להתעדכן כל עוד הדף פתוח:
     - כל מעבר טאב מצטרף לרשימת tabs עם חותמת זמן
     - left_at מתעדכן בכל פעולה, בדופק קבוע, וכשהדף נסגר או עובר לרקע
   כך "מתי יצא" הוא בפועל "מתי נראה לאחרונה" — אמין גם כשהדפדפן נסגר בלי
   להיפרד יפה, בדיוק המקרה הנפוץ בטלפון.
   ============================================================================ */
const HEARTBEAT_MS = 60000;

export function trackVisit(supabase, viewId) {
  if (!viewId) return { onTab: () => {}, stop: () => {} };

  // הרשומה הראשונה משכפלת את מה שנכתב ב-logView (כולל המכשיר), כי כל
  // עדכון tabs מחליף את המערך כולו — בלעדיה המכשיר היה נמחק בעדכון הראשון
  const tabs = [{ tab: "table", at: new Date().toISOString(), d: deviceLabel() }];
  let dirty = false;

  const push = async () => {
    const patch = { left_at: new Date().toISOString() };
    if (dirty) {
      patch.tabs = tabs;
      dirty = false;
    }
    try {
      await supabase.from("group_views").update(patch).eq("id", viewId);
    } catch (e) {
      console.warn("visit update failed:", e.message);
    }
  };

  const timer = setInterval(() => {
    if (document.visibilityState === "visible") push();
  }, HEARTBEAT_MS);

  const onHide = () => {
    if (document.visibilityState === "hidden") push();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", push);

  return {
    onTab(tab) {
      tabs.push({ tab, at: new Date().toISOString() });
      dirty = true;
      push();
    },
    stop() {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", push);
      push();
    },
  };
}
