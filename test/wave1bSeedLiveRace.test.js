import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_KEY, makeSupabaseStore } from "../lib/store.js";
import { liveStamp, seedLiveDecision } from "../lib/liveMerge.js";

/* ============================================================================
   רגרסיית פריט 1.2 — מרוץ seedLive: זריעת לייב מרוחק לא דורסת כתיבת לייב
   ממתינה חדשה ממנה. הזריעה ב־checkLive נושאת מיזוג שחושב מקריאת שרת
   שהתחילה לפני שהמשתמש ערך; בלי השער, עריכה שנכנסה ל־pending באמצע
   הייתה נדרסת במטמון ונמחקת מהתור — נעלמת בשקט למרות שהיא על המסך.
   התרחישים רצים על החנות האמיתית מול לקוח שרת מדומה (אותו harness של
   רגרסיית B2/C8): read מחזיר את שורת השרת, ו־write_group_cas כותב אליה.
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

const liveAt = (editedAt, extra = {}) => ({
  players: [],
  startedAt: 111,
  editedAt,
  ...extra,
});

describe("seedLiveDecision — הכרעת החותמות (יחידה)", () => {
  it("אין ממתין → adopt", () => {
    expect(seedLiveDecision(undefined, liveAt(10))).toBe("adopt");
  });

  it("ממתין־מחיקה (null) → keep-pending: ניקוי מקומי לא קם לתחייה", () => {
    expect(seedLiveDecision(null, liveAt(99999))).toBe("keep-pending");
    expect(seedLiveDecision(null, null)).toBe("keep-pending");
  });

  it("ממתין חדש מהמרוחק → keep-pending; ישן או שווה → adopt", () => {
    expect(seedLiveDecision(liveAt(5000), liveAt(3000))).toBe("keep-pending");
    expect(seedLiveDecision(liveAt(3000), liveAt(5000))).toBe("adopt");
    expect(seedLiveDecision(liveAt(5000), liveAt(5000))).toBe("adopt");
    expect(seedLiveDecision(liveAt(5000), null)).toBe("keep-pending");
  });

  it("חותמת ts של הבוט נחשבת כמו editedAt (הטרייה מנצחת)", () => {
    expect(liveStamp({ editedAt: 10, ts: 7000 })).toBe(7000);
    expect(liveStamp({ editedAt: 8000, ts: 10 })).toBe(8000);
    expect(liveStamp(null)).toBe(0);
    expect(liveStamp({})).toBe(0);
    expect(seedLiveDecision({ ts: 9000 }, liveAt(1000))).toBe("keep-pending");
  });
});

describe("מרוץ seedLive על החנות האמיתית", () => {
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

  it("ממתין שנכנס באמצע CAS שורד את הזריעה — ועולה לשרת ב־flush", async () => {
    const serverLive = liveAt(100, { players: [{ name: "שרת", buyin: 50 }] });
    const api = serverClient({ data: null, config: null, live: serverLive });
    const store = makeSupabaseStore(api, "gRace");

    /* עריכה מקומית נכנסת ל־pending בזמן ש־checkLive עוד באמצע המיזוג */
    const localEdit = liveAt(5000, { players: [{ name: "אבי", buyin: 100 }] });
    await store.set(LIVE_KEY, JSON.stringify(localEdit));
    expect(store.hasPending()).toBe(true);

    /* הזריעה מגיעה עם המיזוג שחושב מהקריאה הישנה (חותמת 3000 < 5000) */
    store.seedLive(liveAt(3000, { players: [{ name: "ישן", buyin: 1 }] }));

    /* המטמון והממתין נשארו של העריכה המקומית */
    expect(store.snapshotLive()).toEqual(localEdit);
    expect(store.hasPending()).toBe(true);
    expect(JSON.parse(localStorage.getItem("poker:cache:gRace:live"))).toEqual(localEdit);

    /* והמנצח באמת נכתב לשרת */
    expect(await store.flush()).toBe(true);
    expect(store.hasPending()).toBe(false);
    const written = api.row.live;
    expect(written.editedAt).toBe(5000);
    expect(written.players.some((p) => p.name === "אבי" && p.buyin === 100)).toBe(true);
  });

  it("ממתין ישן מהנזרע: המרוחק נזרע והממתין מתנקה", async () => {
    const api = serverClient({ data: null, config: null, live: liveAt(100) });
    const store = makeSupabaseStore(api, "gOld");

    await store.set(LIVE_KEY, JSON.stringify(liveAt(1000, { players: [{ name: "מקומי ישן", buyin: 1 }] })));
    expect(store.hasPending()).toBe(true);

    const remote = liveAt(2000, { players: [{ name: "בוט", buyin: 200 }] });
    store.seedLive(remote);

    expect(store.snapshotLive()).toEqual(remote);
    expect(store.hasPending()).toBe(false);
    expect(JSON.parse(localStorage.getItem("poker:cache:gOld:live"))).toEqual(remote);
  });

  it("ממתין־מחיקה לא קם לתחייה מזריעה — המחיקה עולה לשרת", async () => {
    const api = serverClient({ data: null, config: null, live: liveAt(100, { players: [{ name: "שרת", buyin: 50 }] }) });
    const store = makeSupabaseStore(api, "gClear");

    await store.set(LIVE_KEY, ""); // המשחק נוקה מקומית — pending.live = null
    expect(store.hasPending()).toBe(true);

    store.seedLive(liveAt(9000, { players: [{ name: "שרת", buyin: 50 }] }));
    expect(store.snapshotLive()).toBeNull();
    expect(store.hasPending()).toBe(true);

    expect(await store.flush()).toBe(true);
    expect(api.row.live).toBeNull();
  });

  it("בקרה: בלי ממתין — זריעה רגילה, וזריעת null מנקה", async () => {
    const api = serverClient({ data: null, config: null, live: null });
    const store = makeSupabaseStore(api, "gCtl");

    const remote = liveAt(2000, { players: [{ name: "בוט", buyin: 200 }] });
    store.seedLive(remote);
    expect(store.snapshotLive()).toEqual(remote);
    expect(store.hasPending()).toBe(false);

    store.seedLive(null);
    expect(store.snapshotLive()).toBeNull();
  });
});
