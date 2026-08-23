/* סימן הבוט — הודעות יוצאות לוואטסאפ. ה-webhook מתעלם מכל הודעה שמכילה אותו. */

export const BOT_MARK = "🤖";

/** מוסיף BOT_MARK בתחילת הטקסט אם עדיין אין — בלי כפילות. */
export function withBotMark(text) {
  if (!text) return "";
  const t = String(text).trimStart();
  if (t.startsWith(BOT_MARK)) return text;
  return `${BOT_MARK} ${text}`;
}
