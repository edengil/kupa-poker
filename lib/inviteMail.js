/* שליחת זימון אימייל לשחקן — אותו חשבון ג׳ימייל של התראות השחקנים.
   מייל אחד לשחקן עם שני קישורי אישור חתומים (מגיע / לא מגיע). */

import nodemailer from "nodemailer";

export function inviteMailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendInviteMail({ to, name, summary, yesUrl, noUrl, groupName }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const address = String(to || "").trim();
  if (!user || !pass || !address || !yesUrl || !noUrl) {
    return { sent: false, reason: "no mail" };
  }
  const brand = groupName || "קופה — פוקר";
  const subject = `♠ הזמנה לערב פוקר — ${brand}`;
  const text = [
    `היי ${name},`,
    "",
    `נפתח ערב פוקר חדש ב${brand}:`,
    summary || "",
    "",
    "מאשר/ת הגעה? לחיצה אחת מספיקה:",
    `✅ מגיע: ${yesUrl}`,
    `❌ לא מגיע: ${noUrl}`,
    "",
    "נתראה על הלבד 🃏",
  ].join("\n");
  const html = `<!doctype html>
<html lang="he" dir="rtl"><body style="margin:0;padding:24px;background:#0c1512;font-family:Arial,Helvetica,sans-serif;color:#f3ead8">
<div style="max-width:520px;margin:0 auto;background:#122019;border:1px solid #2b4636;border-radius:16px;padding:24px">
  <div style="font-size:22px;font-weight:700">♠ הזמנה לערב פוקר</div>
  <p style="margin:12px 0 4px;font-size:15px">היי ${escapeHtml(name)},</p>
  <p style="margin:0 0 16px;font-size:15px;line-height:1.7;white-space:pre-line">${escapeHtml(summary)}</p>
  <p style="margin:0 0 10px;font-size:14px;color:#b9c8bd">מאשר/ת הגעה? לחיצה אחת מספיקה:</p>
  <a href="${escapeHtml(yesUrl)}" style="display:block;text-align:center;background:#2f9e63;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:13px;border-radius:12px;margin-bottom:10px">✅ מגיע</a>
  <a href="${escapeHtml(noUrl)}" style="display:block;text-align:center;background:#3a3f3c;color:#f3ead8;text-decoration:none;font-weight:700;font-size:16px;padding:13px;border-radius:12px">❌ לא מגיע</a>
  <p style="margin:16px 0 0;font-size:12px;color:#8fa398">נתראה על הלבד 🃏 · ${escapeHtml(brand)}</p>
</div>
</body></html>`;
  try {
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    await transport.sendMail({ from: user, to: address, subject, text, html });
    return { sent: true };
  } catch (e) {
    console.error("invite email failed:", e instanceof Error ? e.message : e);
    return { sent: false, reason: "send failed" };
  }
}
