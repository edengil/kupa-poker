/* מגדר ושמות קנוניים לטקסטים בוואטסאפ ובחלוקה.
   בקובץ נפרד כדי ש-report.js ו-settlement.js ישתמשו בו בלי ייבוא מעגלי.
   המפה והרשימה עצמן חיות במקור האחד — lib/poker/names.js (גל 4,
   ממצא 12); הקובץ הזה רק נגזר מהן ומספק את פונקציות המגדר. */

import { deriveAliases, FEMALE_NAMES } from "./poker/names.js";

/* שמות שכותבים עליהם בלשון נקבה — הרשימה האחת מ־names.js */
export const FEMALE = FEMALE_NAMES;

/* מפת הכינויים של החלוקה — נגזרת מוצהרת מהמפה האחת: המפתחות הם
   שמות החלוקה ההיסטוריים + 7 השמות הקצרים שהיו חסרים כאן וזיהוי
   הזוגות נכשל בלעדיהם (שגיא, דוד בני, בני גיל, בני, אופיר, איציק,
   ירדן — גל 4, ממצא 12). הערכים תמיד מהמפה האחת. */
export const SETTLE_ALIASES = deriveAliases([
  "עדן",
  "אורן",
  "דור",
  "עדן ל",
  "עדן של דור",
  "עדן גורשומוב",
  "עדן גושמרוב",
  "נתנאל",
  "שגיא",
  "דוד בני",
  "בני גיל",
  "בני",
  "אופיר",
  "איציק",
  "ירדן",
]);

export const canonName = (name) => {
  const n = String(name).trim();
  return SETTLE_ALIASES[n] || n;
};

export const isFemaleName = (name) => {
  const n = String(name).trim();
  return FEMALE.includes(n) || FEMALE.includes(canonName(n));
};

/** בוחר צורת זכר או נקבה לפי השם: byGender("אורן גיל", "חייב", "חייבת"). */
export const byGender = (name, male, female) => (isFemaleName(name) ? female : male);
