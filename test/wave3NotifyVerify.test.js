/* גל 3ב — notify-transfers "paid" (ממצא 10): השרת לא סומך על דיווח
   הלקוח. בלי סימון "שולם" שמור במסד לא יוצא שום פוש למנהל; עם סימון
   וסכום תואם — הפוש יוצא כרגיל. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { markTransfer } from "../lib/paymentTracking.js";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "anon-key";

const h = vi.hoisted(() => ({
  pushToTargets: vi.fn(async () => ({ sent: 1 })),
  row: null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", email: "admin@x" } }, error: null }),
    },
  }),
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: () => ({
    from(table) {
      if (table === "groups") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: async () => ({ data: h.row, error: null }),
        };
        return chain;
      }
      /* push_subscriptions: שרשרת eq שניתנת ל־await */
      const subs = [{ id: 1, endpoint: "e", p256dh: "p", auth: "a" }];
      const chain = {
        select: () => chain,
        eq: () => chain,
        then: (resolve) => resolve({ data: subs }),
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/push", () => ({ pushToTargets: h.pushToTargets }));
vi.mock("@/lib/monitor", () => ({ reportError: vi.fn(async () => {}) }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) },
}));

const { POST } = await import("../app/api/notify-transfers/route.js");

const sessionBase = {
  id: "s1",
  iso: "2026-10-30",
  entries: [
    { name: "א", amount: 100 },
    { name: "ב", amount: -100 },
  ],
};

function req(body) {
  return {
    headers: { get: (k) => (k === "authorization" ? "Bearer tok" : null) },
    json: async () => body,
  };
}
const paidBody = (over = {}) => ({
  slug: "g1",
  sessionId: "s1",
  action: "paid",
  transferIndex: 0,
  payerName: "ב",
  payeeName: "א",
  amount: 100,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.pushToTargets.mockResolvedValue({ sent: 1 });
  h.row = { id: 7, slug: "g1", data: { sessions: [sessionBase] } };
});

describe("notify-transfers paid — אימות מול המסד", () => {
  it("בלי סימון שמור במסד — אין פוש, דיווח כנה", async () => {
    const res = await POST(req(paidBody()));
    expect(res.body).toMatchObject({ ok: true, sent: 0, skipped: "not marked" });
    expect(h.pushToTargets).not.toHaveBeenCalled();
  });

  it("עם סימון שמור וסכום תואם — הפוש יוצא כרגיל", async () => {
    const marked = markTransfer(sessionBase, 0, true, "ב");
    h.row = { id: 7, slug: "g1", data: { sessions: [marked] } };
    const res = await POST(req(paidBody()));
    expect(res.body).toMatchObject({ ok: true, sent: 1 });
    expect(h.pushToTargets).toHaveBeenCalledTimes(1);
  });

  it("סימון קיים אבל הסכום לא תואם — אין פוש", async () => {
    const marked = markTransfer(sessionBase, 0, true, "ב");
    h.row = { id: 7, slug: "g1", data: { sessions: [marked] } };
    const res = await POST(req(paidBody({ amount: 999 })));
    expect(res.body).toMatchObject({ ok: true, sent: 0, skipped: "amount mismatch" });
    expect(h.pushToTargets).not.toHaveBeenCalled();
  });

  it("אינדקס מחוץ לתוכנית — אין פוש", async () => {
    const marked = markTransfer(sessionBase, 0, true, "ב");
    h.row = { id: 7, slug: "g1", data: { sessions: [marked] } };
    const res = await POST(req(paidBody({ transferIndex: 5 })));
    expect(res.body).toMatchObject({ ok: true, sent: 0, skipped: "not marked" });
    expect(h.pushToTargets).not.toHaveBeenCalled();
  });
});
