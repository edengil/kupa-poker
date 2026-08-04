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

/* --------------------------------------------------------------------------
   מצב בעלים: קורא מהשורה, וכותב אליה בחזרה.

   הכתיבה עוברת debounce כי האפליקציה שומרת את כל ה-DB כבלוב אחד בכל פעולה,
   ובמשחק חי זה יכול לקרות כמה פעמים ברצף. אין טעם לשלוח כל אחת מהן לשרת.
   flushStore() מרוקן את התור מיידית — שימושי לפני יציאה מהדף.
   onFlush נקרא אחרי שהכתיבה נחתה, ומשמש לשליחת ping לצופים.
   -------------------------------------------------------------------------- */
export function makeSupabaseStore(supabase, groupId, { debounceMs = 700, onFlush } = {}) {
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
        if (typeof onFlush === "function") onFlush();
      });
    await inFlight;
  }

  return {
    async get(key) {
      if (key in cache) return cache[key];
      const column = COLUMN[key];
      if (!column) return null;

      const { data, error } = await supabase
        .from("groups")
        .select(column)
        .eq("id", groupId)
        .single();

      if (error) {
        console.error("Supabase read failed:", error.message);
        return null;
      }
      const value = data?.[column];
      cache[key] = value == null ? null : JSON.stringify(value);
      return cache[key];
    },

    async set(key, value) {
      const column = COLUMN[key];
      if (!column) return false;

      cache[key] = value;
      try {
        pending[column] = JSON.parse(value);
      } catch {
        return false;
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
