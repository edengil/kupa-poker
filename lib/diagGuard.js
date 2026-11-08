/* ============================================================================
   שער האבטחה של POST /api/diag (גל 2, פריט 2.3 — ממצא F9/F10).

   עד הגל הנתיב היה פתוח לגמרי: כל אחד יכל להזריק שורות diag_events
   מפוברקות בלי הגבלה ולהציף את הטבלה ואת הלוגים. מעכשיו שלוש שכבות:

   1. גודל — גוף מעל DIAG_MAX_BODY נדחה ב־413 (גם לפי content-length
      מוצהר וגם לפי האורך בפועל; ההצהרה יכולה לשקר).
   2. זיהוי — שני מסלולים:
      - מנהל: סוד הניהול הקיים (authorizedAdmin של cronAuth — ?secret=
        עם שרשרת ADMIN_SECRET והנפילה המסומנת, או Bearer/x-admin-secret
        באותה שרשרת). מסלול מלא: כל השדות, כולל componentStack/detail.
      - לקוח האפליקציה: שדה cid בגוף — מזהה אקראי פר־דפדפן ש־diagReport
        מייצר ושומר ב־localStorage. זהו מזהה, לא סוד (כל לקוח רואה אותו);
        תפקידו לחסום הזרקות סקריפט מזדמנות שלא עוברות דרך האפליקציה.
        המסלול מצומצם: kind רק מתבנית אוצר־המילים של האפליקציה, בלי
        componentStack/detail, ותקצירי message/stack קצרים יותר.
   3. קצב — חלון זוחל פר־IP + תקרה יומית גלובלית. המצב בזיכרון התהליך
      (best-effort פר־מופע שרת; ההגנה העיקרית מפני הצפה היא שילוב
      השכבות, לא מונה מבוזר).
   ============================================================================ */

import { envValue } from "./env.js";
import { authorizedAdmin } from "./cronAuth.js";

export const DIAG_MAX_BODY = 8 * 1024;
export const DIAG_IP_WINDOW_MS = 60 * 1000;
export const DIAG_IP_MAX_PER_WINDOW = 120;
export const DIAG_DAILY_CAP = 5000;

export const DIAG_CLIENT_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
/* אוצר ה־kind שהאפליקציה שולחת בפועל: error, unhandledrejection,
   console.error, boundary, owner-phase, store-*, pokerapp-* … */
export const DIAG_KIND_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/;

/** האם הבקשה נושאת את סוד הניהול הקיים (אותה שרשרת של authorizedAdmin). */
export function isDiagAdmin(request) {
  if (authorizedAdmin(request)) return true;
  const secret = envValue("ADMIN_SECRET") || envValue("WHATSAPP_WEBHOOK_SECRET");
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  return (request.headers.get("x-admin-secret") || "") === secret;
}

export function diagClientIp(request) {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0].trim();
  return first || (request.headers.get("x-real-ip") || "").trim() || "unknown";
}

/* --- מגביל קצב בזיכרון ---------------------------------------------------- */

const rateState = { day: "", dayCount: 0, ips: new Map() };

/** איפוס מצב הקצב — לבדיקות בלבד. */
export function resetDiagRateState() {
  rateState.day = "";
  rateState.dayCount = 0;
  rateState.ips.clear();
}

/**
 * בודק ורושם בקשה אחת. מחזיר true אם הבקשה בתוך המגבלות.
 * ‏now ניתן להזרקה לבדיקות.
 */
export function diagRateCheck(request, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== rateState.day) {
    rateState.day = day;
    rateState.dayCount = 0;
  }
  if (rateState.dayCount >= DIAG_DAILY_CAP) return false;

  const ip = diagClientIp(request);
  const hits = (rateState.ips.get(ip) || []).filter((t) => now - t < DIAG_IP_WINDOW_MS);
  if (hits.length >= DIAG_IP_MAX_PER_WINDOW) {
    rateState.ips.set(ip, hits);
    return false;
  }
  hits.push(now);
  rateState.ips.set(ip, hits);
  rateState.dayCount += 1;

  /* ניקוי הזדמנותי של כתובות שקטות, שהמפה לא תגדל בלי גבול */
  if (rateState.ips.size > 1000) {
    for (const [key, arr] of rateState.ips) {
      if (!arr.length || now - arr[arr.length - 1] >= DIAG_IP_WINDOW_MS) rateState.ips.delete(key);
    }
  }
  return true;
}

/* --- סניטציה -------------------------------------------------------------- */

const MAX_STACK = 2 * 1024;

/**
 * בונה את רשומת האבחון משדות קבועים בלבד. במסלול הלקוח (admin=false)
 * נושרים componentStack ו־detail (השדות החופשיים), והתקצירים קצרים יותר.
 */
export function sanitizeDiagEntry(d, { admin = false } = {}) {
  const phaseNum = Number(d.phase);
  return {
    kind: String(d.kind || "error").slice(0, 40),
    message: String(d.message || "").slice(0, admin ? 1000 : 500),
    stack: String(d.stack || "").slice(0, admin ? MAX_STACK : 1000),
    componentStack: admin ? String(d.componentStack || "").slice(0, 1000) : "",
    detail: admin ? String(d.detail || "").slice(0, 500) : "",
    url: String(d.url || "").slice(0, 300),
    ua: String(d.ua || "").slice(0, 300),
    ts: String(d.ts || ""),
    phase: Number.isFinite(phaseNum) && phaseNum > 0 ? Math.floor(phaseNum) : null,
  };
}
