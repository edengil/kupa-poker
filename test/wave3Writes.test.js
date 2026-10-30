/* גל 3ב — בטיחות כתיבות (ממצא 9):
   1. מיזוג payments ברמת מפה ב־flush: סימון טרי מהשרת (RPC של צופה) שורד
      flush של צילום ישן מהאפליקציה, וסימון מקומי טרי שורד מול שרת ישן.
   2. store: התנגשות CAS אחת → קריאה ומיזוג מחדש והצלחה; התנגשות מתמשכת
      → כשל כנה וה־pending נשאר בתור. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mergeSessionPayments, mergeGroupDataOnFlush } from "../lib/dataMerge.js";
import { markTransfer, markReceipt, paymentPlan } from "../lib/paymentTracking.js";
import { makeSupabaseStore, DB_KEY, LIVE_KEY } from "../lib/store.js";

const base = {
  id: "s1",
  iso: "2026-10-30",
  entries: [
    { name: "א", amount: 60 },
    { name: "ב", amount: -100 },
    { name: "ג", amount: 40 },
  ],
  savingsPot: 5,
};
const emptyPayments = (s) => ({
  ...s,
  payments: { plan: paymentPlan(s).fingerprint, paid: {}, received: {}, confirmations: [] },
});

describe("mergeSessionPayments — סימוני שרת לא נדרסים ב־flush", () => {
  it("סימון RPC טרי (בצד המפסיד) שורד את עותק הזוכה הישן", () => {
    const winner = emptyPayments(base);
    const loser = markTransfer(base, 0, true, "א");
    const merged = mergeSessionPayments(winner, loser);
    expect(merged.paid[0]).toBe(true);
    expect(merged.confirmations).toHaveLength(1);
    expect(merged.confirmations[0]).toMatchObject({ index: 0, action: "paid", by: "א" });
  });

  it("סימון מקומי טרי שורד מול עותק שרת בלי סימונים", () => {
    const winner = markTransfer(base, 1, true, "ג");
    const loser = emptyPayments(base);
    const merged = mergeSessionPayments(winner, loser);
    expect(merged.paid[1]).toBe(true);
    expect(merged.confirmations).toHaveLength(1);
  });

  it("שני הצדדים סימנו העברות שונות — האיחוד שומר את שתיהן", () => {
    const winner = markReceipt(markTransfer(base, 1, true, "ג"), 1, true, "ב");
    const loser = markTransfer(base, 0, true, "א");
    const merged = mergeSessionPayments(winner, loser);
    expect(merged.paid[0]).toBe(true);
    expect(merged.paid[1]).toBe(true);
    expect(merged.received[1]).toBe(true);
    expect(merged.confirmations).toHaveLength(3);
  });

  it("potPaid עם אירוע קופה בצד המפסיד — שורד", () => {
    const fp = paymentPlan(base).fingerprint;
    const winner = { ...base, payments: { plan: fp, paid: {}, received: {}, confirmations: [] } };
    const loser = {
      ...base,
      payments: {
        plan: fp,
        paid: {},
        received: {},
        confirmations: [
          { index: -1, action: "paid", by: "ב", pot: true, at: "2026-10-30T10:00:00.000Z" },
        ],
        potPaid: true,
      },
    };
    const merged = mergeSessionPayments(winner, loser);
    expect(merged.potPaid).toBe(true);
  });

  it("דרך mergeGroupDataOnFlush: ערב זוכה מקומי לא מוחק סימון שרת", () => {
    const localSession = { ...emptyPayments(base), endedAt: 5000 };
    const remoteSession = { ...markTransfer(base, 0, true, "א"), endedAt: 5000 };
    const local = { sessions: [localSession], roster: ["א"] };
    const remote = { sessions: [remoteSession], roster: ["א"] };
    const { data } = mergeGroupDataOnFlush(local, remote);
    const s = data.sessions.find((x) => x.id === "s1");
    expect(paymentPlan(s).paid[0]).toBe(true);
  });
});

/* לקוח מזויף עם שורה מתגלגלת: ה־RPC מחזיר NULL בהתנגשות אחת (השורה
   זזה בינתיים בשרת) ואז מצליח — בדיוק החוזה של write_group_cas. */
function rollingClient({ conflicts = 0 } = {}) {
  const state = {
    row: {
      data: { sessions: [{ id: "srv", entries: [] }], roster: ["א"] },
      config: {},
      live: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    writes: [],
  };
  let conflictBudget = conflicts;
  const client = {
    rpc: vi.fn(async (_fn, args) => {
      if (conflictBudget > 0) {
        conflictBudget -= 1;
        /* כותב מתחרה נחת בינתיים: הוסיף ערב לשרת וקידם את החותמת */
        state.row = {
          ...state.row,
          data: {
            ...state.row.data,
            sessions: [...state.row.data.sessions, { id: "raced", entries: [] }],
          },
          updated_at: "2026-01-01T00:00:01.000Z",
        };
        return { data: null, error: null };
      }
      if (args.p_expected_updated_at && args.p_expected_updated_at !== state.row.updated_at) {
        return { data: null, error: null };
      }
      state.writes.push(args.p_patch);
      state.row = { ...state.row, ...args.p_patch, updated_at: "2026-01-01T00:00:02.000Z" };
      return { data: state.row.updated_at, error: null };
    }),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: state.row, error: null }),
          maybeSingle: async () => ({ data: state.row, error: null }),
        }),
      }),
      update: (patch) => ({ eq: async () => ({ error: null }) }),
    }),
  };
  return { client, state };
}

function memoryLocalStorage() {
  const mem = Object.create(null);
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
    get length() { return Object.keys(mem).length; },
    key: (i) => Object.keys(mem)[i] ?? null,
  };
}

describe("store CAS — התנגשות, מיזוג מחדש, והצלחה", () => {
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

  it("התנגשות אחת: ה־flush ממזג מול השורה שזזה ומצליח — הערב המתחרה שורד", async () => {
    const { client, state } = rollingClient({ conflicts: 1 });
    const store = makeSupabaseStore(client, "g1");
    await store.set(DB_KEY, JSON.stringify({ sessions: [{ id: "mine", entries: [] }] }));
    expect(await store.flush()).toBe(true);
    const written = state.writes[state.writes.length - 1];
    const ids = written.data.sessions.map((s) => s.id).sort();
    expect(ids).toEqual(["mine", "raced", "srv"]);
    expect(store.hasPending()).toBe(false);
  });

  it("התנגשות מתמשכת: flush נכשל בכנות והכתיבה נשארת pending", async () => {
    const { client } = rollingClient({ conflicts: 99 });
    const store = makeSupabaseStore(client, "g1");
    await store.set(LIVE_KEY, JSON.stringify({ players: [{ name: "א" }] }));
    expect(await store.flush()).toBe(false);
    expect(store.hasPending()).toBe(true);
  });
});
