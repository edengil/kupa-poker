/* עזרי פורמט משותפים — חולצו מ-PokerApp.jsx לשימוש חוזר ברכיבים. */

/** סימן +/− ומספר עם פסיקים (en-US). */
export const fmt = (n) =>
  (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toLocaleString("en-US");

/** פער מאזן: פלוס N / חוסר N (מספר מוחלט, בלי סימן מינוס). */
export const fmtGap = (n) => {
  const abs = Math.abs(n).toLocaleString("en-US");
  if (n > 0) return `פלוס ${abs}`;
  if (n < 0) return `חוסר ${abs}`;
  return "0";
};

export const MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
