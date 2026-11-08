/* ============================================================================
   כותרות אבטחה לכל האתר (גל 2, פריט 2.2 — ממצא I7):
   עד הגל עמדה רק HSTS מברירת־המחדל של Vercel. הבלוק האחד כאן מוסיף:
   - CSP במצב Report-Only בלבד (ראו ההערה למטה) — שכבת הגנה שנייה ל־2.1.
   - X-Frame-Options: DENY — אין שום הטמעת iframe לגיטימית באפליקציה.
   - X-Content-Type-Options: nosniff.
   - Referrer-Policy: same-origin — ה־slug שבנתיב (/g/<slug>) לא דולף
     בכותרת Referer לאתרים חיצוניים.

   למה CSP רק מדווחת ולא אוכפת: המדיניות נבנתה ממיפוי המשאבים שהאפליקציה
   טוענת בפועל (סקריפטים וסטיילים מוטמעים של Next — לכן unsafe-inline;
   חיבורי Supabase ב־https+wss; ‏Amplitude; פונטים עצמיים דרך next/font;
   תמונות data:/blob:; ‏service worker מ־/sw.js). לפי כלל התוכנית, אכיפה
   עולה רק אחרי עשן חי של כל המסכים הראשיים שמוכיח ששום משאב לגיטימי
   לא נחסם — הבדיקה הזו לא בוצעה בגל הזה, ולכן הכותרת היא
   Content-Security-Policy-Report-Only. המעבר לאכיפה = שינוי שם הכותרת
   בלבד, אחרי העשן.
   ============================================================================ */

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.amplitude.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // מעברי מסך חלקים בין טאבים (React ViewTransition) — נוסף 2026-10-16
  experimental: { viewTransition: true },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};
export default nextConfig;
