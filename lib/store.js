/* ============================================================================
   שכבת האחסון.

   האפליקציה המקורית קראה וכתבה דרך אובייקט `store` עם שתי מתודות בלבד:
       await store.get(key)          -> string | null
       await store.set(key, value)   -> boolean

   הצורה הזאת נשמרת כאן במדויק, כך שקוד האפליקציה לא משתנה. מה שמתחלף זו רק
   המימוש שמאחוריה: במקום localStorage — שורה אחת ב-Supabase.
   ============================================================================ */

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

export function clearLocalCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("poker:cache:")) localStorage.removeItem(k);
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
export function makeSupabaseStore(supabase, groupId, { debounceMs = 700, onFlush, onStale } = {}) {
  const cache = {};
  const pending = {};
  let timer = null;
  let inFlight = Promise.resolve();

  async function flush() {
    const patch = { ...pending };
    for (const k of Object.keys(pending)) delete pending[k];
    if (Object.keys(patch).length === 0) return;

    inFlight = supabase
      .from("groups")
      .update(patch)
      .eq("id", groupId)
      .then(({ error }) => {
        if (error) {
          console.error("Supabase write failed:", error.message);
          return;
        }
        // הכתיבה נחתה — אפשר להודיע לצופים שיש מה לרענן
        if (typeof onFlush === "function") onFlush(patch);
      });
    await inFlight;
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
      // המשחק החי משתנה גם מבחוץ (פקודות מוואטסאפ), אז אותו קוראים תמיד טרי.
      // השאר נשמר בזיכרון כי הוא משתנה רק דרך האפליקציה עצמה.
      if (key !== LIVE_KEY && key in cache) return cache[key];
      const column = COLUMN[key];
      if (!column) return null;

      // מטמון מקומי: מציגים מיד את מה שנשמר בביקור הקודם, ומאמתים ברקע.
      // ללייב אין מטמון — משחק חי חייב להיות טרי.
      if (key !== LIVE_KEY) {
        const local = lsGet(lsKey(groupId, column));
        if (local != null) {
          cache[key] = local;
          fetchColumn(key, column).then((fresh) => {
            if (fresh === undefined || fresh === local) return;
            cache[key] = fresh;
            lsSet(lsKey(groupId, column), fresh);
            if (typeof onStale === "function") onStale(key);
          });
          return local;
        }
      }

      const fresh = await fetchColumn(key, column);
      if (fresh === undefined) return null;
      cache[key] = fresh;
      if (key !== LIVE_KEY) lsSet(lsKey(groupId, column), fresh);
      return fresh;
    },

    async set(key, value) {
      const column = COLUMN[key];
      if (!column) return false;

      cache[key] = value;
      if (key !== LIVE_KEY) lsSet(lsKey(groupId, column), value === "" ? null : value);

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

      clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
      return true;
    },

    async flush() {
      clearTimeout(timer);
      await flush();
      await inFlight;
    },
  };
}

export async function flushStore() {
  if (typeof impl.flush === "function") await impl.flush();
}
