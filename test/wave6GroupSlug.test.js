/* גל 6, פריט 6.1 (ו-31) — סיבוב slug לא משתיק את הבוט.

   שלוש שכבות של בדיקות:
   א. פותר ה־slug הטהור: שורה שנמצאה לפי עוגן היסטורי (config.prevSlugs)
      מחזירה את ה־slug הנוכחי שלה; בלי שום עוגן — ה־env בלבד, התנהגות
      טרום־הגל בדיוק.
   ב. הפותר מול מסד מזויף: שאילתת ה־OR מוצאת את השורה גם לפי ה־slug
      הנוכחי וגם לפי עוגן prevSlugs, בדיוק כמו שהסיבוב רושם.
   ג. הצרכנים מקצה לקצה מול השורה המסובבת — ארבעת הרצים. שני נתיבי
      ה־API מכוסים דרך המוקים הקיימים שלהם (waRemindersRoute,
      whatsappRouteHealth), שמחזירים שורה לשאילתת הפותר בשקיפות, והנתיב
      בפועל עובר דרך אותו resolveEffectiveSlug. */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { effectiveSlugFromRows, resolveEffectiveSlug } from "../lib/groupSlug.js";

const envOf = (slug) => (name) => (name === "KUPA_GROUP_SLUG" ? slug : "");

/* ---------- א. הפותר הטהור ---------- */
describe("effectiveSlugFromRows (טהור)", () => {
  it("שורה חיה לפי ה־slug שבסביבה: ה־slug שלה (גם עם prevSlugs)", () => {
    const rows = [{ slug: "kupa", config: { prevSlugs: ["older"] } }];
    expect(effectiveSlugFromRows(rows, "kupa")).toBe("kupa");
  });

  it("אחרי סיבוב: ה־env הוא עוגן ב־prevSlugs — ה־slug הנוכחי מנצח", () => {
    const rows = [{ slug: "rotated", config: { prevSlugs: ["origin", "mid"] } }];
    expect(effectiveSlugFromRows(rows, "origin")).toBe("rotated");
    expect(effectiveSlugFromRows(rows, "mid")).toBe("rotated");
  });

  it("env בלבד, בלי שום עוגן: ה־slug שבסביבה כמות שהוא", () => {
    expect(effectiveSlugFromRows([{ slug: "kupa", config: {} }], "kupa")).toBe("kupa");
    expect(effectiveSlugFromRows([], "kupa")).toBe("kupa");
    expect(effectiveSlugFromRows(null, "kupa")).toBe("kupa");
    expect(effectiveSlugFromRows([{ slug: "other", config: { prevSlugs: ["x"] } }], "kupa")).toBe("kupa");
  });

  it("prevSlugs שאינו מערך לא נחשב עוגן", () => {
    const rows = [{ slug: "rotated", config: { prevSlugs: "origin" } }];
    expect(effectiveSlugFromRows(rows, "origin")).toBe("origin");
  });
});

/* ---------- ב. הפותר מול מסד מזויף ---------- */
function fakeAdmin(rows, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    from() {
      const chain = {
        select: () => chain,
        or: (expr) => {
          calls.push(expr);
          return Promise.resolve(
            fail ? { data: null, error: { message: "db down" } } : { data: rows, error: null }
          );
        },
      };
      return chain;
    },
  };
}

describe("resolveEffectiveSlug (מול מסד מזויף)", () => {
  it("סיבוב מדומה: השורה נמצאת דרך עוגן prevSlugs, הפתרון = ה־slug החדש", async () => {
    /* אחרי סיבוב: slug=rotated, prevSlugs מכיל את origin (ה־slug היוצא).
       ה־env עדיין origin — השאילתה תופסת את השורה דרך העוגן. */
    const admin = fakeAdmin([{ slug: "rotated", config: { prevSlugs: ["origin"] } }]);
    const out = await resolveEffectiveSlug(admin, envOf("origin"));
    expect(out).toBe("rotated");
    expect(admin.calls[0]).toContain("slug.eq.origin");
    expect(admin.calls[0]).toContain('config->prevSlugs.cs.["origin"]');
  });

  it("שני סיבובים ברצף: גם העוגן הישן ביותר עדיין פותר", async () => {
    const admin = fakeAdmin([{ slug: "third", config: { prevSlugs: ["first", "second"] } }]);
    await expect(resolveEffectiveSlug(admin, envOf("first"))).resolves.toBe("third");
    await expect(resolveEffectiveSlug(admin, envOf("second"))).resolves.toBe("third");
  });

  it("כשל מסד: נופל חזרה ל־slug שבסביבה, לא זורק", async () => {
    const admin = fakeAdmin([], { fail: true });
    await expect(resolveEffectiveSlug(admin, envOf("kupa"))).resolves.toBe("kupa");
  });

  it("בלי slug בסביבה: מחרוזת ריקה בלי שאילתה", async () => {
    const admin = fakeAdmin([]);
    await expect(resolveEffectiveSlug(admin, envOf(""))).resolves.toBe("");
    expect(admin.calls).toHaveLength(0);
  });
});

