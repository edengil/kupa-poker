/* גל 5 (ממצא ביקורת 19) — בדיקות נתיב לנתיבי API שלא כוסו בכלל:
   settlement-closed (הכרזת סגירת חלוקה), payment-reminders (שער + האצלה),
   notify-start (התראת פתיחת משחק, בעלות בלבד) ו־wa-scan (סריקת סיכומים).
   הגבולות החיצוניים ממוקים; לוגיקת הנתיב והספריות הטהורות אמיתיות. */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pub-key";
process.env.WHATSAPP_WEBHOOK_SECRET = "s3cret";
delete process.env.CRON_SECRET;

const h = vi.hoisted(() => ({
  row: null,
  casOk: true,
  casPatches: [],
  getUser: vi.fn(async () => ({ data: { user: null }, error: { message: "no user" } })),
  sendToGroup: vi.fn(async () => ({ message: { id: "wa-1" } })),
  recordWaSend: vi.fn(async () => {}),
  reportError: vi.fn(async () => {}),
  notifyGameStart: vi.fn(async () => ({ sent: 3, skipped: 0 })),
  runPaymentReminders: vi.fn(async () => ({ ok: true, results: [] })),
}));

function groupsChain() {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    async single() {
      return h.row
        ? { data: h.row, error: null }
        : { data: null, error: { message: "no rows" } };
    },
  };
  return chain;
}

vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: () => ({
    auth: { getUser: h.getUser },
    from: () => groupsChain(),
  }),
  pingViewers: vi.fn(async () => {}),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: h.getUser } }),
}));

vi.mock("@/lib/whatsapp", () => ({ sendToGroup: h.sendToGroup }));
vi.mock("@/lib/wa/healthServer", () => ({
  recordWaSend: h.recordWaSend,
  trackWaSend: async (_ctx, fn) => fn(),
}));
vi.mock("@/lib/monitor", () => ({ reportError: h.reportError }));
vi.mock("@/lib/push", () => ({
  notifyGameStart: h.notifyGameStart,
  pushToTargets: vi.fn(async () => ({ sent: 0, failed: 0 })),
}));
vi.mock("@/lib/runPaymentReminders", () => ({
  runPaymentReminders: h.runPaymentReminders,
}));
vi.mock("@/lib/groupCas", () => ({
  updateGroupCas: async (_sb, _id, build) => {
    if (!h.casOk) return { ok: false, conflict: true };
    const patch = build({
      id: h.row?.id,
      config: structuredClone(h.row?.config || {}),
      data: h.row?.data,
    });
    h.casPatches.push(patch);
    if (patch.config && h.row) h.row = { ...h.row, config: patch.config };
    return { ok: true, updatedAt: "2026-10-31T06:00:00.000Z" };
  },
}));

const { POST: settlementClosedPOST } = await import("../app/api/settlement-closed/route.js");
const { POST: notifyStartPOST } = await import("../app/api/notify-start/route.js");
const { GET: paymentRemindersGET } = await import("../app/api/payment-reminders/route.js");
const { GET: waScanGET } = await import("../app/api/wa-scan/route.js");
const { paymentPlan } = await import("../lib/paymentTracking.js");

const T0 = Date.parse("2026-10-30T20:00:00.000Z");

function night({ closed = false } = {}) {
  const s = {
    id: "night-1",
    iso: "2026-10-30",
    d: 30,
    mo: 10,
    y: 2026,
    cps: 2,
    endedAt: T0,
    entries: [
      { name: "קובי סעדה", amount: -100 },
      { name: "אופיר סנה", amount: 100 },
    ],
  };
  if (closed) {
    const plan = paymentPlan(s);
    s.payments = { plan: plan.fingerprint, paid: plan.transfers.map(() => true) };
  }
  return s;
}

function asUser(id = "owner-1") {
  h.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function authedRequest(url, { token = "user-token", body } = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  /* mockResolvedValue של asUser שורד clearAllMocks — מאפסים במפורש. */
  h.getUser.mockReset();
  h.getUser.mockImplementation(async () => ({
    data: { user: null },
    error: { message: "no user" },
  }));
  h.casOk = true;
  h.casPatches = [];
  h.row = {
    id: "group-1",
    slug: "kupa",
    owner_id: "owner-1",
    config: {},
    data: { sessions: [night({ closed: true })], roster: [], aliases: {} },
  };
  process.env.WHAPI_TOKEN = "tok";
  process.env.WHAPI_GROUP_ID = "120363@g.us";
  process.env.WHATSAPP_WEBHOOK_SECRET = "s3cret";
  delete process.env.CRON_SECRET;
});

