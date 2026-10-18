/* טלפונים של שחקנים — חישוב טהור.
   הטלפונים חיים ב־db.phones (שם קנוני → מספר), נערכים בפרופיל השחקן,
   ומשמשים לכפתורי «העתק מספר + סכום» בכרטיס החלוקה (ביט/פייבוקס ידניים —
   אין פורמט קישור ציבורי, מחקר 16.10). */

import { AL, canon } from "./helpers.js";

export interface PhonesDb {
  phones?: Record<string, string>;
  aliases?: Record<string, string>;
  [k: string]: unknown;
}

/** מספר ישראלי מנורמל (ספרות בלבד, מתחיל ב־0) — או null. */
export function normalizePlayerPhone(value: unknown): string | null {
  let d = String(value || "").replace(/\D/g, "");
  if (d.startsWith("972") && d.length >= 11) d = `0${d.slice(3)}`;
  return /^0\d{8,9}$/.test(d) ? d : null;
}

/** טלפון שמור לשחקן (לפי שם קנוני) — או null. */
export function playerPhone(db: PhonesDb | null | undefined, name: string): string | null {
  const A = AL((db || {}) as { aliases?: Record<string, string> });
  const nm = canon(String(name || "").trim(), A);
  return normalizePlayerPhone(db?.phones?.[nm]);
}

/** db חדש עם טלפון מעודכן לשחקן; מחרוזת ריקה מוחקת את המספר. */
export function setPlayerPhone(
  db: PhonesDb | null | undefined,
  name: string,
  phone: unknown,
): PhonesDb {
  const A = AL((db || {}) as { aliases?: Record<string, string> });
  const nm = canon(String(name || "").trim(), A);
  const phones: Record<string, string> = { ...(db?.phones || {}) };
  const v = normalizePlayerPhone(phone);
  if (v) phones[nm] = v;
  else delete phones[nm];
  return { ...(db || {}), phones };
}
