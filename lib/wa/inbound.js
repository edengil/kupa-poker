/* --------------------------- עזרי הודעה נכנסת --------------------------- */
const digits = (v) => String(v || "").replace(/\D/g, "");

export function extractMessage(body) {
  const list = Array.isArray(body?.messages) ? body.messages : [];
  for (const m of list) {
    const text = m?.text?.body ?? (typeof m?.text === "string" ? m.text : null);
    if (!text) continue;
    return {
      text,
      chatId: m.chat_id || m.chatId || "",
      from: digits(m.from),
      fromMe: m.from_me === true || m.fromMe === true,
      id: m.id,
    };
  }
  return null;
}

/* מי רשאי לפקד.
   בחרתי רשימה מפורשת ולא "מנהלי הקבוצה" משתי סיבות: משיכת רשימת המנהלים
   מ-Whapi עולה בקשה בכל הודעה ותאכל את המכסה, ומנהל בקבוצה הוא לא בהכרח מי
   שאתה רוצה שיזיז לך כסף. להוספה — WHATSAPP_ALLOWED ב-Vercel, מספרים
   מופרדים בפסיק. */
export function isAllowed(msg, ownerPhone, allowedList = "") {
  if (msg.fromMe) return true;
  const numbers = [ownerPhone, ...String(allowedList).split(",")]
    .map(digits)
    .filter((n) => n.length >= 9);
  return numbers.some((n) => msg.from.endsWith(n.slice(-9)));
}

// שם ישן, נשמר כדי לא לשבור קוד קיים
export const isOwner = isAllowed;
