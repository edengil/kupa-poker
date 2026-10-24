/* ============================================================================
   שליחת דיווחי אבחון ל־/api/diag — חלק מבילד האבחון הזמני (fix/diag-capture).

   שני ערוצים על אותו תחבורה (sendBeacon, נפילה ל־fetch ב־keepalive):
   - reportDiag — שגיאות (Error Boundary, window.onerror, console.error).
     מוגבל ל־5 בטעינת דף, כדי ששגיאה חוזרת לא תציף.
   - reportBeacon — משואות מחזור־חיים (mount, פאזות, remount, store).
     תקציב נדיב יותר (300) ומונה רץ בשדה phase, כדי שגם סופת remount-ים
     תיראה בלוג/במסד כרצף ממוספר ולא תיחתך אחרי חמש.
   ============================================================================ */

let errorsSent = 0;
const MAX_ERRORS_PER_LOAD = 5;
let beaconsSent = 0;
let beaconSeq = 0;
const MAX_BEACONS_PER_LOAD = 300;

function sendPayload(payload) {
  try {
    const body = JSON.stringify({
      url: window.location.href,
      ua: navigator.userAgent,
      ts: new Date().toISOString(),
      ...payload,
    });
    let sent = false;
    try {
      if (typeof navigator.sendBeacon === "function") {
        // text/plain בכוונה: מונע preflight של CORS מול נתיב באותו מקור
        const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
        sent = navigator.sendBeacon("/api/diag", blob);
      }
    } catch {
      sent = false;
    }
    if (!sent) {
      fetch("/api/diag", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* אבחון לעולם לא שובר את האפליקציה */
  }
}

export function reportDiag(kind, error, extra) {
  if (typeof window === "undefined") return;
  if (errorsSent >= MAX_ERRORS_PER_LOAD) return;
  errorsSent += 1;
  sendPayload({
    kind: String(kind || "error"),
    message: (error?.message ? String(error.message) : String(error ?? "")).slice(0, 1000),
    stack: error?.stack ? String(error.stack).slice(0, 2000) : "",
    ...(extra || {}),
  });
}

export function reportBeacon(kind, detail) {
  if (typeof window === "undefined") return;
  beaconSeq += 1;
  if (beaconsSent >= MAX_BEACONS_PER_LOAD) return;
  beaconsSent += 1;
  let detailText = "";
  if (typeof detail === "string") {
    detailText = detail;
  } else if (detail != null) {
    try {
      detailText = JSON.stringify(detail);
    } catch {
      detailText = String(detail);
    }
  }
  sendPayload({
    kind: String(kind || "beacon"),
    message: detailText.slice(0, 500),
    detail: detailText.slice(0, 500),
    phase: beaconSeq,
  });
}
