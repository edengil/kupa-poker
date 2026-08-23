/* ============================================================================
   גיבוי טיפים חד־פעמי לערבים שמורים — כשהטיפ נרשם אחרי הסגירה.
   מודל הטיפ הוא tipper בלבד (name + amount); שדה to אופציונלי לתיעוד.
   ============================================================================ */

import { AL, canon, r2 } from "./helpers.js";

/**
 * טיפים לגיבוי. id קנוני — לא מיישמים פעמיים (session.tipBackfills).
 * nightIso = תאריך הערב ברשימת הסשנים (או יום לפני אם נשמר אחרי חצות).
 */
export const TIP_BACKFILL = [
  {
    id: "tip-backfill:2026-08-23:eden-gil-30",
    nightIso: "2026-08-23",
    name: "עדן גיל",
    amount: 30,
    /** תיעוד בלבד — הסטטיסטיקות לא משתמשות במקבל */
    to: "אורן גיל",
  },
];

function prevIso(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function namesMatch(a, b, aliases) {
  const ca = canon(String(a || "").trim(), aliases);
  const cb = canon(String(b || "").trim(), aliases);
  if (ca === cb) return true;
  if (ca.startsWith(cb + " ") || cb.startsWith(ca + " ")) return true;
  return false;
}

function findEntry(entries, name, aliases) {
  return (entries || []).find((e) => namesMatch(e.name, name, aliases)) || null;
}

function sessionMatchesNight(s, nightIso) {
  if (!s?.iso || !nightIso) return false;
  if (s.iso === nightIso) return true;
  // ערב שנשמר אחרי חצות — iso שלמחרת, הגיבוי על תאריך הערב
  return prevIso(s.iso) === nightIso;
}

/**
 * מוסיף טיפים חסרים לסשנים לפי TIP_BACKFILL.
 * מעדכן tipsGiven על הרשומה; אם כבר יש tips[] — דוחף גם אירוע.
 * מחזיר true אם משהו השתנה.
 */
export function applyTipBackfill(db) {
  if (!db?.sessions?.length || !TIP_BACKFILL.length) return false;
  const aliases = AL(db);
  let changed = false;

  for (const tip of TIP_BACKFILL) {
    const amount = Math.max(0, +tip.amount || 0);
    if (!amount || !tip.id || !tip.name || !tip.nightIso) continue;

    const session = db.sessions.find((s) => sessionMatchesNight(s, tip.nightIso));
    if (!session || !Array.isArray(session.entries)) continue;

    const applied = session.tipBackfills || [];
    if (applied.includes(tip.id)) continue;
    if (Array.isArray(session.tips) && session.tips.some((t) => t?.id === tip.id)) {
      session.tipBackfills = [...applied, tip.id];
      changed = true;
      continue;
    }

    const entry = findEntry(session.entries, tip.name, aliases);
    if (!entry) continue;

    entry.tipsGiven = r2((+entry.tipsGiven || 0) + amount);

    /* tipRecords: אם tips[] לא ריק — רק ממנו. לכן דוחפים רק כשכבר יש יומן.
       ערב עם tipsGiven בלבד נשאר על tipsGiven (כולל העדכון למעלה). */
    if (Array.isArray(session.tips) && session.tips.length > 0) {
      const ev = {
        id: tip.id,
        name: entry.name,
        amount,
        at: Date.now(),
      };
      if (tip.to) ev.to = tip.to;
      session.tips = [...session.tips, ev];
    }

    session.tipBackfills = [...applied, tip.id];
    changed = true;
  }

  return changed;
}
