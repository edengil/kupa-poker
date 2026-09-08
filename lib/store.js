/* ============================================================================
   שכבת האחסון.

   האפליקציה המקורית קראה וכתבה דרך אובייקט `store` עם שתי מתודות בלבד:
       await store.get(key)          -> string | null
       await store.set(key, value)   -> boolean

   הצורה הזאת נשמרת כאן במדויק, כך שקוד האפליקציה לא משתנה. מה שמתחלף זו רק
   המימוש שמאחוריה: במקום localStorage — שורה אחת ב-Supabase.
   ============================================================================ */

import { adoptRemoteLiveOnFlush } from "./liveMerge.js";

export const DB_KEY = "poker:db";
export const CONFIG_KEY = "poker:config";
export const LIVE_KEY = "poker:live";

// מיפוי בין מפתחות האפליקציה לעמודות בטבלה
const COLUMN = {
  [DB_KEY]: "data",
  [CONFIG_KEY]: "config",
  [LIVE_KEY]: "live",
};

/* --------------------------------------------------------------------------
   מימוש ריק כברירת מחדל, עד שדף מגדיר מימוש אמיתי.
   -------------------------------------------------------------------------- */
let impl = {
  get: async () => null,
  set: async () => false,
};

export const store = {
  get: (key) => impl.get(key),
  set: (key, value) => impl.set(key, value),
};

export function configureStore(next) {
  impl = next;
}

/* --------------------------------------------------------------------------
   מצב קריאה בלבד: הנתונים נטענים מראש לזיכרון, כתיבה פשוט לא קורה.
   -------------------------------------------------------------------------- */
export function makeReadOnlyStore(snapshot) {
  const cache = {
    [DB_KEY]: snapshot?.data ? JSON.stringify(snapshot.data) : null,
    [CONFIG_KEY]: snapshot?.config ? JSON.stringify(snapshot.config) : null,
    [LIVE_KEY]: null,
  };
  return {
    get: async (key) => cache[key] ?? null,
    set: async () => false,
  };
}

/* -------------------------- מטמון מקומי לדפדפן --------------------------
   העתק אחרון של הנתונים נשמר ב-localStorage כדי שהאפליקציה תעלה מיידית,
   בלי לחכות לרשת. הרשת עדיין נבדקת ברקע — ואם משהו השתנה, onStale מודיע
   לדף לרענן. גישה של stale-while-revalidate בקטן. */
const lsKey = (groupId, column) => `poker:cache:${groupId}:${column}`;
const pendingKey = (groupId) => `poker:pending:${groupId}`;

function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

