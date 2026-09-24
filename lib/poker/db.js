/* עזרי DB קטנים — חולצו מ-PokerApp.jsx. */

export const normalize = (d) => ({
  sessions: [],
  yearly: [],
  monthly: [],
  aliases: {},
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
