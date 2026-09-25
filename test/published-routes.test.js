import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sendToGroup: vi.fn(async () => ({ message: { id: "sent-1" } })),
  setPresenceOffline: vi.fn(async () => ({ ok: true })),
  pinAfterSend: vi.fn(async () => {}),
  runPeriodReports: vi.fn(async () => ({ ok: true, due: ["month"] })),
  runPaymentReminders: vi.fn(async () => ({ ok: true, results: ["night"] })),
  runNoticeEmails: vi.fn(async () => ({ ok: true, due: 0, results: [] })),
  runNoticePushes: vi.fn(async () => ({ ok: true, due: 0, results: [] })),
  hour: 8,
  writes: [],
  row: null,
}));

vi.mock("@/lib/whatsapp", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    sendToGroup: h.sendToGroup,
    setPresenceOffline: h.setPresenceOffline,
  };
});

vi.mock("@/lib/waPins", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, pinAfterSend: h.pinAfterSend };
});

vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: () => ({
    from() {
      const chain = {
        select() {
          return chain;
        },
        update(payload) {
          h.writes.push(payload);
          return chain;
        },
        eq() {
          return chain;
        },
        async single() {
          return { data: h.row, error: null };
        },
        async maybeSingle() {
          return { data: { config: h.row?.config || {} }, error: null };
        },
      };
      return chain;
    },
  }),
  pingViewers: vi.fn(async () => {}),
}));

vi.mock("@/lib/push", () => ({ notifyGameStart: vi.fn(async () => {}) }));
vi.mock("@/lib/monitor", () => ({ reportError: vi.fn(async () => {}) }));

vi.mock("@/lib/runPeriodReports", () => ({
  runPeriodReports: (...args) => h.runPeriodReports(...args),
}));
vi.mock("@/lib/runPaymentReminders", () => ({
  runPaymentReminders: (...args) => h.runPaymentReminders(...args),
}));
vi.mock("@/lib/runNoticeEmails", () => ({
  runNoticeEmails: (...args) => h.runNoticeEmails(...args),
}));
vi.mock("@/lib/runNoticePushes", () => ({
  runNoticePushes: (...args) => h.runNoticePushes(...args),
}));
vi.mock("@/lib/paymentReminder", () => ({
  jerusalemHour: () => h.hour,
}));

const { POST } = await import("../app/api/whatsapp/route.js");
const { GET: cronGET } = await import("../app/api/cron-daily/route.js");

function seatedNight() {
  return {
    id: "group-1",
    slug: "kupa",
    config: { botOn: true, pins: {} },
    data: { sessions: [], roster: ["קובי סעדה", "אופיר סנה"], aliases: {} },
    live: {
      players: [
        { name: "קובי סעדה", buyin: 100, cashout: "" },
        { name: "אופיר סנה", buyin: 100, cashout: "" },
      ],
      entriesCount: "10",
      startedAt: 1_700_000_000_000,
    },
  };
}

function webhookRequest(text, { secret = "s3cret" } = {}) {
  return new Request(`https://kupa-poker.vercel.app/api/whatsapp?secret=${secret}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          id: "msg-batch",
          chat_id: "1203630199@g.us",
          from: "972501111111",
          text: { body: text },
        },
      ],
    }),
  });
}

describe("published whatsapp webhook", () => {
  beforeEach(() => {
    h.sendToGroup.mockClear();
    h.setPresenceOffline.mockClear();
    h.pinAfterSend.mockClear();
    h.writes.length = 0;
    h.row = seatedNight();
    process.env.WHATSAPP_WEBHOOK_SECRET = "s3cret";
    process.env.WHAPI_TOKEN = "tok";
    process.env.WHAPI_GROUP_ID = "1203630199@g.us";
    process.env.WHATSAPP_OWNER = "972501111111";
    process.env.WHATSAPP_ALLOWED = "";
    process.env.KUPA_GROUP_SLUG = "kupa";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://kupa-poker.vercel.app";
  });

  it("rejects a call without the webhook secret and does not send", async () => {
    const res = await POST(webhookRequest("קובי 50", { secret: "nope" }));
    expect(res.status).toBe(403);
    expect(h.sendToGroup).not.toHaveBeenCalled();
    expect(h.writes).toHaveLength(0);
  });

  it("applies every line in one inbound message and sends a single reply", async () => {
    const text = "קובי 50\nאופיר 5 טיפ\nעוד 5 כניסות";
    const res = await POST(webhookRequest(text));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handled).toBe(3);

    expect(h.sendToGroup).toHaveBeenCalledTimes(1);
    const [reply, dest] = h.sendToGroup.mock.calls[0];
    expect(dest).toMatchObject({ token: "tok", groupId: "1203630199@g.us" });
    expect(reply).toContain("קובי סעדה");
    expect(reply).toContain("+50₪");
    expect(reply).toContain("אופיר");
    expect(reply).toContain("נוספו 5 כניסות");

    expect(h.writes).toHaveLength(1);
    const live = h.writes[0].live;
    expect(live.players.find((p) => p.name === "קובי סעדה").buyin).toBe(150);
    expect(live.players.find((p) => p.name === "אופיר סנה").tipsGiven).toBe(5);
    expect(String(live.entriesCount)).toBe("15");
  });
});

describe("published daily cron", () => {
  beforeEach(() => {
    h.runPeriodReports.mockClear();
    h.runPaymentReminders.mockClear();
    h.runNoticeEmails.mockClear();
    h.runNoticePushes.mockClear();
    h.hour = 8;
    process.env.WHATSAPP_WEBHOOK_SECRET = "s3cret";
    delete process.env.CRON_SECRET;
  });

  it("rejects an open call and does not run the jobs", async () => {
    const res = await cronGET(new Request("https://kupa-poker.vercel.app/api/cron-daily"));
    expect(res.status).toBe(403);
    expect(h.runPeriodReports).not.toHaveBeenCalled();
    expect(h.runPaymentReminders).not.toHaveBeenCalled();
    expect(h.runNoticeEmails).not.toHaveBeenCalled();
    expect(h.runNoticePushes).not.toHaveBeenCalled();
  });

  it("skips before 08:00 Israel and does not send reports or reminders", async () => {
    h.hour = 5;
    const res = await cronGET(
      new Request("https://kupa-poker.vercel.app/api/cron-daily?secret=s3cret")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe("not 08:00 Israel");
    expect(h.runPeriodReports).not.toHaveBeenCalled();
    expect(h.runPaymentReminders).not.toHaveBeenCalled();
    expect(h.runNoticeEmails).not.toHaveBeenCalled();
    expect(h.runNoticePushes).not.toHaveBeenCalled();
  });

  it("runs reports and payment reminders on the morning cron", async () => {
    const res = await cronGET(
      new Request("https://kupa-poker.vercel.app/api/cron-daily?secret=s3cret")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(h.runPeriodReports).toHaveBeenCalledTimes(1);
    expect(h.runPaymentReminders).toHaveBeenCalledTimes(1);
    expect(h.runNoticeEmails).toHaveBeenCalledTimes(1);
    expect(h.runNoticePushes).toHaveBeenCalledTimes(1);
    expect(body.reports.due).toEqual(["month"]);
    expect(body.payments.results).toEqual(["night"]);
  });
});
