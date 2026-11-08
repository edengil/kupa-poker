/* מעקב "נצפה" להתראות — בסגנון פייסבוק: הבאדג' סופר רק התראות עם id
   שטרם נצפה. מגירת ההתראות מדווחת אילו פריטים הוצגו בפועל, ורק הם
   מסומנים כנצפו (גל 5, פריט 5.2); התראה חדשה (id חדש) מדליקה שוב
   את הבאדג'. ה־seen נשאר מקומי במכשיר (localStorage).
   האחסון נשלח כפרמטר (localStorage באפליקציה, מזויף בטסטים). */

/* מפתח ה־seen כולל רכיב קבוצה (גל 5, פריט 5.2): בלי הרכיב, "נצפה"
   בקבוצה אחת דיכא את הבאדג' של אותה התראה (למשל plan/summary עם id
   זהה) בקבוצה אחרת על אותו מכשיר. בלי groupId — פורמט המורשת. */
export const seenKey = (viewerName, groupId) =>
  groupId
    ? `kupa:notices:seen:${groupId}:${viewerName || "anon"}`
    : `kupa:notices:seen:${viewerName || "anon"}`;

/** רשימת ה־id-ים שנצפו; [] כשהאחסון ריק, פגום או לא זמין. */
export function loadSeenIds(storage, viewerName, groupId) {
  try {
    const raw = storage?.getItem(seenKey(viewerName, groupId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** שמירת ה־id-ים שנצפו; לא מפיל את האפליקציה אם האחסון חסום/מלא. */
export function saveSeenIds(storage, viewerName, ids, groupId) {
  try {
    storage?.setItem(seenKey(viewerName, groupId), JSON.stringify([...new Set(ids || [])]));
  } catch {
    /* מתעלמים — הבאדג' פשוט ייספר מחדש */
  }
}

/** ההתראות שטרם נצפו — מה שהבאדג' סופר. */
export function unseenNotices(notices, seenIds) {
  const seen = new Set(seenIds || []);
  return (notices || []).filter((n) => n && typeof n.id === "string" && !seen.has(n.id));
}

/** מוסיף id-ים לנצפים; מחזיר ‎{ ids, changed }‎. */
export function markSeenIds(seenIds, ids) {
  const next = new Set(seenIds || []);
  let changed = false;
  for (const id of ids || []) {
    if (typeof id === "string" && !next.has(id)) {
      next.add(id);
      changed = true;
    }
  }
  return { ids: [...next], changed };
}
