/* מעקב "נצפה" להתראות — בסגנון פייסבוק: הבאדג' סופר רק התראות עם id
   שטרם נצפה. פתיחת מגירת ההתראות מסמנת את כל ה־id-ים הנוכחיים כנצפו;
   התראה חדשה (id חדש) מדליקה שוב את הבאדג'.
   האחסון נשלח כפרמטר (localStorage באפליקציה, מזויף בטסטים). */

export const seenKey = (viewerName) => `kupa:notices:seen:${viewerName || "anon"}`;

/** רשימת ה־id-ים שנצפו; [] כשהאחסון ריק, פגום או לא זמין. */
export function loadSeenIds(storage, viewerName) {
  try {
    const raw = storage?.getItem(seenKey(viewerName));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** שמירת ה־id-ים שנצפו; לא מפיל את האפליקציה אם האחסון חסום/מלא. */
export function saveSeenIds(storage, viewerName, ids) {
  try {
    storage?.setItem(seenKey(viewerName), JSON.stringify([...new Set(ids || [])]));
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
