import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DB_KEY, makeSupabaseStore, subscribeStoreKey } from "../lib/store.js";

/* ============================================================================
   רגרסיית בודק — אתחול קר: אימות־הרקע של ה־boot חייב להביא את נתוני השרת
   הטריים למסך.

   התרחיש: המטמון המקומי ישן, והשרת מחזיק DB חדש יותר (כתיבות רקע/לילה).
   ה־get הראשון מחזיר מיד את המקומי, והאימות ברקע מחליף את מטמון החנות
   בטרי — אבל אם אף אחד לא מפרסם את המפתח, רכיב שכבר מורכב עם העותק הישן
   לעולם לא לומד על הטרי (אין יותר remount שיטען מחדש), והמסך נשאר ישן.
   הבדיקות נועלות את החוזה: אימות boot של ה־DB מפרסם את DB_KEY (אימוץ
   במקום), ועדיין לא קורא onStale ב־boot (ניסוי H: בלי forget ובלי flush
   של ישן בחלון הפתיחה); אימות מאוחר יותר (אחרי forget) ממשיך ללכת דרך
   onStale בלבד; ועריכה מקומית ממתינה חוסמת פרסום/דריסה כמקודם.
   ============================================================================ */

const STALE = JSON.stringify({ sessions: [{ id: "s1" }] });
const FRESH1 = { sessions: [{ id: "s1" }, { id: "s2" }] };
const FRESH2 = { sessions: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] };

function memoryLocalStorage() {
  const mem = Object.create(null);
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => {
      mem[k] = String(v);
    },
    removeItem: (k) => {
      delete mem[k];
    },
    get length() {
      return Object.keys(mem).length;
    },
    key: (i) => Object.keys(mem)[i] ?? null,
  };
}

/* שרת מדומה: שורת קבוצה אחת; ה־read מחזיר את עמודת ה־select המבוקשת. */
function fakeSupabase(row) {
  return {
    from: () => ({
      select: (cols) => ({
        eq: () => ({
          single: async () => {
            if (cols === "data") return { data: { data: row.data }, error: null };
            if (cols === "config") return { data: { config: row.config }, error: null };
            if (cols === "live") return { data: { live: row.live }, error: null };
            return { data: { ...row, updated_at: "2026-01-01T00:00:00.000Z" }, error: null };
          },
        }),
      }),
    }),
    rpc: async (name) =>
      name === "write_group_cas"
        ? { data: "2026-01-01T00:00:00.000Z", error: null }
        : { data: null, error: { message: "unknown rpc" } },
  };
}

const flushMicro = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

describe("store boot validation — אימוץ אתחול קר", () => {
  let offs = [];
  const sub = (fn) => {
    const off = subscribeStoreKey(DB_KEY, fn);
    offs.push(off);
    return off;
  };

  beforeEach(() => {
    offs = [];
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("localStorage", memoryLocalStorage());
  });
  afterEach(() => {
    for (const off of offs) off();
    offs = [];
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("אתחול קר: DB טרי מהשרת מפורסם למנויים — בלי onStale ב־boot", async () => {
    localStorage.setItem("poker:cache:g1:data", STALE);
    const row = { data: FRESH1, config: null, live: null };
    const onStale = vi.fn();
    const store = makeSupabaseStore(fakeSupabase(row), "g1", { onStale });
    const onDb = vi.fn();
    sub(onDb);

    /* ה־get הראשון מחזיר מיד את המקומי הישן */
    await expect(store.get(DB_KEY)).resolves.toBe(STALE);
    await flushMicro();

    /* האימות ברקע החליף את המטמון בטרי ופרסם — המסך יכול לאמץ במקום.
       onStale לא נקרא: ב־boot אין forget ואין flush של ישן (ניסוי H). */
    expect(onDb).toHaveBeenCalledTimes(1);
    expect(onDb).toHaveBeenCalledWith(DB_KEY);
    expect(onStale).not.toHaveBeenCalled();
    await expect(store.get(DB_KEY)).resolves.toBe(JSON.stringify(FRESH1));
  });

  it("עריכה מקומית ממתינה חוסמת את הפרסום — המטמון הטרי לא דורס את שעל המסך", async () => {
    localStorage.setItem("poker:cache:g1:data", STALE);
    /* קריאת האימות מושהית ידנית: העריכה חייבת לנחות כשהאימות עוד בטיסה,
       בדיוק כמו עריכת משתמש בזמן רשת אמיתי. */
    let resolveRead;
    const api = {
      from: () => ({
        select: (cols) => ({
          eq: () => ({
            single: () =>
              cols === "data"
                ? new Promise((resolve) => {
                    resolveRead = resolve;
                  })
                : Promise.resolve({ data: { [cols]: null }, error: null }),
          }),
        }),
      }),
      rpc: async () => ({ data: "2026-01-01T00:00:00.000Z", error: null }),
    };
    const onStale = vi.fn();
    const store = makeSupabaseStore(api, "g1", { onStale });
    const onDb = vi.fn();
    sub(onDb);

    await expect(store.get(DB_KEY)).resolves.toBe(STALE);
    /* המשתמש כבר ערך מקומית לפני שהאימות חזר — העריכה היא מקור האמת */
    const EDITED = JSON.stringify({ sessions: [{ id: "s1" }, { id: "edited" }] });
    await store.set(DB_KEY, EDITED);
    resolveRead({ data: { data: FRESH1 }, error: null });
    await flushMicro();

    expect(onDb).not.toHaveBeenCalled();
    expect(onStale).not.toHaveBeenCalled();
    await expect(store.get(DB_KEY)).resolves.toBe(EDITED);
  });

  it("אימות מאוחר (אחרי forget) עובר דרך onStale בלבד — החנות לא מפרסמת בעצמה", async () => {
    localStorage.setItem("poker:cache:g1:data", STALE);
    const row = { data: FRESH1, config: null, live: null };
    const onStale = vi.fn();
    const store = makeSupabaseStore(fakeSupabase(row), "g1", { onStale });
    const onDb = vi.fn();
    sub(onDb);

    await store.get(DB_KEY);
    await flushMicro();
    expect(onDb).toHaveBeenCalledTimes(1); // פרסום ה־boot

    /* עדכון חיצוני זוהה: שוכחים את המטמון וקוראים שוב — ההתנהגות הישנה */
    row.data = FRESH2;
    store.forget(DB_KEY);
    await expect(store.get(DB_KEY)).resolves.toBe(JSON.stringify(FRESH1));
    await flushMicro();

    expect(onStale).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledWith(DB_KEY);
    expect(onDb).toHaveBeenCalledTimes(1); // שום פרסום נוסף מהחנות עצמה
    await expect(store.get(DB_KEY)).resolves.toBe(JSON.stringify(FRESH2));
  });
});
