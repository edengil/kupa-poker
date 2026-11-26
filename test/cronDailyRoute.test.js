/* פריט 9 (גל C, חלופה A) — נתיב cron-daily: בידוד כשל פר־רץ + תביעת יום.
   הרצים והמסד ממוקים (כמו published-routes), אבל לוגיקת התביעה אמיתית
   והמצב נשמר בין קריאות דרך שורת הקבוצה המזויפת + CAS מזויף שמחיל את
   ה־patch על ה־config — כך שירי שני רואה את התביעות של הראשון. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: null,
  hour: 8,
  failNext: {},
  runPeriodReports: vi.fn(async () => ({ ok: true, due: ["month"] })),
  runPaymentReminders: vi.fn(async () => ({ ok: true, results: ["night"] })),
  runNoticeEmails: vi.fn(async () => ({ ok: true, due: 0, results: [] })),
  runNoticePushes: vi.fn(async () => ({ ok: true, due: 0, results: [] })),
  runGroupSnapshots: vi.fn(async () => ({
    groups: 1, snapshotted: 1, failed: 0, snapshotsPruned: 0, diagPruned: 0, errors: [],
  })),
  reportError: vi.fn(async () => {}),
}));

function maybeThrow(name) {
  if (h.failNext[name]) {
    h.failNext[name] = false;
    throw new Error(`${name} exploded`);
  }
}

vi.mock("@/lib/runPeriodReports", () => ({
  runPeriodReports: async (...a) => { maybeThrow("reports"); return h.runPeriodReports(...a); },
}));
vi.mock("@/lib/runPaymentReminders", () => ({
  runPaymentReminders: async (...a) => { maybeThrow("payments"); return h.runPaymentReminders(...a); },
}));
vi.mock("@/lib/runNoticeEmails", () => ({
  runNoticeEmails: async (...a) => { maybeThrow("notices"); return h.runNoticeEmails(...a); },
}));
vi.mock("@/lib/runNoticePushes", () => ({
  runNoticePushes: async (...a) => { maybeThrow("pushes"); return h.runNoticePushes(...a); },
}));
vi.mock("@/lib/groupSnapshots", () => ({
  runGroupSnapshots: async (...a) => { maybeThrow("backups"); return h.runGroupSnapshots(...a); },
}));
vi.mock("@/lib/paymentReminder", () => ({ jerusalemHour: () => h.hour }));
vi.mock("@/lib/groupSlug", () => ({ resolveEffectiveSlug: async () => "kupa" }));
vi.mock("@/lib/monitor", () => ({ reportError: h.reportError }));
vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: () => ({
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        async single() { return { data: h.row, error: null }; },
      };
      return chain;
    },
  }),
}));
vi.mock("@/lib/groupCas", () => ({
  updateGroupCas: async (_sb, _id, build) => {
    const patch = build({ id: h.row?.id, config: structuredClone(h.row?.config || {}) });
    if (patch?.config && h.row) h.row = { ...h.row, config: patch.config };
    return { ok: true, updatedAt: "2026-03-27T05:00:01.000Z" };
  },
}));

const { GET } = await import("../app/api/cron-daily/route.js");

/* יום מעבר שעון אביב 2026: 05:00 UTC = 08:00 ישראל, מפתח 2026-03-27 */
const FIRE = "2026-03-27T05:00:00.000Z";
const url = (qs = "?secret=s3cret") => new Request(`https://kupa-poker.vercel.app/api/cron-daily${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  h.row = { id: "group-1", slug: "kupa", config: {} };
  h.hour = 8;
  h.failNext = {};
  process.env.WHATSAPP_WEBHOOK_SECRET = "s3cret";
  delete process.env.CRON_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(FIRE));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cron-daily — הרשאה ושער שעה (ללא שינוי)", () => {
  it("בלי הרשאה: 403 ואף רץ לא רץ", async () => {
    const res = await GET(url(""));
    expect(res.status).toBe(403);
    expect(h.runPeriodReports).not.toHaveBeenCalled();
  });

  it("לפני 08:00: skipped, אף רץ לא רץ, אין תביעה", async () => {
    h.hour = 5;
    const body = await (await GET(url())).json();
    expect(body.skipped).toBe("not 08:00 Israel");
    expect(h.runPeriodReports).not.toHaveBeenCalled();
    expect(h.row.config.cronDailyClaims).toBeUndefined();
  });
});

describe("cron-daily — תביעת יום (אידמפוטנטיות)", () => {
  it("ריצה ראשונה מריצה את כולם ורושמת תביעות תחת מפתח ירושלים", async () => {
    const body = await (await GET(url())).json();
    expect(body.ok).toBe(true);
    expect(body.claimKey).toBe("2026-03-27");
    expect(body.reports.due).toEqual(["month"]);
    expect(body.backups.snapshotted).toBe(1);
    const claims = h.row.config.cronDailyClaims?.["2026-03-27"];
    expect(Object.keys(claims).sort()).toEqual(["backups", "notices", "payments", "pushes", "reports"]);
  });

  it("ירי כפול באותו יום ירושלים: הריצה השנייה no-op מלא — אף רץ לא רץ שוב", async () => {
    await GET(url());
    vi.clearAllMocks();
    const body = await (await GET(url())).json();
    expect(body.ok).toBe(true);
    for (const name of ["reports", "payments", "notices", "pushes", "backups"]) {
      expect(body[name]).toMatchObject({ skipped: "already claimed", claimKey: "2026-03-27" });
    }
    expect(h.runPeriodReports).not.toHaveBeenCalled();
    expect(h.runPaymentReminders).not.toHaveBeenCalled();
    expect(h.runNoticeEmails).not.toHaveBeenCalled();
    expect(h.runNoticePushes).not.toHaveBeenCalled();
    expect(h.runGroupSnapshots).not.toHaveBeenCalled();
  });

  it("יום ירושלים חדש: התביעות של אתמול לא חוסמות", async () => {
    await GET(url());
    vi.setSystemTime(Date.parse("2026-03-28T05:00:00.000Z"));
    vi.clearAllMocks();
    const body = await (await GET(url())).json();
    expect(body.claimKey).toBe("2026-03-28");
    expect(h.runPeriodReports).toHaveBeenCalledTimes(1);
  });

  it("force ידני עוקף תביעה קיימת (התנהגות ידנית קיימת נשמרת)", async () => {
    await GET(url());
    vi.clearAllMocks();
    const body = await (await GET(url("?secret=s3cret&forcePay=1"))).json();
    expect(body.ok).toBe(true);
    expect(h.runPaymentReminders).toHaveBeenCalledTimes(1);
  });
});

describe("cron-daily — בידוד כשל פר־רץ ושחזור מקריסה", () => {
  it("רץ שזורק לא מפיל את האחרים: כולם רצים, הכשל מדווח ומסומן בתשובה", async () => {
    h.failNext = { reports: true };
    const body = await (await GET(url())).json();
    expect(body.ok).toBe(true);
    expect(body.reports).toMatchObject({ ok: false, error: "reports exploded" });
    expect(body.payments.results).toEqual(["night"]);
    expect(body.backups.snapshotted).toBe(1);
    expect(h.runPaymentReminders).toHaveBeenCalledTimes(1);
    expect(h.runNoticeEmails).toHaveBeenCalledTimes(1);
    expect(h.runNoticePushes).toHaveBeenCalledTimes(1);
    expect(h.runGroupSnapshots).toHaveBeenCalledTimes(1);
    expect(h.reportError).toHaveBeenCalledWith(expect.any(Error), "cron-daily/reports");
    /* הרץ שנכשל לא נתבע; השאר כן */
    const claims = h.row.config.cronDailyClaims?.["2026-03-27"];
    expect(claims.reports).toBeUndefined();
    expect(claims.payments).toBeTruthy();
  });

  it("קריסה באמצע + ירי חוזר: רק הרץ שנכשל רץ שוב — אין שליחה כפולה של האחרים", async () => {
    h.failNext = { payments: true };
    await GET(url());
    vi.clearAllMocks();
    const body = await (await GET(url())).json();
    expect(body.payments.results).toEqual(["night"]);
    expect(body.reports).toMatchObject({ skipped: "already claimed" });
    expect(h.runPeriodReports).not.toHaveBeenCalled();
    expect(h.runNoticeEmails).not.toHaveBeenCalled();
    expect(h.runGroupSnapshots).not.toHaveBeenCalled();
    expect(h.runPaymentReminders).toHaveBeenCalledTimes(1);
    /* אחרי השחזור היום נתבע במלואו: ירי שלישי הוא no-op */
    vi.clearAllMocks();
    await GET(url());
    expect(h.runPaymentReminders).not.toHaveBeenCalled();
  });

  it("כשל של רץ הגיבוי לא מפיל את תוצאות שאר הרצים", async () => {
    h.failNext = { backups: true };
    const body = await (await GET(url())).json();
    expect(body.ok).toBe(true);
    expect(body.backups).toMatchObject({ ok: false, error: "backups exploded" });
    expect(body.reports.due).toEqual(["month"]);
  });
});
