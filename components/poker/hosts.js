/* כתובות מארחים + קישור ווייז להזמנה.
   השאילתה לווייז נגזרת מהרחוב והעיר בלבד — בלי קוד בניין ובלי קואורדינטות מומצאות. */

export const HOSTS = [
  { label: "אצלי", text: "אצל עדן · לויתן 4, נתניה · קומה 23, דירה 2303 · קוד בניין #4770#" },
  { label: "אופיר סנה", text: "אצל אופיר סנה · לויתן 4, נתניה · קומה 15, דירה 1503 · קוד בניין #4770#" },
  { label: "דור ועדן לירז", text: "אצל דור ועדן לירז · תותחנים 16, כפר יונה · קומת קרקע" },
  { label: "שגיא גיל", text: "אצל שגיא גיל · יהדות הדממה 11, הרצליה" },
  { label: "איציק", text: "אצל איציק · יוסף בורג 10, נתניה · קומה 2, דירה 6 · קוד בניין #7140" },
  { label: "נתנאל כהן", text: "אצל נתנאל כהן · נורוק 6, נתניה · קומה 1, דירה 1 · קוד בניין 06060" },
  { label: "עדן שפאק", text: "אצל עדן שפאק · קרל פופר 6, נתניה · קומה 5, דירה 20" },
];

/** תווית כפתור ב-PlanCard → שחקן קנוני שמארח. */
export const HOST_LABEL_PLAYER = {
  "אצלי": "עדן גיל",
  "אופיר סנה": "אופיר סנה",
  "דור ועדן לירז": "דור לירז",
  "שגיא גיל": "שגיא גיל",
  "איציק": "איציק תפילין",
  "נתנאל כהן": "נתנאל כהן",
  "עדן שפאק": "עדן שפאק",
};

/** מארח קנוני מתוך שורת מיקום (PlanCard / הודעת בוט). */
export function hostPlayerFromLocation(location) {
  const raw = String(location || "").trim();
  if (!raw) return null;
  for (const h of HOSTS) {
    const head = h.text.split(" · ")[0];
    if (raw === h.text || raw.startsWith(head)) return HOST_LABEL_PLAYER[h.label] || null;
  }
  const m = raw.match(/אצל\s+([^·\n,]+)/);
  if (!m) return null;
  const who = m[1].trim();
  if (/שפאק/.test(who)) return "עדן שפאק";
  if (/לירז|דור ועדן/.test(who)) return "דור לירז";
  if (/נתנאל/.test(who)) return "נתנאל כהן";
  if (/איציק/.test(who)) return "איציק תפילין";
  if (/אופיר/.test(who)) return "אופיר סנה";
  if (/שגיא/.test(who)) return "שגיא גיל";
  if (/^עדן/.test(who)) return "עדן גיל";
  return null;
}

const SKIP_SEGMENT = /^(?:אצל\s|קומה|דירה|קוד)/;

/** חלק הכתובת שמתאים לניווט — רחוב ומספר, בלי קומה/קוד. */
export function wazeQueryFromLocation(location) {
  const raw = String(location || "").trim();
  if (!raw) return null;
  const parts = raw.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
  const street = parts.find((p) => /\d/.test(p) && !SKIP_SEGMENT.test(p));
  if (street) return street.replace(/^רחוב\s+/, "").trim();
  /* שדה חופשי: "תותחנים 16 כפר יונה" בלי נקודות */
  if (/\d/.test(raw) && !/^אצל\s+\S+$/.test(raw) && !/^#?\d+#?$/.test(raw)) {
    const stripped = raw.replace(/^אצל\s+[^·]+(?:·\s*)?/, "").trim();
    const first = stripped.split(/\s*·\s*/)[0];
    if (first && /\d/.test(first) && !SKIP_SEGMENT.test(first)) return first.replace(/^רחוב\s+/, "").trim();
  }
  return null;
}

export function wazeNavigateUrl(location) {
  const q = wazeQueryFromLocation(location);
  if (!q) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}

/** שורות להודעת וואטסאפ / תצוגה: כתובת, ואז קישור ווייז בשורה נפרדת. */
export function planShareLocationLines(location) {
  const loc = String(location || "").trim();
  if (!loc) return [];
  const url = wazeNavigateUrl(loc);
  if (!url) return [`📍 ${loc}`];
  return [`📍 ${loc}`, "ניווט בווייז:", url];
}
