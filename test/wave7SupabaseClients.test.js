/* גל 7, פריט 7.1 — בדיקות ישירות לשלושת לקוחות ה־Supabase.
   עד הגל שלושת הלקוחות (admin/דפדפן/שרת) נבדקו רק דרך צרכנים ממוקים.
   כאן בודקים את הלקוחות עצמם מול יצירת־הלקוח הממוקה של הספריות:
   - supabaseAdmin: זורק בלי מפתח סודי; בונה לקוח עם no-store fetch
     שעוקף את מטמון הנתונים של Next; pingViewers לא זורק על כשל רשת.
   - supabaseClient: לקוח דפדפן יחיד (singleton) עם המפתח הציבורי.
   - supabaseServer: לקוח שרת מהעוגיות + לקוח אנונימי בלי סשן.
   בלי רשת אמיתית — createClient של שתי הספריות ממוקה. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  jsClients: [],
  ssrBrowserClients: [],
  ssrServerClients: [],
  cookieStore: null,
  fetchImpl: null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url, key, opts) => {
    const client = { kind: "supabase-js", url, key, opts };
    h.jsClients.push(client);
    return client;
  },
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (url, key) => {
    const client = { kind: "ssr-browser", url, key };
    h.ssrBrowserClients.push(client);
    return client;
  },
  createServerClient: (url, key, opts) => {
    const client = { kind: "ssr-server", url, key, opts };
    h.ssrServerClients.push(client);
    return client;
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => h.cookieStore,
}));

const ENV_KEYS = [
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];
const savedEnv = {};

beforeEach(() => {
  vi.resetModules();
  h.jsClients = [];
  h.ssrBrowserClients = [];
  h.ssrServerClients = [];
  h.cookieStore = {
    getAll: () => [{ name: "sb-session", value: "v1" }],
    set: vi.fn(),
  };
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x";
  h.fetchImpl = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", h.fetchImpl);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

describe("supabaseAdmin — ישיר", () => {
  it("כשל: בלי SUPABASE_SECRET_KEY זורק שגיאה מפורשת", async () => {
    const { getAdminSupabase } = await import("../lib/supabaseAdmin.js");
    expect(() => getAdminSupabase()).toThrow("SUPABASE_SECRET_KEY חסר");
    expect(h.jsClients).toHaveLength(0);
  });

  it("הצלחה: בונה לקוח עם המפתח הסודי, בלי סשן שמור, ו־fetch עם cache:no-store", async () => {
    process.env.SUPABASE_SECRET_KEY = "secret-key";
    const { getAdminSupabase } = await import("../lib/supabaseAdmin.js");
    const client = getAdminSupabase();
    expect(client.kind).toBe("supabase-js");
    expect(client.url).toBe("https://proj.example.supabase.co");
    expect(client.key).toBe("secret-key");
    expect(client.opts.auth).toEqual({ persistSession: false });

    /* ה־fetch העוטף חייב להוסיף no-store לכל קריאה (אחרת PostgREST נקרא מהמטמון) */
    await client.opts.global.fetch("https://proj.example.supabase.co/rest/v1/groups", {
      method: "GET",
    });
    expect(h.fetchImpl).toHaveBeenCalledWith("https://proj.example.supabase.co/rest/v1/groups", {
      method: "GET",
      cache: "no-store",
    });
  });

  it("pingViewers: הצלחה פונה ל־broadcast; כשל רשת לא זורק (הסקר מכסה)", async () => {
    process.env.SUPABASE_SECRET_KEY = "secret-key";
    const { pingViewers } = await import("../lib/supabaseAdmin.js");
    await expect(pingViewers("kupa")).resolves.toBeUndefined();
    const [url, opts] = h.fetchImpl.mock.calls.at(-1);
    expect(url).toBe("https://proj.example.supabase.co/realtime/v1/api/broadcast");
    expect(JSON.parse(opts.body).messages[0]).toMatchObject({
      topic: "group:kupa",
      event: "update",
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.fetchImpl.mockRejectedValueOnce(new Error("offline"));
    await expect(pingViewers("kupa")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("supabaseClient — ישיר", () => {
  it("הצלחה: לקוח דפדפן עם המפתח הציבורי; קריאה שנייה מחזירה את אותו לקוח (singleton)", async () => {
    const { getSupabase } = await import("../lib/supabaseClient.js");
    const a = getSupabase();
    const b = getSupabase();
    expect(a).toBe(b);
    expect(h.ssrBrowserClients).toHaveLength(1);
    expect(a).toMatchObject({
      kind: "ssr-browser",
      url: "https://proj.example.supabase.co",
      key: "sb_publishable_x",
    });
  });
});

describe("supabaseServer — ישיר", () => {
  it("getServerSupabase: לקוח שרת שקורא עוגיות מהחנות וכותב דרכה", async () => {
    const { getServerSupabase } = await import("../lib/supabaseServer.js");
    const client = await getServerSupabase();
    expect(client.kind).toBe("ssr-server");
    expect(client.key).toBe("sb_publishable_x");
    expect(client.opts.cookies.getAll()).toEqual([{ name: "sb-session", value: "v1" }]);
    client.opts.cookies.setAll([{ name: "sb-new", value: "v2", options: { path: "/" } }]);
    expect(h.cookieStore.set).toHaveBeenCalledWith("sb-new", "v2", { path: "/" });
  });

  it("getServerSupabase: setAll לא זורק גם כשהחנות מסרבת לכתוב (Server Component)", async () => {
    h.cookieStore = {
      getAll: () => [],
      set: () => {
        throw new Error("read-only store");
      },
    };
    const { getServerSupabase } = await import("../lib/supabaseServer.js");
    const client = await getServerSupabase();
    expect(() =>
      client.opts.cookies.setAll([{ name: "x", value: "y", options: {} }])
    ).not.toThrow();
  });

  it("getAnonSupabase: לקוח אנונימי בלי סשן שמור, מהספרייה הגולמית", async () => {
    const { getAnonSupabase } = await import("../lib/supabaseServer.js");
    const client = getAnonSupabase();
    expect(client.kind).toBe("supabase-js");
    expect(client.key).toBe("sb_publishable_x");
    expect(client.opts).toEqual({ auth: { persistSession: false } });
  });
});