/* ---------- ג. הצרכנים מקצה לקצה ---------- */
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
  lastGroupQuery: null,
}));

/* לקוח מזויף מודע־slug: eq("slug", X) מוצא את השורה רק אם X הוא ה־slug
   הנוכחי שלה — כמו במסד אמיתי אחרי סיבוב. שאילתת ה־OR של הפותר מסוננת
   לפי אותם כללים (slug נוכחי או עוגן ב־config.prevSlugs). */
function fakeSupabase() {
  return {
    from(table) {
      const chain = {
        _slugEq: null,
        select() {
          return chain;
        },
        eq(col, val) {
          if (table === "groups" && col === "slug") chain._slugEq = val;
          return chain;
        },
        or(expr) {
          if (table === "groups") {
            h.lastGroupQuery = expr;
            const m = /slug\.eq\.([^,]+)/.exec(expr);
            const envSlug = m?.[1];
            const hit =
              h.row &&
              (h.row.slug === envSlug ||
                (Array.isArray(h.row.config?.prevSlugs) &&
                  h.row.config.prevSlugs.includes(envSlug)))
                ? [h.row]
                : [];
            return Promise.resolve({ data: hit, error: null });
          }
          return Promise.resolve({ data: [], error: null });
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
            if (h.row && chain._slugEq != null && h.row.slug !== chain._slugEq) {
              return { data: null, error: { message: "no rows" } };
            }
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
    return { ok: true, updatedAt: "2026-11-09T06:00:00.000Z" };
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

const T0 = Date.parse("2026-10-30T20:00:00.000Z");

function openNight() {
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

/* שורה אחרי סיבוב: ה־slug הנוכחי "rotated", ובקונפיג prevSlugs מכיל את
   ה־slug היוצא ("origin") — בדיוק מה שהסיבוב ב־ShareBar כותב. ה־env
   עדיין מצביע על "origin", והצרכנים חייבים למצוא את השורה דרך העוגן. */
function groupRow(slug, config = {}) {
  return {
    id: "group-1",
    slug,
    data: { sessions: [openNight()], roster: ["קובי סעדה", "אופיר סנה"], aliases: {} },
    config,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.views = [];
  h.subscriptions = [];
  h.casPatches = [];
  h.casOk = true;
  h.lastGroupQuery = null;
  process.env.KUPA_GROUP_SLUG = "origin";
  process.env.WHAPI_TOKEN = "tok";
  process.env.WHAPI_GROUP_ID = "120363@g.us";
  process.env.NEXT_PUBLIC_SITE_URL = "https://kupa-poker.vercel.app";
});

describe("גל 6.1 — הצרכנים אחרי סיבוב (ה־env הוא עוגן ב־prevSlugs)", () => {
  beforeEach(() => {
    /* השורה סובבה מ־"origin" ל־"rotated"; הסיבוב שמר את היוצא בעוגנים. */
    h.row = groupRow("rotated", { prevSlugs: ["origin"] });
  });

  it("runPaymentReminders מוצא את הקבוצה המסובבת ושולח", async () => {
    const out = await runPaymentReminders({ force: true });
    expect(out.ok).toBe(true);
    expect(h.sendToGroup).toHaveBeenCalledTimes(1);
  });

  it("runPeriodReports מוצא את הקבוצה המסובבת ושולח דוח", async () => {
    /* ערב מהחודש הקודם (כמו בבדיקת הרץ הקיימת) כדי שדוח חודשי יהיה בשל. */
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const night = {
      ...openNight(),
      id: "night-prev",
      iso: prev.toISOString().slice(0, 10),
      d: 15,
      mo: prev.getMonth() + 1,
      y: prev.getFullYear(),
    };
    h.row = { ...h.row, data: { sessions: [night], roster: [], aliases: {} } };
    const out = await runPeriodReports();
    expect(out.ok).toBe(true);
    expect(h.sendToGroup).toHaveBeenCalled();
  });

  it("runNoticeEmails מוצא את הקבוצה המסובבת (רושם firstSeen, בלי כשל)", async () => {
    const out = await runNoticeEmails({ now: new Date(T0) });
    expect(out.ok).toBe(true);
  });

  it("runNoticePushes מוצא את הקבוצה המסובבת", async () => {
    const out = await runNoticePushes({ now: new Date(T0) });
    expect(out.ok).toBe(true);
  });
});

describe("גל 6.1 — env בלבד, בלי שום override (התנהגות טרום־הגל)", () => {
  beforeEach(() => {
    h.row = groupRow("origin", {});
  });

  it("runPaymentReminders עובד כרגיל", async () => {
    const out = await runPaymentReminders({ force: true });
    expect(out.ok).toBe(true);
    expect(h.sendToGroup).toHaveBeenCalledTimes(1);
  });

  it("runNoticeEmails עובד כרגיל", async () => {
    const out = await runNoticeEmails({ now: new Date(T0) });
    expect(out.ok).toBe(true);
  });
});
