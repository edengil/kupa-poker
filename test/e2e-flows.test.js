import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeSupabaseStore, DB_KEY, LIVE_KEY } from "../lib/store.js";
import { appendAction, undoLast } from "../lib/liveActionLog.js";
import { openingBalances, applyManualPayment, debtorsOf } from "../lib/manualSettlement.js";

/**
 * זרימות קצה־לקצה ברמת לוגיקה (בלי דפדפן) —
 * תופסות באגים שלא תלויים ב־UI אבל שוברים ערב אמיתי.
 */

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

function clientOk() {
  const update = vi.fn().mockResolvedValue({ error: null });
  const read = vi.fn().mockResolvedValue({ data: { live: null }, error: null });
  return {
    update,
    read,
    from: () => ({
      update: (patch) => ({ eq: () => update(patch) }),
      select: () => ({ eq: () => ({ single: read }) }),
    }),
  };
}

describe("flow: offline live survives store remount", () => {
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

  it("keeps live players pending after failed flush and remount", async () => {
    const api = clientOk();
    api.update.mockResolvedValueOnce({ error: { message: "offline" } });
    const live = {
      players: [
        { name: "אלפא", buyin: 50, cashout: "200" },
        { name: "בטה", buyin: 50, cashout: "0" },
      ],
      startedAt: Date.now(),
    };
    const a = makeSupabaseStore(api, "g1");
    await a.set(LIVE_KEY, JSON.stringify(live));
    expect(await a.flush()).toBe(false);

    const b = makeSupabaseStore(api, "g1");
    expect(b.hasPending()).toBe(true);
    const raw = await b.get(LIVE_KEY);
    expect(JSON.parse(raw).players).toHaveLength(2);
    expect(await b.flush()).toBe(true);
  });

  it("does not drop a newer history write behind a failed older one", async () => {
    const api = clientOk();
    let finish;
    api.update.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const store = makeSupabaseStore(api, "g1");
    await store.set(DB_KEY, JSON.stringify({ sessions: [{ id: "old" }] }));
    const first = store.flush();
    await Promise.resolve();
    await store.set(DB_KEY, JSON.stringify({ sessions: [{ id: "new" }] }));
    const second = store.flush();
    await Promise.resolve();
    finish({ error: { message: "offline" } });
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(api.update).toHaveBeenLastCalledWith({ data: { sessions: [{ id: "new" }] } });
  });
});

describe("flow: undo seat then settlement math", () => {
  it("undo removes seated player from the action log state", () => {
    const players = [
      { name: "דן", buyin: 50, cashout: "" },
      { name: "אלפא", buyin: 50, cashout: "" },
    ];
    const log = appendAction([], { t: "seat", name: "אלפא", amount: 50 });
    const out = undoLast({ players, actionLog: log });
    expect(out.players.map((p) => p.name)).toEqual(["דן"]);
    expect(out.actionLog).toHaveLength(0);
  });

  it("manual payment reduces open debt after a finished night", () => {
    const players = [
      { name: "אלפא", buyin: 50, cashout: "200" },
      { name: "בטה", buyin: 50, cashout: "0" },
    ];
    const { balances } = openingBalances(players, 2);
    expect(debtorsOf(balances).map((d) => d.name)).toContain("בטה");
    const next = applyManualPayment(balances, { from: "בטה", to: "אלפא", amount: 50 });
    expect(debtorsOf(next)).toHaveLength(0);
  });
});
