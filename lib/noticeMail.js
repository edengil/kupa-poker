import nodemailer from "nodemailer";

/* אותו חשבון ג׳ימייל שכבר שולח התראות תפעול. אין ספק מייל חדש. */

export async function sendPlayerNotice({ to, subject, text }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const address = String(to || "").trim();
  if (!user || !pass || !address) return { sent: false, reason: "no mail" };
  try {
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    await transport.sendMail({
      from: user,
      to: address,
      subject: String(subject || "קופה — פוקר").slice(0, 140),
      text: text || "",
    });
    return { sent: true };
  } catch (e) {
    console.error("player notice email failed:", e instanceof Error ? e.message : e);
    return { sent: false, reason: "send failed" };
  }
}
