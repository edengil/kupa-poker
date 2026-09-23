import { sendAlertEmail } from "./alertMail";

/* ============================================================================
   ניטור שגיאות קליל.

   הרבה כשלים בשרת נבלעים בשקט (שליחה ל-Whapi נכשלה, כתיבה למסד נכשלה, דוח
   לא יצא) — וכך גילינו שהבוט מת רק אחרי שבועיים. הפונקציה הזאת שולחת התראה
   ברגע שמשהו נשבר.

   בלי הגדרה היא פשוט רושמת ל-console (נראה בלוגים של Vercel).
   מייל נשלח ל-edengil94@gmail.com כשמוגדרים GMAIL_USER ו-GMAIL_APP_PASSWORD.
   אם מגדירים `ERROR_ALERT_WEBHOOK` (Discord או Slack), ההתראה נשלחת גם לשם.
   ============================================================================ */

/**
 * מדווח על שגיאת שרת. תמיד רושם ל-console; שולח ל-webhook רק אם הוגדר.
 * @param {unknown} err   השגיאה
 * @param {string} where  איפה זה קרה, לזיהוי מהיר (למשל "reports/send")
 */
export async function reportError(err, where = "") {
  const detail = err instanceof Error ? err.message : String(err);
  const line = `🚨 kupa-poker${where ? ` · ${where}` : ""}: ${detail}`;
  // תמיד ללוג — שם זה מופיע בלוגים של Vercel
  const stack = err instanceof Error ? err.stack || "" : "";
  console.error(line, stack);

  await sendAlertEmail(line, { where, stack });

  const url = process.env.ERROR_ALERT_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Discord מצפה ל-content, Slack מצפה ל-text — שולחים את שניהם, כל אחד
      // מתעלם מהשדה השני. ככה אותו webhook עובד לשתי הפלטפורמות.
      body: JSON.stringify({ content: line, text: line }),
    });
  } catch {
    // אם גם ההתראה נכשלה — כבר רשמנו ל-console, ואין טעם להפיל בגלל זה כלום
  }
}
