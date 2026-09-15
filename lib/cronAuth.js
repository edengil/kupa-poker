/** אימות קריאות cron / בדיקות ידניות לנתיבי API. */

export function authorizedCron(request) {
  const url = new URL(request.url);
  const qs = url.searchParams.get("secret");
  const header = request.headers.get("authorization") || "";
  const vercelCron = request.headers.get("x-vercel-cron") === "1";

  if (process.env.WHATSAPP_WEBHOOK_SECRET && qs === process.env.WHATSAPP_WEBHOOK_SECRET) {
    return true;
  }
  if (process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  /* Vercel Cron שולח את הכותרת הזו. בלי CRON_SECRET בפרויקט הישן
     הדוחות נחסמו ב־403 כל בוקר — לכן מאשרים גם לפי הכותרת. */
  if (vercelCron) return true;
  return false;
}
