import nodemailer from "nodemailer";

const TO = "edengil94@gmail.com";
const COOLDOWN_MS = 10 * 60 * 1000;
const recent = new Map();

function canSend(where) {
  const key = where || "general";
  const now = Date.now();
  const prev = recent.get(key) || 0;
  if (now - prev < COOLDOWN_MS) return false;
  recent.set(key, now);
  return true;
}

/** מייל למנהל כשמשהו נשבר בשרת. שקט אם אין סיסמת אפליקציה. */
export async function sendAlertEmail(line, { where = "", stack = "" } = {}) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return;
  if (!canSend(where)) return;
  const to = process.env.ALERT_EMAIL_TO || TO;
  try {
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    await transport.sendMail({
      from: user,
      to,
      subject: line.slice(0, 140),
      text: [line, where && `איפה: ${where}`, stack].filter(Boolean).join("\n\n"),
    });
  } catch (e) {
    console.error("alert email failed:", e instanceof Error ? e.message : e);
  }
}
