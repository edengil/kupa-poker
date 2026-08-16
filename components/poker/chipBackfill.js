/* ============================================================================
   גיבוי ג'יטונים מהחודש האחרון — חולץ מצ'אט הוואטסאפ (אוג׳ 2026),
   כשהבוט שאל "כמה ג'יטונים ל…?" וקיבל תשובה / אישר "יצא עם N".

   מקור: WhatsApp Chat — קופה - פוקר, יולי–אוגוסט 2026 (רק ערבים עם סגירת בוט).
   ============================================================================ */

import { AL, canon } from "./helpers.js";

/** iso → { canonicalOrRawName: chips } */
export const CHIP_BACKFILL = {
  "2026-08-06": {
    "אורן גיל": 1450,
    "עדן גיל": 720,
    "דוד בני": 710,
    "קובי": 400,
    "דור לירז": 200,
    "ירין": 120,
    "דן ינקלויץ": 0,
    "עדן לירז": 0,
  },
  "2026-08-08": {
    "עדן לירז": 770,
    "דור לירז": 725,
    "קובי סעדה": 520,
    "נתנאל כהן": 350,
    "אופיר סנה": 300,
    "אורן גיל": 70,
    "עדן גיל": 0,
  },
  "2026-08-11": {
    "עדן גיל": 840,
    "אורן גיל": 690,
    "דוד בני": 470,
    "אופיר סנה": 430,
    "עדן לירז": 154,
    "דור לירז": 100,
    אסולין: 20,
    נתנאל: 0,
  },
  "2026-08-16": {
    "אורן גיל": 1840,
    "עדן לירז": 1270,
    "אופיר סנה": 420,
    "עדן גיל": 345,
    שגיא: 100,
    "דור לירז": 25,
    "קובי סעדה": 0,
  },
};

/** מוצא ערך ג'יטונים במפת ערב לפי שם שחקן (עם כינויים והתאמה חלקית). */
export function lookupChips(map, name, aliases) {
  if (!map || name == null) return null;
  const c = canon(String(name).trim(), aliases);
  const tryKeys = [c, String(name).trim()];
  for (const k of tryKeys) {
    if (map[k] != null && map[k] !== "") return +map[k];
  }
  for (const [k, v] of Object.entries(map)) {
    const ck = canon(k, aliases);
    if (ck === c) return +v;
    // קובי ↔ קובי סעדה, נתנאל ↔ נתנאל כהן
    if (c.startsWith(ck + " ") || ck.startsWith(c + " ") || c === ck) return +v;
  }
  return null;
}

/**
 * ממלא chips חסרים על רשומות ערב לפי הגיבוי מהצ'אט.
 * לא דורס chips שכבר שמורים. מחזיר true אם משהו השתנה.
 *
 * אם הערב נשמר אחרי חצות (iso = למחרת) — מנסים גם את יום האתמול בגיבוי.
 */
export function applyChipBackfill(db) {
  if (!db?.sessions?.length) return false;
  const aliases = AL(db);
  let changed = false;

  const prevIso = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };

  for (const s of db.sessions) {
    if (!Array.isArray(s.entries) || !s.iso) continue;
    const map = CHIP_BACKFILL[s.iso] || CHIP_BACKFILL[prevIso(s.iso)];
    if (!map) continue;
    for (const e of s.entries) {
      if (e.chips != null && e.chips !== "") continue;
      const chips = lookupChips(map, e.name, aliases);
      if (chips == null || !Number.isFinite(chips)) continue;
      e.chips = chips;
      changed = true;
    }
  }
  return changed;
}
