import { store, flushStore } from "../store";

export const CONFIG_KEY = "poker:config";
export const LIVE_KEY = "poker:live"; // משחק פעיל — נשמר אוטומטית כדי שלא ילך לאיבוד
export const DB_KEY = "poker:db";

/* קונפיגורציה: cache במשתנה מודול, נטען פעם אחת, listeners */
const DEFAULT_CONFIG = {
  chipsPerShekel: 2,
  defaultBuyin: 50,
  botOn: false, // הבוט בוואטסאפ מגיב רק כשהדגל דלוק; נדלק אוטומטית עם פתיחת משחק
  /* צופים ב-/g/slug רואים גם היסטוריה; false = רק משחק חי + הזמנה */
  shareHistory: true,
};

let _configCache = { ...DEFAULT_CONFIG };
const _configListeners = new Set();

export const getConfig = () => _configCache; // קריאה סינכרונית

export const onConfig = (fn) => {
  _configListeners.add(fn);
  return () => _configListeners.delete(fn);
};

export async function loadConfig() {
  const raw = await store.get(CONFIG_KEY);
  if (raw) {
    try {
      _configCache = {
        ...DEFAULT_CONFIG,
        ...JSON.parse(raw),
      };
    } catch {}
  }
  _configListeners.forEach((f) => f(_configCache));
}

export async function setConfig(patch) {
  _configCache = {
    ..._configCache,
    ...patch,
  };
  _configListeners.forEach((f) => f(_configCache));
  await store.set(CONFIG_KEY, JSON.stringify(_configCache));
  // מתג הבוט קריטי — דוחפים מיד לשרת במקום לחכות ל-debounce
  // (כתיבה דחויה עלולה להתפספס אם הדף נסגר/הושהה, ואז האפליקציה מראה
  // "פעיל" אבל הבוט בשרת כבוי ולא מגיב).
  // דוחפים בכל כתיבה מפורשת של botOn — לא סומכים על המטמון המקומי.
  if ("botOn" in patch) {
    try {
      await flushStore();
    } catch {
      /* נשאר ב-pending — ינסה שוב בטעינה הבאה */
    }
  }
}
