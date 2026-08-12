/* עזרי DB/פורמט/וואטסאפ — חולצו מ-PokerApp.jsx לשימוש חוזר ברכיבים. */

export const r2 = (v) => Math.round(v * 100) / 100;

export const DEFAULT_ALIASES = {
  "דו": "דן ינקלויץ",
  "דן": "דן ינקלויץ",
  "דן הספר": "דן ויסמן",
  "עדן": "עדן גיל",
  "דוד בני": "בני גיל",
  "בני": "בני גיל",
  "מייק": "מייקי",
  "רוי": "רוי סנדרוביץ",
  "רועי": "רוי סנדרוביץ",
  "איתו": "איתן אלרועי",
  "איתן": "איתן אלרועי",
  "עדן גורשומוב": "עדן לירז",
  "עדן גושמרוב": "עדן לירז",
  "עדן של דור": "עדן לירז",
  "אורן": "אורן גיל",
  "שגיא": "שגיא גיל",
  "אופיר": "אופיר סנה",
  "לאופיר": "אופיר סנה",
  "נתנאל": "נתנאל כהן",
  "איציק": "איציק תפילין",
  "איתיק": "איציק תפילין",
  "ירדן": "ירדן תפילין",
  "איציק וירדן": "ירדן תפילין",
  "אברהם": "אברהם חבבו",
  "בן": "בן אפללו",
  "קובי": "קובי סעדה",
  "דור": "דור לירז",
  "שפאק": "עדן שפאק",
  "שי": "שי יעקובי",
  "שמואל": "שמואל למפך",
  "ניצן": "ניצן ניסים",
  "יובל": "יובל ניסים",
  "עמית": "עמית שלום",
  "דני": "דני גוטניק",
  "ירין": "ירין מלאך"
};

export const FEMALE = new Set(["אורן גיל", "עדן לירז", "ירדן תפילין", "אורן", "עדן גורשומוב", "ירדן"]);

export const balance = (e) => {
  const p = r2(e.filter((x) => x.amount > 0).reduce((sum, x) => sum + x.amount, 0));
  const n = r2(e.filter((x) => x.amount < 0).reduce((sum, x) => sum - x.amount, 0));
  return { pos: p, neg: n, gap: r2(p - n) };
};

export const canon = (n, a) => a[n] || n;

export const hhmm = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const dur = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export const durWords = (ms) => {
  const t = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(t / 60),
    m = t % 60;
  return h > 0 ? (m > 0 ? `${h} שעות ו-${m} דק'` : `${h} שעות`) : `${m} דק'`;
};

/** כינויים אפקטיביים: DEFAULT קובע, ותוספות המשתמש נשמרות. */
export function AL(db) {
  const o = { ...DEFAULT_ALIASES };
  for (const [k, v] of Object.entries(db.aliases || {})) if (!(k in DEFAULT_ALIASES)) o[k] = v;
  return o;
}

export function toWhatsApp(entries, dateObj, title, aliases, alreadyCanon) {
  const head = title
    ? `סיכום פוקר — ${title}`
    : dateObj
      ? `סיכום פוקר ${dateObj.d}.${dateObj.mo}`
      : "סיכום פוקר";
  const norm = entries.map((e) => ({
    name: alreadyCanon ? e.name : canon(e.name, aliases || {}),
    amount: e.amount,
  }));
  const l = norm
    .filter((e) => e.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .map((e) => `${e.name} ${FEMALE.has(e.name) ? "חייבת" : "חייב"} ${Math.abs(e.amount)}`);
  const z = norm
    .filter((e) => e.amount === 0)
    .map((e) => `${e.name} ${FEMALE.has(e.name) ? "סגרה" : "סגר"} באפס`);
  const w = norm
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((e) => `${e.name} ${FEMALE.has(e.name) ? "מגיעה" : "מגיע"} ${e.amount}`);
  const out = [head, ...[l, z, w].filter((g) => g.length).flatMap((g) => ["", ...g])];
  const sa = dateObj && dateObj.startedAt,
    ea = dateObj && dateObj.endedAt;
  if (sa && ea) out.push("", `🕐 ${hhmm(sa)} — ${hhmm(ea)} · ${durWords(ea - sa)}`);
  else if (sa) out.push("", `🕐 התחלנו ${hhmm(sa)}`);
  return out.join("\n").trim();
}

export function waOpen(text) {
  try {
    navigator.clipboard.writeText(text);
  } catch {}
  window.location.href = "whatsapp://send?text=" + encodeURIComponent(text);
}

export async function waShare(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return true;
    } catch (e) {
      if (e && e.name === "AbortError") return true;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    alert("הסיכום הועתק — הדבק בקבוצה");
    return true;
  } catch {}
  return false;
}

export const waSend = waOpen;
