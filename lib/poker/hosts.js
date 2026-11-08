/* מארחי הערב + קישור ווייז להזמנה.
   הכתובות המדויקות וקודי הבניינים לא חיים בקוד (גל 4ב, ממצא ביקורת 17):
   מקור ההגדרות הוא משתנה הסביבה KUPA_HOSTS_JSON בשרת — מערך JSON של
   { slug, label, text } לכל מארח. צד הלקוח מקבל מהשרת רק הקרנת
   slug+label (publicHosts); הרשימה המלאה עוברת ל־OwnerApp רק כשהשרת
   אימת בעלות על קבוצה מתוך סשן העוגייה (app/page.jsx; תיקון F5) —
   OwnerApp קורא setHosts בתחילת הרינדור.
   כשמקור ההגדרות לא מוגדר או לא תקין — אין מארחים ידועים: כפתורי
   המארחים לא מוצגים, /w/<slug> מחזיר 404, וקישורי הווייז נבנים משורת
   המיקום החופשית (/w?q=...) כמו לכל כתובת אחרת. טקסטי מיקום שכבר
   נשמרו בתוכניות ממשיכים לעבוד כרגיל.
   השאילתה לווייז נגזרת מהרחוב והעיר בלבד — בלי קוד בניין ובלי קואורדינטות מומצאות.
   בהודעות וואטסאפ משתמשים בקישור קצר בדומיין שלנו (/w/slug) שמפנה לווייז. */

/** מנרמל קלט (מערך או מחרוזת JSON) לרשימת מארחים תקינה; כל השאר → []. */
export function parseHosts(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const h of list) {
    if (!h || typeof h !== "object") continue;
    const slug = typeof h.slug === "string" ? h.slug.trim().toLowerCase() : "";
    const label = typeof h.label === "string" ? h.label.trim() : "";
    const text = typeof h.text === "string" ? h.text.trim() : "";
    if (!slug || !label || !text || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, label, text });
  }
  return out;
}

/** רשימת המארחים ממשתנה הסביבה KUPA_HOSTS_JSON (צד שרת; בלקוח — []). */
export function hostsFromEnv() {
  const raw =
    typeof process !== "undefined" ? process.env.KUPA_HOSTS_JSON : undefined;
  return parseHosts(raw);
}

/** הקרנה ציבורית של רשימת המארחים: רק slug+label, בלי text.
    ה־text מכיל כתובת, קומה/דירה וקוד כניסה לבניין — הוא נשאר בצד השרת
    בלבד (תיקון F5): רכיב־לקוח מקבל את ה־props שלו מסורבלים למטען ה־RSC,
    כך שרשימה מלאה ב־app/page.jsx הייתה נחשפת לכל GET אנונימי של דף
    הבית. הרשימה המלאה נמסרת רק למי שהשרת אימת כבעל קבוצה. */
export function publicHosts(list) {
  return parseHosts(list).map(({ slug, label }) => ({ slug, label }));
}

let activeHosts = hostsFromEnv();

/** מחליף את רשימת המארחים הפעילה (הזרקת צד־לקוח מהשרת, ובדיקות). */
export function setHosts(list) {
  activeHosts = parseHosts(list);
}

/** רשימת המארחים הפעילה. */
export function getHosts() {
  return activeHosts;
}

/** תווית כפתור ב-PlanCard → שחקן קנוני שמארח. */
const HOST_LABEL_PLAYER = {
  "אצלי": "עדן גיל",
  "אופיר סנה": "אופיר סנה",
  "דור ועדן לירז": "דור לירז",
  "שגיא גיל": "שגיא גיל",
  "איציק": "איציק תפילין",
  "נתנאל כהן": "נתנאל כהן",
  "עדן שפאק": "עדן שפאק",
};

const DEFAULT_SITE = "https://kupa-poker.vercel.app";

/** בסיס האתר לקישורים קצרים — בלי סלאש בסוף. */
export function siteBaseUrl() {
  const raw =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL) ||
    DEFAULT_SITE;
  return String(raw).replace(/\/$/, "");
}

/** מארח לפי slug קצר (/w/itzik). */
export function hostBySlug(slug) {
  const key = String(slug || "").trim().toLowerCase();
  if (!key) return null;
  return getHosts().find((h) => h.slug === key) || null;
}

/** מארח ידוע מתוך שורת מיקום (התאמה לטקסט המלא או לראש "אצל …"). */
export function hostFromLocation(location) {
  const raw = String(location || "").trim();
  if (!raw) return null;
  for (const h of getHosts()) {
    const head = h.text.split(" · ")[0];
    if (raw === h.text || raw.startsWith(head)) return h;
  }
  return null;
}

/** מארח קנוני מתוך שורת מיקום (PlanCard / הודעת בוט). */
export function hostPlayerFromLocation(location) {
  const raw = String(location || "").trim();
  if (!raw) return null;
  const known = hostFromLocation(raw);
  if (known) return HOST_LABEL_PLAYER[known.label] || null;
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
  /* שדה חופשי: "הדמיון 99 עיר הדוגמה" בלי נקודות */
  if (/\d/.test(raw) && !/^אצל\s+\S+$/.test(raw) && !/^#?\d+#?$/.test(raw)) {
    const stripped = raw.replace(/^אצל\s+[^·]+(?:·\s*)?/, "").trim();
    const first = stripped.split(/\s*·\s*/)[0];
    if (first && /\d/.test(first) && !SKIP_SEGMENT.test(first)) return first.replace(/^רחוב\s+/, "").trim();
  }
  return null;
}

/** קישור ווייז ישיר (יעד ההפניה מ-/w/…). */
export function wazeNavigateUrl(location) {
  const q = wazeQueryFromLocation(location);
  if (!q) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}

/**
 * קישור קצר בדומיין שלנו:
 * מארח ידוע → /w/itzik
 * כתובת חופשית → /w?q=…
 */
export function wazeShortUrl(location) {
  const known = hostFromLocation(location);
  if (known?.slug) return `${siteBaseUrl()}/w/${known.slug}`;
  const q = wazeQueryFromLocation(location);
  if (!q) return null;
  return `${siteBaseUrl()}/w?q=${encodeURIComponent(q)}`;
}

/** שורות להודעת וואטסאפ / תצוגה: כתובת, ואז קישור ווייז קצר בשורה נפרדת. */
export function planShareLocationLines(location) {
  const loc = String(location || "").trim();
  if (!loc) return [];
  const url = wazeShortUrl(loc);
  if (!url) return [`📍 ${loc}`];
  return [`📍 ${loc}`, "ניווט בווייז:", url];
}
