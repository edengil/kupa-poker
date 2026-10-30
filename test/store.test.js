import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DB_KEY, LIVE_KEY, makeSupabaseStore } from "../lib/store.js";

function client() {
  const update = vi.fn().mockResolvedValue({ error: null });
  const read = vi.fn().mockResolvedValue({ data: { live: null }, error: null });
  return {
    update,
    read,
    from: () => ({
      select: () => ({ eq: () => ({ single: read }) }),
    }),
    /* כתיבת החנות עוברת דרך write_group_cas (גל 3ב): ה־mock מעביר את
       ה־patch לאותו update מדומה, כדי שכל הציפיות עליו נשמרות. */
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

describe("store durability and ordering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("localStorage", memoryLocalStorage());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retains a failed write and reports success only after retry", async () => {
    const api = client(),
      onStatus = vi.fn(),
      onFlush = vi.fn();
    api.update.mockResolvedValueOnce({ error: { message: "offline" } });
    const store = makeSupabaseStore(api, "test", { onStatus, onFlush });
    await store.set(DB_KEY, '{"sessions":[]}');
    expect(await store.flush()).toBe(false);
    expect(store.hasPending()).toBe(true);
    expect(onFlush).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith("error");
    expect(await store.flush()).toBe(true);
    expect(store.hasPending()).toBe(false);
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenLastCalledWith("saved");
  });

  it("serializes overlapping writes and preserves newer edits after an older failure", async () => {
    const api = client();
    let finish;
    api.update.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const store = makeSupabaseStore(api, "test");
    await store.set(DB_KEY, '{"version":1}');
    const first = store.flush();
    await Promise.resolve();
    await store.set(DB_KEY, '{"version":2}');
    const second = store.flush();
    await Promise.resolve();
    expect(api.update).toHaveBeenCalledTimes(1);
    finish({ error: { message: "offline" } });
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(api.update).toHaveBeenLastCalledWith({ data: { version: 2 } });
  });

  it("does not overwrite live state if the pre-write merge read fails", async () => {
    const api = client();
    api.read.mockResolvedValue({ error: { message: "offline" } });
    const store = makeSupabaseStore(api, "test");
    await store.set(LIVE_KEY, '{"players":[]}');
    expect(await store.flush()).toBe(false);
    expect(api.update).not.toHaveBeenCalled();
    expect(store.hasPending()).toBe(true);
  });

  it("rejects corrupt JSON without polluting the cache", async () => {
    const api = client(),
      store = makeSupabaseStore(api, "test");
    await store.set(DB_KEY, '{"version":1}');
    expect(await store.set(DB_KEY, "invalid")).toBe(false);
    expect(await store.get(DB_KEY)).toBe('{"version":1}');
    await store.flush();
    expect(api.update).toHaveBeenCalledWith({ data: { version: 1 } });
  });

  it("distinguishes failed initial history reads from an empty group", async () => {
    const api = client();
    api.read.mockResolvedValue({ error: { message: "offline" } });
    await expect(makeSupabaseStore(api, "test").get(DB_KEY)).rejects.toThrow();
  });

  it("does not replace a local edit with a delayed background read", async () => {
    const api = client();
    let finish;
    api.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    localStorage.setItem("poker:cache:test:data", '{"version":1}');
    const store = makeSupabaseStore(api, "test");
    await store.get(DB_KEY);
    await store.set(DB_KEY, '{"version":3}');
    finish({ data: { data: { version: 2 } }, error: null });
    await Promise.resolve();
    await Promise.resolve();
    expect(await store.get(DB_KEY)).toBe('{"version":3}');
    await store.flush();
  });

  it("rehydrates pending writes after reload so offline edits are not lost", async () => {
    const api = client();
    api.update.mockResolvedValueOnce({ error: { message: "offline" } });
    const first = makeSupabaseStore(api, "group-a");
    await first.set(DB_KEY, '{"sessions":[{"id":"n1"}]}');
    await first.set(LIVE_KEY, '{"players":[{"name":"דן","buyin":50,"cashout":""}]}');
    expect(await first.flush()).toBe(false);

    const second = makeSupabaseStore(api, "group-a");
    expect(second.hasPending()).toBe(true);
    expect(await second.get(DB_KEY)).toBe('{"sessions":[{"id":"n1"}]}');
    expect(await second.get(LIVE_KEY)).toContain("דן");
    expect(await second.flush()).toBe(true);
    expect(second.hasPending()).toBe(false);
    expect(api.update).toHaveBeenCalled();
  });

  it("adopts server data silently on the boot load of the DB key (experiment H: no onStale)", async () => {
    const api = client();
    api.read.mockResolvedValue({ data: { data: { version: 2 } }, error: null });
    localStorage.setItem("poker:cache:test:data", '{"version":1}');
    const onStale = vi.fn();
    const store = makeSupabaseStore(api, "test", { onStale });
    expect(await store.get(DB_KEY)).toBe('{"version":1}');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(onStale).not.toHaveBeenCalled();
    // adopted silently: memory cache and localStorage now hold the server value
    expect(await store.get(DB_KEY)).toBe('{"version":2}');
    expect(localStorage.getItem("poker:cache:test:data")).toBe('{"version":2}');
  });

  it("still reports onStale for the DB key on a post-boot revalidation (after forget)", async () => {
    const api = client();
    api.read.mockResolvedValue({ data: { data: { version: 1 } }, error: null });
    localStorage.setItem("poker:cache:test:data", '{"version":1}');
    const onStale = vi.fn();
    const store = makeSupabaseStore(api, "test", { onStale });
    expect(await store.get(DB_KEY)).toBe('{"version":1}');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(onStale).not.toHaveBeenCalled();

    api.read.mockResolvedValue({ data: { data: { version: 2 } }, error: null });
    store.forget(DB_KEY);
    expect(await store.get(DB_KEY)).toBe('{"version":1}');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledWith(DB_KEY);
  });

  it("delays the boot flush of rehydrated pending writes to 30s, not 400ms (experiment H)", async () => {
    const api = client();
    api.update.mockResolvedValueOnce({ error: { message: "offline" } });
    const first = makeSupabaseStore(api, "boot-flush");
    await first.set(DB_KEY, '{"version":1}');
    expect(await first.flush()).toBe(false);
    expect(first.hasPending()).toBe(true);

    const second = makeSupabaseStore(api, "boot-flush");
    expect(second.hasPending()).toBe(true);
    const callsAfterBoot = api.update.mock.calls.length;
    await vi.advanceTimersByTimeAsync(400);
    expect(api.update.mock.calls.length).toBe(callsAfterBoot);
    await vi.advanceTimersByTimeAsync(29600);
    expect(api.update.mock.calls.length).toBe(callsAfterBoot + 1);
    expect(second.hasPending()).toBe(false);
  });

  it("keeps an in-flight write recoverable on disk until acknowledgment", async () => {
    const api = client();
    let finish;
    api.update.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const store = makeSupabaseStore(api, "in-flight");
    await store.set(DB_KEY, '{"version":1}');
    const writing = store.flush();
    await Promise.resolve();
    expect(JSON.parse(localStorage.getItem("poker:pending:in-flight"))).toEqual({ data: { version: 1 } });
    await store.set(DB_KEY, '{"version":2}');
    expect(JSON.parse(localStorage.getItem("poker:pending:in-flight"))).toEqual({ data: { version: 2 } });
    finish({ error: null });
    await writing;
    expect(JSON.parse(localStorage.getItem("poker:pending:in-flight"))).toEqual({ data: { version: 2 } });
    await store.flush();
    expect(localStorage.getItem("poker:pending:in-flight")).toBeNull();
  });
});
