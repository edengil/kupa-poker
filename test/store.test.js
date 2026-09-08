import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DB_KEY, LIVE_KEY, makeSupabaseStore } from "../lib/store.js";

function client() {
  const update = vi.fn().mockResolvedValue({ error: null });
  const read = vi.fn().mockResolvedValue({ data: { live: null }, error: null });
  return {
    update, read,
    from: () => ({
      update: (patch) => ({ eq: () => update(patch) }),
      select: () => ({ eq: () => ({ single: read }) }),
    }),
  };
}
describe("store durability and ordering", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("retains a failed write and reports success only after retry", async () => {
    const api = client(), onStatus = vi.fn(), onFlush = vi.fn();
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
    api.update.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
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
    const api = client(), store = makeSupabaseStore(api, "test");
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
    api.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    vi.stubGlobal("localStorage", { getItem: () => '{"version":1}', setItem: vi.fn() });
    const store = makeSupabaseStore(api, "test");
    await store.get(DB_KEY);
    await store.set(DB_KEY, '{"version":3}');
    finish({ data: { data: { version: 2 } }, error: null });
    await Promise.resolve(); await Promise.resolve();
    expect(await store.get(DB_KEY)).toBe('{"version":3}');
    await store.flush();
  });
});
