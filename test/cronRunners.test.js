/* גל 5 (ממצא ביקורת 19) — ארבעת מריצי ה־cron האמיתיים תחת בדיקה.
   עד הגל, הבדיקה היחידה של קרון הבוקר (published-routes) החליפה את כל
   ארבעת המריצים במוקים ואמתה את המוקים של עצמה — שום בדיקה לא ייבאה את
   המריצים האמיתיים. כאן מריצים אותם מקצה לקצה מול לקוח Supabase מזויף
   בזיכרון: שליפת הקבוצה, תכנון (collectNotices / sessionsDue /
   dueReports האמיתיים), שליחה דרך הגבולות הממוקים, וחותמות CAS. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: null,
  views: [],
  subscriptions: [],
  casPatches: [],
  casOk: true,
  sendToGroup: vi.fn(async () => ({ message: { id: "wa-1" } })),
  sendImageToGroup: vi.fn(async () => ({ message: { id: "wa-img" } })),
  sendPlayerNotice: vi.fn(async () => ({ sent: true })),
  pushToTargets: vi.fn(async () => ({ sent: 1, failed: 0 })),
  reportError: vi.fn(async () => {}),
}));

/* לקוח מזויף: from("groups").select().eq().single() ורשימות await-ables. */
function fakeSupabase() {
  return {
    from(table) {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        /* גל 3 (3.3): runNoticeEmails מסדר ומגביל את שליפת הצפיות —
           ה־order מחזיר את השרשרת וה־limit פותר כ־await (סוף השרשרת). */
        order() {
          return chain;
        },
        limit() {
          return Promise.resolve({
            data: table === "group_views" ? h.views : [],
            error: null,
          });
        },
        async single() {
          if (table === "groups") {
            return h.row
              ? { data: h.row, error: null }
              : { data: null, error: { message: "no rows" } };
          }
          return { data: null, error: { message: "n/a" } };
        },
        then(resolve) {
          const data =
            table === "group_views"
              ? h.views
              : table === "push_subscriptions"
                ? h.subscriptions
                : [];
          resolve({ data, error: null });
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: () => fakeSupabase(),
  pingViewers: vi.fn(async () => {}),
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

vi.mock("@/lib/whatsapp", () => ({
  sendToGroup: h.sendToGroup,
  sendImageToGroup: h.sendImageToGroup,
}));

vi.mock("@/lib/wa/healthServer", () => ({
  trackWaSend: async (_ctx, fn) => fn(),
  recordWaSend: vi.fn(async () => {}),
}));

vi.mock("@/lib/monitor", () => ({ reportError: h.reportError }));
vi.mock("@/lib/noticeMail", () => ({ sendPlayerNotice: h.sendPlayerNotice }));
vi.mock("@/lib/push", () => ({
  pushToTargets: h.pushToTargets,
  notifyGameStart: vi.fn(async () => ({})),
}));
vi.mock("@/lib/summaryCardPng", () => ({
  renderSummaryCardPng: async () => null,
  summaryCardFileName: () => "card.png",
}));
vi.mock("@/lib/waPins", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, pinAfterSend: vi.fn(async () => ({ ok: true })) };
});

const { runPeriodReports } = await import("../lib/runPeriodReports.js");
const { runPaymentReminders } = await import("../lib/runPaymentReminders.js");
const { runNoticeEmails } = await import("../lib/runNoticeEmails.js");
const { runNoticePushes } = await import("../lib/runNoticePushes.js");
const { paymentPlan } = await import("../lib/paymentTracking.js");
const { collectNotices } = await import("../lib/notifications.js");

const T0 = Date.parse("2026-10-30T20:00:00.000Z");

/* אותו "עכשיו" שהמריץ מחשב (שעון ירושלים) — כדי שמפתחות המועד יתאימו. */
function jerusalemNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
}

function openNight() {
  /* ערב סגור עם העברה אחת פתוחה: קובי חייב לאופיר 100. */
  return {
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
}

function groupRow({ data, config } = {}) {
  return {
    id: "group-1",
    slug: "kupa",
    data: data ?? { sessions: [openNight()], roster: ["קובי סעדה", "אופיר סנה"], aliases: {} },
    config: config ?? {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.row = groupRow();
  h.views = [];
  h.subscriptions = [];
  h.casPatches = [];
  h.casOk = true;
  process.env.KUPA_GROUP_SLUG = "kupa";
  process.env.WHAPI_TOKEN = "tok";
  process.env.WHAPI_GROUP_ID = "120363@g.us";
  process.env.NEXT_PUBLIC_SITE_URL = "https://kupa-poker.vercel.app";
});

describe("runPaymentReminders (אמיתי)", () => {
  it("שולח תזכורת על העברה פתוחה וכותב חותמת דרך CAS", async () => {
    const out = await runPaymentReminders({ force: true });
    expect(out.ok).toBe(true);
    expect(out.results).toEqual([
      expect.objectContaining({ id: "night-1", sent: true }),
    ]);
    expect(h.sendToGroup).toHaveBeenCalledTimes(1);
    const [text, dest] = h.sendToGroup.mock.calls[0];
    expect(text).toContain("חלוקת ערב");
    expect(dest).toMatchObject({ token: "tok", groupId: "120363@g.us" });
    const stamp = h.casPatches.at(-1)?.config?.sentPaymentReminders;
    expect(stamp?.["night-1"]).toBe(out.today);
  });

  it("לא שולח כלום כשכל ההעברות סגורות", async () => {
    const night = openNight();
    const plan = paymentPlan(night);
    night.payments = { plan: plan.fingerprint, paid: plan.transfers.map(() => true) };
    h.row = groupRow({ data: { sessions: [night], roster: [], aliases: {} } });
    const out = await runPaymentReminders({ force: true });
    expect(out).toMatchObject({ ok: true, due: [], results: [] });
    expect(h.sendToGroup).not.toHaveBeenCalled();
  });

  it("חותמת שלא נחתה מדווחת ככשל, לא כהצלחה", async () => {
    h.casOk = false;
    const out = await runPaymentReminders({ force: true });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("stamp write failed");
    expect(h.reportError).toHaveBeenCalled();
  });

  it("קבוצה חסרה מחזירה שגיאה נקייה", async () => {
    h.row = null;
    const out = await runPaymentReminders({ force: true });
    expect(out).toEqual({ ok: false, error: "no group" });
  });
});

describe("runNoticeEmails (אמיתי)", () => {
  it("במפגש ראשון רק רושם firstSeen — בלי מייל", async () => {
    const out = await runNoticeEmails({ now: new Date(T0) });
    expect(out.ok).toBe(true);
    expect(out.due).toBe(0);
    expect(h.sendPlayerNotice).not.toHaveBeenCalled();
    const firstSeen = h.casPatches.at(-1)?.config?.noticeFirstSeen;
    expect(Object.keys(firstSeen || {}).length).toBeGreaterThan(0);
  });

  it("אחרי שלוש כניסות בלי טיפול שולח מייל אחד וכותב חותמת", async () => {
    const now = new Date(T0);
    const items = collectNotices(h.row.data, now);
    expect(items.length).toBeGreaterThan(0);
    /* זורעים firstSeen לאחור לכל המפתחות החיים, כמו ריצות קודמות. */
    const firstSeen = {};
    for (const item of items) {
      for (const player of item.audience || []) {
        firstSeen[`${item.id}|${player}`] = new Date(T0 - 4 * 86400000).toISOString();
      }
    }
    h.row = groupRow({ config: { noticeFirstSeen: firstSeen } });
    h.views = [0, 1, 2].map((i) => ({
      email: "kobi@example.com",
      name: "קובי סעדה",
      at: new Date(T0 - i * 3600000).toISOString(),
    }));
    const out = await runNoticeEmails({ now });
    expect(out.ok).toBe(true);
    expect(out.due).toBeGreaterThan(0);
    expect(h.sendPlayerNotice).toHaveBeenCalled();
    for (const call of h.sendPlayerNotice.mock.calls) {
      expect(call[0].to).toBe("kobi@example.com");
    }
    const sentMap = h.casPatches.at(-1)?.config?.noticeEmails;
    expect(Object.keys(sentMap || {}).length).toBe(out.due);
  });
});

describe("runNoticePushes (אמיתי)", () => {
  it("שולח פוש למנוי של השחקן וכותב חותמת", async () => {
    h.subscriptions = [
      {
        id: "sub-1",
        endpoint: "https://push.example/1",
        p256dh: "k",
        auth: "a",
        name: "קובי סעדה",
        player_name: "קובי סעדה",
      },
    ];
    const out = await runNoticePushes({ now: new Date(T0) });
    expect(out.ok).toBe(true);
    expect(out.due).toBeGreaterThan(0);
    expect(h.pushToTargets).toHaveBeenCalled();
    const sentMap = h.casPatches.at(-1)?.config?.noticePushes;
    expect(Object.keys(sentMap || {}).length).toBe(out.due);
  });

  it("בלי מנויים אין שליחה ואין כתיבה", async () => {
    const out = await runNoticePushes({ now: new Date(T0) });
    expect(out).toMatchObject({ ok: true, due: 0 });
    expect(h.pushToTargets).not.toHaveBeenCalled();
    expect(h.casPatches).toHaveLength(0);
  });
});

describe("runPeriodReports (אמיתי)", () => {
  function prevMonthNight() {
    const now = jerusalemNow();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    return {
      id: "night-prev",
      iso: prev.toISOString().slice(0, 10),
      d: 15,
      mo: prev.getMonth() + 1,
      y: prev.getFullYear(),
      cps: 2,
      entries: [
        { name: "קובי סעדה", amount: -100 },
        { name: "אופיר סנה", amount: 100 },
      ],
    };
  }

  it("שולח את דוח החודש הקודם וכותב חותמת sentReports", async () => {
    const night = prevMonthNight();
    const monthlyKey = `m:${night.y}-${String(night.mo).padStart(2, "0")}`;
    /* שאר הדוחות שבמועד (רבעוני/שנתי) מסומנים כנשלחו, כדי שהחודשי
       יהיה השליחה היחידה בריצה. */
    const { dueReports } = await import("../lib/summary.js");
    const sentReports = Object.fromEntries(
      dueReports(jerusalemNow())
        .filter((d) => d.key !== monthlyKey)
        .map((d) => [d.key, true])
    );
    h.row = groupRow({
      data: { sessions: [night], roster: ["קובי סעדה", "אופיר סנה"], aliases: {} },
      config: { sentReports },
    });
    const out = await runPeriodReports();
    expect(out.ok).toBe(true);
    const sentResult = out.results.find((r) => r.sent);
    expect(sentResult?.key).toBe(monthlyKey);
    expect(h.sendToGroup).toHaveBeenCalledTimes(1);
    const stamp = h.casPatches.at(-1)?.config?.sentReports;
    expect(stamp?.[monthlyKey]).toBe(true);
  });

  it("מדלג על דוח שכבר נשלח, בלי שליחה חוזרת", async () => {
    const night = prevMonthNight();
    const key = `m:${night.y}-${String(night.mo).padStart(2, "0")}`;
    /* כל המפתחות שבמועד מסומנים כנשלחו — לא רק החודשי (גם רבעוני/שנתי
       יכולים להיות במועד באותה ריצה). */
    const { dueReports } = await import("../lib/summary.js");
    const sentReports = Object.fromEntries(
      dueReports(jerusalemNow()).map((d) => [d.key, true])
    );
    h.row = groupRow({
      data: { sessions: [night], roster: [], aliases: {} },
      config: { sentReports },
    });
    const out = await runPeriodReports();
    expect(out.ok).toBe(true);
    expect(out.results.find((r) => r.key === key)?.skipped).toBe("already sent");
    expect(h.sendToGroup).not.toHaveBeenCalled();
  });

  it("בלי ערבים בתקופה — מדווח no sessions ולא שולח", async () => {
    h.row = groupRow({ data: { sessions: [], roster: [], aliases: {} } });
    const out = await runPeriodReports();
    expect(out.ok).toBe(true);
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results.every((r) => r.skipped === "no sessions")).toBe(true);
    expect(h.sendToGroup).not.toHaveBeenCalled();
  });
});
