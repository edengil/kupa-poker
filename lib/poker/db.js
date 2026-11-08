/* עזרי DB קטנים — חולצו מ-PokerApp.jsx. */

export const normalize = (d) => ({
  sessions: [],
  yearly: [],
  monthly: [],
  aliases: {},
  emails: {},
  phones: {},
  roster: [],
  ...d,
});

export function validateImport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.sessions)) {
    throw new Error("הקובץ אינו גיבוי פוקר: חסרה רשימת ערבים.");
  }
  for (const key of ["sessions", "yearly", "monthly"]) {
    if (data[key] !== undefined && !Array.isArray(data[key])) throw new Error(`רשימת ${key} אינה תקינה.`);
    for (const record of data[key] || []) {
      if (!record || !Array.isArray(record.entries) || !Number.isInteger(record.y)) throw new Error("נמצאה רשומה ללא שנה או תוצאות תקינות.");
      if (record.entries.some((e) => !e || typeof e.name !== "string" || !e.name.trim() || typeof e.amount !== "number" || !Number.isFinite(e.amount))) {
        throw new Error("נמצאה תוצאה ללא שם או סכום מספרי תקין.");
      }
      if (key === "sessions") {
        const date = new Date(`${record.iso}T12:00:00Z`);
        if (typeof record.id !== "string" || !record.id || !/^\d{4}-\d{2}-\d{2}$/.test(record.iso) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== record.iso || date.getUTCFullYear() !== record.y || date.getUTCMonth() + 1 !== record.mo || date.getUTCDate() !== record.d) {
          throw new Error("נמצא ערב עם מזהה או תאריך לא תקין.");
        }
      }
    }
  }
  if (new Set(data.sessions.map((s) => s.id)).size !== data.sessions.length) throw new Error("בקובץ יש מזהי ערבים כפולים.");
  if (data.roster !== undefined && (!Array.isArray(data.roster) || data.roster.some((n) => typeof n !== "string"))) throw new Error("רשימת השחקנים אינה תקינה.");
  if (data.aliases !== undefined && (!data.aliases || typeof data.aliases !== "object" || Array.isArray(data.aliases) || Object.values(data.aliases).some((n) => typeof n !== "string"))) throw new Error("רשימת הכינויים אינה תקינה.");
  if (data.emails !== undefined && (!data.emails || typeof data.emails !== "object" || Array.isArray(data.emails) || Object.values(data.emails).some((n) => typeof n !== "string"))) throw new Error("רשימת האימיילים אינה תקינה.");
  if (data.phones !== undefined && (!data.phones || typeof data.phones !== "object" || Array.isArray(data.phones) || Object.values(data.phones).some((n) => typeof n !== "string"))) throw new Error("רשימת הטלפונים אינה תקינה.");
  return normalize(data);
}

export function exportDb(db) {
  const blob = new Blob([JSON.stringify(db, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kupa-poker-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ============================================================================
   גיבוי מלא (גל 3, פריט 3.2 — G10): שלושת הבלובים של הקבוצה בקובץ אחד —
   db (ההיסטוריה), config (ההגדרות) ו־live (הערב החי). עד הגל הגיבוי
   הידני כלל רק את ה־db, בלי config/live, ושם הקובץ היה לפי תאריך בלבד —
   שני גיבויים באותו יום דרסו זה את זה. עכשיו השם נושא חותמת זמן מלאה.
   הגיבוי הישן (בלי שדה format) ממשיך להיקרא: ייבוא שלו מחליף רק את ה־db.
   ============================================================================ */

export const FULL_BACKUP_FORMAT = "kupa-poker-full-backup";

/** ‏"2026-11-08T15-42-10" — חותמת זמן מלאה ובטוחה לשם קובץ. */
export function fullBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/\..*$/, "").replace(/:/g, "-");
}

export function fullBackupFilename(date = new Date()) {
  return `kupa-poker-full-${fullBackupTimestamp(date)}.json`;
}

function plainObjectOrThrow(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`הגיבוי המלא אינו תקין: ${label} חייב להיות אובייקט.`);
  }
  return value;
}

export function buildFullBackup({ db, config, live }, date = new Date()) {
  return {
    format: FULL_BACKUP_FORMAT,
    exportedAt: date.toISOString(),
    db: normalize(db),
    config: config ?? {},
    live: live ?? null,
  };
}

/**
 * מאמת קובץ גיבוי ומחזיר את שלושת הבלובים.
 * קובץ מלא → { full: true, db, config, live } (db מאומת ומנורמל כמו
 * בייבוא רגיל; config חייב להיות אובייקט; live אובייקט או null).
 * קובץ ישן (db בלבד) → { full: false, db }.
 */
export function parseFullBackup(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("הקובץ אינו גיבוי פוקר.");
  }
  if (raw.format === FULL_BACKUP_FORMAT) {
    return {
      full: true,
      db: validateImport(raw.db),
      config: plainObjectOrThrow(raw.config, "config"),
      live:
        raw.live == null ? null : plainObjectOrThrow(raw.live, "live"),
    };
  }
  return { full: false, db: validateImport(raw) };
}

export function downloadJsonFile(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
