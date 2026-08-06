"use client";

/* ============================================================================
   מנוי התראות בצד הדפדפן.

   שים לב לאייפון: פוש עובד רק כשהאתר נוסף למסך הבית (iOS 16.4 ומעלה),
   ולכן getPushSupport מחזיר "needs-install" בספארי רגיל במקום להיכשל בשקט.
   ============================================================================ */

function urlB64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

export function getPushSupport() {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  }
  return "supported";
}

export async function getPushSubscription() {
  if (getPushSupport() !== "supported") return null;
  const reg = await navigator.serviceWorker.register("/sw.js");
  return reg.pushManager.getSubscription();
}

/** נרשם להתראות ושומר את המנוי בטבלה. מחזיר "subscribed" או סיבת כישלון. */
export async function subscribePush(supabase, groupId, user) {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return "not-configured";

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(key),
  });
  const json = sub.toJSON();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      group_id: groupId,
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? null,
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    console.warn("subscription save failed:", error.message);
    return "save-failed";
  }
  return "subscribed";
}

export async function unsubscribePush(supabase) {
  const sub = await getPushSubscription();
  if (!sub) return;
  try {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  } catch {}
  await sub.unsubscribe();
}
