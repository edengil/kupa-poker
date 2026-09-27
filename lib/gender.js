/* מגדר ושמות קנוניים לטקסטים בוואטסאפ ובחלוקה.
   בקובץ נפרד כדי ש-report.js ו-settlement.js ישתמשו בו בלי ייבוא מעגלי. */

/* שמות שכותבים עליהם בלשון נקבה */
export const FEMALE = [
  "אורן",
  "אורן גיל",
  "עדן גושמרוב",
  "עדן גורשומוב",
  "עדן לירז",
  "ירדן",
  "ירדן תפילין",
];

export const SETTLE_ALIASES = {
  עדן: "עדן גיל",
  אורן: "אורן גיל",
  דור: "דור לירז",
  "עדן ל": "עדן לירז",
  "עדן של דור": "עדן לירז",
  "עדן גורשומוב": "עדן לירז",
  "עדן גושמרוב": "עדן לירז",
  נתנאל: "נתנאל כהן",
};

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
