/* ============================================================================
   מדידת שימוש אנונימית (Amplitude) — עוזרת להבין איך משתמשים באפליקציה
   כדי לשפר אותה. לא נאספים פרטים אישיים, והכל כבוי אם אין מפתח API
   מוגדר (NEXT_PUBLIC_AMPLITUDE_API_KEY). הטעינה עצלה — ה-SDK נטען רק
   בדפדפן ורק כשיש מפתח, כדי לא להכביד על מי שלא צריך את זה.
   ============================================================================ */

let initialized = false;
let amplitudePromise = null;

function loadSdk() {
  if (!amplitudePromise) {
    amplitudePromise = import("@amplitude/analytics-browser").catch((e) => {
      console.warn("analytics disabled:", e?.message || e);
      return null;
    });
  }
  return amplitudePromise;
}

export function initAnalytics() {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!key) return; // אין מפתח → לא מודדים כלום
  initialized = true;
  loadSdk().then((mod) => {
    if (!mod) return;
    try {
      mod.init(key, {
        defaultTracking: {
          pageViews: true,
          sessions: true,
          formInteractions: false,
          fileDownloads: false,
        },
      });
    } catch (e) {
      console.warn("analytics init failed:", e?.message || e);
    }
  });
}

/* שליחת אירוע מותאם — לא עושה כלום אם האנליטיקס כבוי/נכשל */
export function track(eventName, props) {
  if (typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!key) return;
  loadSdk().then((mod) => {
    if (!mod) return;
    try {
      mod.track(eventName, props || undefined);
    } catch {
      /* שקט — מדידה לעולם לא שוברת את האפליקציה */
    }
  });
}