function readPersistedPending(groupId) {
  try {
    const raw = lsGet(pendingKey(groupId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writePersistedPending(groupId, pending) {
  const keys = Object.keys(pending);
  if (!keys.length) lsSet(pendingKey(groupId), null);
  else lsSet(pendingKey(groupId), JSON.stringify(pending));
}

export function clearLocalCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("poker:cache:") || k.startsWith("poker:pending:"))) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

/* --------------------------------------------------------------------------
   מצב בעלים: קורא מהשורה, וכותב אליה בחזרה.

   הכתיבה עוברת debounce כי האפליקציה שומרת את כל ה-DB כבלוב אחד בכל פעולה,
   ובמשחק חי זה יכול לקרות כמה פעמים ברצף. אין טעם לשלוח כל אחת מהן לשרת.
   flushStore() מרוקן את התור מיידית — שימושי לפני יציאה מהדף.
   onFlush נקרא אחרי שהכתיבה נחתה עם ה-patch שנכתב, ומשמש לשליחת ping לצופים.
   onStale(key) נקרא כשקריאת רקע גילתה שהמטמון המקומי לא עדכני.
   -------------------------------------------------------------------------- */
export function makeSupabaseStore(supabase, groupId, { debounceMs = 700, onFlush, onStale, onStatus } = {}) {
  const cache = {};
  const pending = { ...readPersistedPending(groupId) };
  let timer = null;
  let inFlight = Promise.resolve();

  const KEY_BY_COLUMN = Object.fromEntries(
    Object.entries(COLUMN).map(([key, column]) => [column, key])
  );

  /* משחזרים לתצוגה כתיבות שלא הספיקו לעלות לשרת לפני רענון/ניתוק. */
  for (const [column, value] of Object.entries(pending)) {
    const key = KEY_BY_COLUMN[column];
    if (!key) continue;
    cache[key] = value == null ? "" : JSON.stringify(value);
    lsSet(lsKey(groupId, column), value == null ? null : cache[key]);
  }
  if (Object.keys(pending).length) {
    onStatus?.("pending");
    timer = setTimeout(flush, 400);
  }

  const persistPending = () => writePersistedPending(groupId, pending);

  async function writePending() {
    const patch = { ...pending };
    for (const k of Object.keys(pending)) delete pending[k];
    persistPending();
    if (Object.keys(patch).length === 0) return true;
    onStatus?.("saving");
    try {
      /* לפני כתיבת לייב — קוראים מהשרת. אם הבוט כבר רשם יציאות/applied,
         ממזגים במקום לדרוס (debounce מקומי / מעבר לרקע היו מוחקים ג'יטונים).
         adoptedRemoteLive = צריך remount: המטמון עודכן אבל React עדיין ריק ביצא. */
      let adoptedRemoteLive = false;
      if ("live" in patch && patch.live != null && typeof patch.live === "object") {
        const { data, error } = await supabase
          .from("groups")
          .select("live")
          .eq("id", groupId)
          .single();
        if (error) throw new Error(error.message);
        if (data?.live) {
          const { live, adopted } = adoptRemoteLiveOnFlush(patch.live, data.live);
          if (adopted) {
            patch.live = live;
            cache[LIVE_KEY] = JSON.stringify(patch.live);
            lsSet(lsKey(groupId, "live"), cache[LIVE_KEY]);
            adoptedRemoteLive = true;
          }
        }
      }

      const { error } = await supabase
        .from("groups")
        .update(patch)
        .eq("id", groupId);
      if (error) throw new Error(error.message);
      onStatus?.(Object.keys(pending).length ? "pending" : "saved");
      if (typeof onFlush === "function") onFlush(patch, { adoptedRemoteLive });
      return true;
    } catch (error) {
      /* שומרים לניסיון חוזר — בלי לדרוס עריכות שנכנסו בזמן ההמתנה לשרת. */
      for (const [column, value] of Object.entries(patch)) {
        if (!(column in pending)) pending[column] = value;
      }
      persistPending();
      console.error("Supabase write failed:", error.message);
      onStatus?.("error");
      return false;
    }
  }

  function flush() {
    // Include the read/merge in the queue: a slow older request must never overwrite a newer one.
    inFlight = inFlight.then(writePending, writePending);
    return inFlight;
  }

  async function fetchColumn(key, column) {
    const { data, error } = await supabase
      .from("groups")
      .select(column)
      .eq("id", groupId)
      .single();
    if (error) {
      console.error("Supabase read failed:", error.message);
      return undefined;
    }
    const value = data?.[column];
    return value == null ? null : JSON.stringify(value);
  }

  return {
    async get(key) {
      const column = COLUMN[key];
      if (!column) return null;

      // יש כתיבה ממתינה / ערך בזיכרון — מקור האמת הוא מה שעל המסך.
      // בלי זה, remount באמצע סגירה היה טוען מהשרת גרסה ישנה ודורס את העריכה.
      if (key in cache) return cache[key];

      // מטמון מקומי (כולל לייב): מציגים מיד, ומאמתים ברקע כשיש רשת.
      const local = lsGet(lsKey(groupId, column));
      if (local != null) {
        cache[key] = local;
        fetchColumn(key, column).then((fresh) => {
          if (fresh === undefined || fresh === local) return;
          if (cache[key] !== local || column in pending) return;
          cache[key] = fresh;
          lsSet(lsKey(groupId, column), fresh);
          if (typeof onStale === "function") onStale(key);
        });
        return local;
      }

      const fresh = await fetchColumn(key, column);
      if (fresh === undefined && key === DB_KEY) throw new Error("לא ניתן לטעון את ההיסטוריה. בדוק את החיבור ונסה שוב.");
      if (fresh === undefined) return null;
      cache[key] = fresh;
      lsSet(lsKey(groupId, column), fresh);
      return fresh;
    },

    async set(key, value) {
      const column = COLUMN[key];
      if (!column) return false;

      // ערך ריק פירושו ניקוי. האפליקציה שולחת "" כשמשחק חי מסתיים, וקודם
      // JSON.parse היה זורק כאן והכתיבה פשוט לא קרתה — כך שמשחק שנגמר נשאר
      // תקוע במסד והצופים המשיכו לראות אותו.
      if (value === "" || value == null) {
        pending[column] = null;
      } else {
        try {
          pending[column] = JSON.parse(value);
        } catch {
          return false;
        }
      }

      cache[key] = value;
      lsSet(lsKey(groupId, column), value === "" ? null : value);
      persistPending();
      onStatus?.("pending");

      clearTimeout(timer);
      // לייב נשמר מהר יותר — מצמצם את החלון שבו רענון חיצוני יכול לדרוס עריכה
      const delay = key === LIVE_KEY ? 250 : debounceMs;
      timer = setTimeout(flush, delay);
      return true;
    },

    /** מוחק ערך מהמטמון בזיכרון — כדי שהקריאה הבאה תבוא מהרשת (אחרי עדכון מהבוט).
        גם מבטל כתיבה ממתינה לאותו מפתח, כדי ש-flush ישן לא ידרוס את השרת. */
    forget(key) {
      delete cache[key];
      const column = COLUMN[key];
      if (column && Object.prototype.hasOwnProperty.call(pending, column)) {
        delete pending[column];
        persistPending();
      }
      if (Object.keys(pending).length === 0) {
        clearTimeout(timer);
        timer = null;
      }
    },

    /** תמונת לייב נוכחית מהתור/מטמון — למיזוג לפני remount אחרי עדכון מהבוט. */
    snapshotLive() {
      if (Object.prototype.hasOwnProperty.call(pending, "live")) {
        return pending.live;
      }
      if (LIVE_KEY in cache) {
        const raw = cache[LIVE_KEY];
        if (raw == null || raw === "") return null;
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
      return undefined;
    },

    /** מזין את מטמון הלייב בלי לסמן כתיבה — אחרי מיזוג עם השרת. */
    seedLive(value) {
      if (value == null) {
        cache[LIVE_KEY] = null;
        lsSet(lsKey(groupId, "live"), null);
        return;
      }
      cache[LIVE_KEY] = typeof value === "string" ? value : JSON.stringify(value);
      lsSet(lsKey(groupId, "live"), cache[LIVE_KEY]);
      delete pending.live;
      persistPending();
    },

    hasPending() {
      return Object.keys(pending).length > 0;
    },

    async flush() {
      clearTimeout(timer);
      return flush();
    },
  };
}

export async function flushStore() {
  if (typeof impl.flush === "function") return impl.flush();
  return true;
}

/** מנקה מפתח מהמטמון בזיכרון (למשל לפני remount אחרי עדכון מהבוט). */
export function forgetStoreKey(key) {
  if (typeof impl.forget === "function") impl.forget(key);
}

/** תמונת לייב מהתור/מטמון, או undefined אם אין. */
export function snapshotStoreLive() {
  if (typeof impl.snapshotLive === "function") return impl.snapshotLive();
  return undefined;
}

/** מזין מטמון לייב אחרי מיזוג עם השרת. */
export function seedStoreLive(value) {
  if (typeof impl.seedLive === "function") impl.seedLive(value);
}