describe("POST /api/settlement-closed", () => {
  const url = "https://kupa-poker.vercel.app/api/settlement-closed";

  it("בלי טוקן — 401, בלי שליחה", async () => {
    const res = await settlementClosedPOST(
      authedRequest(url, { token: null, body: { slug: "kupa", sessionId: "night-1" } })
    );
    expect(res.status).toBe(401);
    expect(h.sendToGroup).not.toHaveBeenCalled();
  });

  it("בלי sessionId — 400", async () => {
    asUser();
    const res = await settlementClosedPOST(authedRequest(url, { body: { slug: "kupa" } }));
    expect(res.status).toBe(400);
  });

  it("כבר הוכרז — מדלג בלי שליחה חוזרת", async () => {
    asUser();
    h.row.config = { settlementClosed: { "night-1": "2026-10-31T05:00:00.000Z" } };
    const res = await settlementClosedPOST(
      authedRequest(url, { body: { slug: "kupa", sessionId: "night-1" } })
    );
    expect(await res.json()).toMatchObject({ skipped: "already sent" });
    expect(h.sendToGroup).not.toHaveBeenCalled();
  });

  it("העברות עדיין פתוחות — מדלג", async () => {
    asUser();
    h.row.data = { sessions: [night({ closed: false })], roster: [], aliases: {} };
    const res = await settlementClosedPOST(
      authedRequest(url, { body: { slug: "kupa", sessionId: "night-1" } })
    );
    expect(await res.json()).toMatchObject({ skipped: "still open" });
    expect(h.sendToGroup).not.toHaveBeenCalled();
  });

  it("כולם סגרו — שולח הכרזה וכותב חותמת דרך CAS", async () => {
    asUser();
    const res = await settlementClosedPOST(
      authedRequest(url, { body: { slug: "kupa", sessionId: "night-1" } })
    );
    expect(await res.json()).toMatchObject({ ok: true, sent: true });
    expect(h.sendToGroup).toHaveBeenCalledTimes(1);
    expect(h.sendToGroup.mock.calls[0][0]).toContain("החלוקה סגורה");
    expect(h.casPatches.at(-1)?.config?.settlementClosed?.["night-1"]).toBeTruthy();
  });

  it("חותמת שלא נחתה — 500, לא הצלחה שקרית", async () => {
    asUser();
    h.casOk = false;
    const res = await settlementClosedPOST(
      authedRequest(url, { body: { slug: "kupa", sessionId: "night-1" } })
    );
    expect(res.status).toBe(500);
    expect(h.reportError).toHaveBeenCalled();
  });
});

describe("POST /api/notify-start", () => {
  const url = "https://kupa-poker.vercel.app/api/notify-start";

  it("בלי כותרת Authorization — 401", async () => {
    const res = await notifyStartPOST(authedRequest(url, { token: null, body: { slug: "kupa" } }));
    expect(res.status).toBe(401);
    expect(h.notifyGameStart).not.toHaveBeenCalled();
  });

  it("טוקן לא תקין — 401", async () => {
    const res = await notifyStartPOST(authedRequest(url, { body: { slug: "kupa" } }));
    expect(res.status).toBe(401);
  });

  it("בלי slug — 400", async () => {
    asUser();
    const res = await notifyStartPOST(authedRequest(url, { body: {} }));
    expect(res.status).toBe(400);
  });

  it("משתמש שאינו הבעלים — 403, בלי התראה", async () => {
    asUser("someone-else");
    const res = await notifyStartPOST(authedRequest(url, { body: { slug: "kupa" } }));
    expect(res.status).toBe(403);
    expect(h.notifyGameStart).not.toHaveBeenCalled();
  });

  it("הבעלים — שולח התראת פתיחה", async () => {
    asUser("owner-1");
    const res = await notifyStartPOST(authedRequest(url, { body: { slug: "kupa" } }));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, sent: 3 });
    expect(h.notifyGameStart).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/payment-reminders", () => {
  const base = "https://kupa-poker.vercel.app/api/payment-reminders";

  it("בלי סוד — 403 והמריץ לא רץ", async () => {
    const res = await paymentRemindersGET(new Request(base));
    expect(res.status).toBe(403);
    expect(h.runPaymentReminders).not.toHaveBeenCalled();
  });

  it("עם סוד — מאציל למריץ ומחזיר את הפלט שלו", async () => {
    h.runPaymentReminders.mockResolvedValue({ ok: true, today: "2026-10-31", results: [{ id: "night-1", sent: true }] });
    const res = await paymentRemindersGET(new Request(`${base}?secret=s3cret&force=1`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(h.runPaymentReminders).toHaveBeenCalledWith({ force: true });
  });

  it("שגיאת מריץ — 500 ודיווח", async () => {
    h.runPaymentReminders.mockResolvedValue({ ok: false, error: "no group" });
    const res = await paymentRemindersGET(new Request(`${base}?secret=s3cret`));
    expect(res.status).toBe(500);
    expect(h.reportError).toHaveBeenCalled();
  });
});

describe("GET /api/wa-scan", () => {
  const base = "https://kupa-poker.vercel.app/api/wa-scan";

  it("בלי סוד — 403", async () => {
    const res = await waScanGET(new Request(base));
    expect(res.status).toBe(403);
  });

  it("מסנן הודעות פוקר מתוך הרשימה וסופר נכון", async () => {
    const messages = [
      { id: "m1", timestamp: 1792000000, from_me: false, text: { body: "סיכום פוקר של הערב — כולם העבירו" } },
      { id: "m2", timestamp: 1792000100, from_me: false, text: { body: "מה נשמע חברים, מתי נפגשים" } },
      { id: "m3", timestamp: 1792000200, from_me: true, text: { body: "חלוקה: קובי מעביר 100 לאופיר" } },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ messages }) }))
    );
    const res = await waScanGET(new Request(`${base}?secret=s3cret&count=50`));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.scanned).toBe(3);
    expect(body.hits).toBe(2);
    expect(body.messages.map((m) => m.id)).toEqual(["m1", "m3"]);
    vi.unstubAllGlobals();
  });

  it("כשל Whapi — 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "unauthorized" }))
    );
    const res = await waScanGET(new Request(`${base}?secret=s3cret`));
    expect(res.status).toBe(502);
    vi.unstubAllGlobals();
  });
});
