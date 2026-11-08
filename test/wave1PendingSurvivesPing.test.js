import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DB_KEY, LIVE_KEY, makeSupabaseStore } from "../lib/store.js";

/* ============================================================================
   רגרסיית שער 0.2 (B2/C8) אחרי תיקון גל 1א — פינג חיצוני לא מוחק כתיבת כסף
   ממתינה. שלושת תרחישי הרפרו של השער, הפעם עם הציפייה ההפוכה: הכתיבה
   שורדת את ה־forget ועולה לשרת ב־flush. הלקוח המדומה מחקה את החנות
   האמיתית: read מחזיר את שורת השרת, ו־write_group_cas כותב אליה.
   ============================================================================ */

function serverClient(row) {
  const update = vi.fn(async (patch) => {
    Object.assign(row, patch);
    return { error: null };
  });
  const read = vi.fn(async () => ({
    data: { data: row.data, config: row.config, live: row.live, updated_at: "2026-01-01T00:00:00.000Z" },
    error: null,
  }));
  return {
    update,
    read,
    row,
    from: () => ({
      select: () => ({ eq: () => ({ single: read }) }),
    }),
    rpc: async (name, args) => {
      if (name !== "write_group_cas") return { data: null, error: { message: "unknown rpc" } };
      const res = await update(args.p_patch);
      if (res?.error) return { data: null, error: res.error };
      return { data: "2026-01-01T00:00:00.000Z", error: null };
    },
  };
}

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

const MARKED = JSON.stringify({ sessions: [{ id: "s1", payments: { plan: "p", paid: { 0: true } } }] });

describe("B2/C8 — פינג חיצוני לא מוחק כתיבת כסף ממתינה", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("localStorage", memoryLocalStorage());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("תרחיש A (חלון debounce): סימון ממתין + forget(DB) — שורד ועולה לשרת", async () => {
    const api = serverClient({ data: { sessions: [{ id: "s1" }] }, config: null, live: null });
    const store = makeSupabaseStore(api, "gA");
    await store.set(DB_KEY, MARKED);
    expect(store.hasPending()).toBe(true);
    expect(JSON.parse(localStorage.getItem("poker:pending:gA"))).toHaveProperty("data");

    /* בדיוק הקריאה של קולבק הפינג (OwnerApp) לפני התיקון */
    store.forget(DB_KEY);

    expect(store.hasPending()).toBe(true);
    expect(JSON.parse(localStorage.getItem("poker:pending:gA"))).toHaveProperty("data");
    expect(await store.flush()).toBe(true);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.row.data.sessions[0].payments.paid[0]).toBe(true);
    expect(store.hasPending()).toBe(false);
  });

  it("תרחיש B (כתיבה כושלת שחזרה ל־pending): forget לא מבטל את הניסיון החוזר", async () => {
    const api = serverClient({ data: { sessions: [{ id: "s1" }] }, config: null, live: null });
    api.update.mockResolvedValueOnce({ error: { message: "offline" } });
    const store = makeSupabaseStore(api, "gB");
    await store.set(DB_KEY, MARKED);
    expect(await store.flush()).toBe(false);
    expect(store.hasPending()).toBe(true);

    store.forget(DB_KEY);

    expect(store.hasPending()).toBe(true);
    expect(await store.flush()).toBe(true);
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(api.row.data.sessions[0].payments.paid[0]).toBe(true);
  });

  it("תרחיש C (בקרה): forget(LIVE) לא פוגע בכתיבת data ממתינה", async () => {
    const api = serverClient({ data: { sessions: [{ id: "s1" }] }, config: null, live: null });
    const store = makeSupabaseStore(api, "gC");
    await store.set(DB_KEY, MARKED);
    store.forget(LIVE_KEY);
    expect(store.hasPending()).toBe(true);
    expect(await store.flush()).toBe(true);
    expect(api.row.data.sessions[0].payments.paid[0]).toBe(true);
  });

  it("ה־pending של עמודות אחרות (config) שורד forget על DB — וגם להפך", async () => {
    const api = serverClient({ data: null, config: { a: 1 }, live: null });
    const { CONFIG_KEY } = await import("../lib/store.js");
    const store = makeSupabaseStore(api, "gD");
    await store.set(CONFIG_KEY, '{"a":2}');
    store.forget(DB_KEY);
    expect(store.hasPending()).toBe(true);
    expect(await store.flush()).toBe(true);
    expect(api.row.config).toEqual({ a: 2 });
  });
});
