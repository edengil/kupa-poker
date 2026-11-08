/* פרסור טקסט סיכום (הזנה) — חולץ מ-PokerApp.jsx. */

/* הסכום עשרוני (320.5) — עד גל 5 הפרסר תפס רק שלמים וקטע את השאר
   בשקט, כך שפתיחה+שמירה של ערב שמור בגיליון העריכה שינתה סכומים
   (ממצא ביקורת 11). */
const KW = new RegExp(
  "^\\s*(.+?)\\s*(מגיע(?:ה|ים)?|מרווח(?:ת|ים)?|מקבל(?:ת)?|זכאי(?:ת)?|חייב(?:ת|ים|ות)?)\\s*(\\d+(?:\\.\\d+)?)"
);

/* שורת "סגר/סגרה באפס" — כך toWhatsApp מדפיס שחקן עם נטו 0. עד גל 5
   השורה לא נפרסה חזרה, ושחקן־אפס נעלם מהערב בפתיחה+שמירה בלי שינוי. */
const ZERO = /^\s*(.+?)\s+(?:סגר|סגרה)\s+באפס\s*$/;

const SKIP_NAMES = ["כניסות", "סיכום", "בנתיים", "בינתיים"];
const isCombined = (name) =>
  name
    .split(/\s+/)
    .slice(1)
    .some((t) => t.startsWith("ו") && t.length > 2);

export function parseEntries(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[🥇🥈🥉]\s*/, "");
    if (!line) continue;
    const m = line.match(KW);
    if (m) {
      const name = m[1].trim().replace(/^[🥇🥈🥉]\s*/, "");
      if (!name || SKIP_NAMES.includes(name)) continue;
      const amt = parseFloat(m[3]);
      if (!Number.isFinite(amt)) continue;
      const sign = /חייב/.test(m[2]) ? -1 : 1;
      out.push({
        name,
        amount: sign * amt,
        combined: isCombined(name),
      });
      continue;
    }
    const z = line.match(ZERO);
    if (z) {
      const name = z[1].trim().replace(/^[🥇🥈🥉]\s*/, "");
      if (!name || SKIP_NAMES.includes(name)) continue;
      out.push({ name, amount: 0, combined: isCombined(name) });
    }
  }
  return out;
}

export function parseDate(text, fy) {
  const m = text.match(/(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/);
  if (!m) return null;
  const d = +m[1],
    mo = +m[2];
  let y = m[3] ? +m[3] : fy;
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return {
    d,
    mo,
    y,
    iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  };
}
