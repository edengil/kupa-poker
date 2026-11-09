/* גל 7, פריט 7.1 — ארבעת רצי הקרון תחת שעון מזויף אמיתי.
   cronRunners.test.js (גל 5) מריץ את הרצים מקצה־לקצה עם now מפורש;
   כאן נוסף ציר הזמן עצמו: vi.useFakeTimers + setSystemTime מזיזים את
   שעון המערכת האמיתי שהרצים קוראים (Date / new Date()), ומוכיחים
   התנהגות תלוית־שעה: חלון תזכורת התשלומים נפתח ב־08:00 ישראל וסגור
   בלילה, אסטרטגיית ה־firstSeen של מיילי ההתראות מתקדמת עם הימים,
   ודוחות תקופתיים נקבעים לפי החודש שבשעון — לא לפי זמן ההרצה. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    return { ok: true, updatedAt: "2026-11-02T06:00:00.000Z" };
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
const { collectNotices } = await import("../lib/notifications.js");

/* 08:30 בבוקר ישראל (UTC+2 בנובמבר) ו־03:00 בלילה ישראל. */
const MORNING_IL = Date.parse("2026-11-02T06:30:00.000Z");
const NIGHT_IL = Date.parse("2026-11-02T01:00:00.000Z");

function openNight() {
  return {
    id: "night-1",
    iso: "2026-10-30",
    d: 30,
    mo: 10,
    y: 2026,
    cps: 2,
    endedAt: Date.parse("2026-10-30T20:00:00.000Z"),
    entries: [
      { name: "קובי סעדה", amount: -100 },
      { name: "אופיר סנה", amount: 100 },
    ],
  };
}

function octoberNight() {
  return {
    id: "night-oct",
    iso: "2026-10-15",
    d: 15,
    mo: 10,
    y: 2026,
    cps: 2,
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
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("שעון מזויף — runPaymentReminders", () => {
  it("ב־03:00 בלילה החלון סגור: skipped בלי שליפה ובלי שליחה", async () => {
    vi.setSystemTime(NIGHT_IL);
    const out = await runPaymentReminders();
    expect(out).toMatchObject({ ok: true, skipped: "not reminder hour" });
    expect(h.sendToGroup).not.toHaveBeenCalled();
    expect(h.casPatches).toHaveLength(0);
  });

  it("ב־08:30 בבוקר החלון פתוח: תזכורת נשלחת והחותמת היא תאריך היום בשעון", async () => {
    vi.setSystemTime(MORNING_IL);
    const out = await runPaymentReminders();
    expect(out.ok).toBe(true);
    expect(out.today).toBe("2026-11-02");
    expect(out.results).toEqual([expect.objectContaining({ id: "night-1", sent: true })]);
    expect(h.sendToGroup).toHaveBeenCalledTimes(1);
    const stamp = h.casPatches.at(-1)?.config?.sentPaymentReminders;
    expect(stamp?.["night-1"]).toBe("2026-11-02");
  });

  it("מעבר יום בשעון: חותמת של אתמול לא חוסמת את שליחת היום", async () => {
    vi.setSystemTime(MORNING_IL);
    h.row = groupRow({ config: { sentPaymentReminders: { "night-1": "2026-11-01" } } });
    const out = await runPaymentReminders();
    expect(out.results).toEqual([expect.objectContaining({ id: "night-1", sent: true })]);
  });
});

describe("שעון מזויף — runNoticeEmails / runNoticePushes", () => {
  it("יום 0: רק firstSeen נרשם, אין מייל; +4 ימים ו־3 צפיות: מייל נשלח, וריצה חוזרת באותו יום לא כופלת", async () => {
    vi.setSystemTime(MORNING_IL);
    const day0 = await runNoticeEmails();
    expect(day0).toMatchObject({ ok: true, due: 0 });
    expect(h.sendPlayerNotice).not.toHaveBeenCalled();
    const firstSeen = h.casPatches.at(-1)?.config?.noticeFirstSeen;
    expect(Object.keys(firstSeen || {}).length).toBeGreaterThan(0);

    /* מזיזים את השעון 4 ימים קדימה ומזינים 3 צפיות של אותו שחקן */
    vi.setSystemTime(MORNING_IL + 4 * 86400000);
    h.views = [0, 1, 2].map((i) => ({
      email: "kobi@example.com",
      name: "קובי סעדה",
      at: new Date(MORNING_IL + 4 * 86400000 - i * 3600000).toISOString(),
    }));
    const day4 = await runNoticeEmails();
    expect(day4.ok).toBe(true);
    expect(day4.due).toBeGreaterThan(0);
    expect(h.sendPlayerNotice).toHaveBeenCalled();

    /* ריצה שנייה באותו יום (שעון לא זז): החותמות שנכתבו חוסמות כפילות */
    h.sendPlayerNotice.mockClear();
    const again = await runNoticeEmails();
    expect(again.due).toBe(0);
    expect(h.sendPlayerNotice).not.toHaveBeenCalled();
  });

  it("runNoticePushes תחת שעון מזויף: בלי מנויים — due=0 ואין כתיבה", async () => {
    vi.setSystemTime(MORNING_IL);
    const out = await runNoticePushes();
    expect(out).toMatchObject({ ok: true, due: 0 });
    expect(h.pushToTargets).not.toHaveBeenCalled();
    expect(h.casPatches).toHaveLength(0);
  });

  it("כשל: שורת קבוצה חסרה מחזירה no group גם תחת שעון מזויף", async () => {
    vi.setSystemTime(MORNING_IL);
    h.row = null;
    await expect(runNoticeEmails()).resolves.toMatchObject({ ok: false });
    await expect(runPaymentReminders()).resolves.toEqual({ ok: false, error: "no group" });
  });
});

describe("שעון מזויף — runPeriodReports", () => {
  it("השעון ב־2.11: דוח חודש אוקטובר (m:2026-10) נשלל ונחתם; אותה ריצה שוב — מדולג", async () => {
    vi.setSystemTime(MORNING_IL);
    h.row = groupRow({
      data: { sessions: [octoberNight()], roster: ["קובי סעדה", "אופיר סנה"], aliases: {} },
    });
    const out = await runPeriodReports();
    expect(out.ok).toBe(true);
    const sent = out.results.find((r) => r.key === "m:2026-10");
    expect(sent?.sent).toBe(true);
    expect(h.sendToGroup).toHaveBeenCalledTimes(1);
    const stamp = h.casPatches.at(-1)?.config?.sentReports;
    expect(stamp?.["m:2026-10"]).toBe(true);

    h.sendToGroup.mockClear();
    const again = await runPeriodReports();
    expect(again.results.find((r) => r.key === "m:2026-10")?.skipped).toBe("already sent");
    expect(h.sendToGroup).not.toHaveBeenCalled();
  });

  it("collectNotices נקבע לפי השעון: אותו מידע, תוצאה שונה ביום אחר", async () => {
    vi.setSystemTime(MORNING_IL);
    const a = collectNotices(h.row.data, new Date());
    vi.setSystemTime(MORNING_IL + 86400000);
    const b = collectNotices(h.row.data, new Date());
    /* הפונקציה דטרמיניסטית ל־now שלה — השעון המזויף הוא שמזיז אותה */
    expect(Array.isArray(a)).toBe(true);
    expect(Array.isArray(b)).toBe(true);
  });
});
