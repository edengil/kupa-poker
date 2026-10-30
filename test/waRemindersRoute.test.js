import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  sendToGroup: vi.fn(async () => ({ ok: true })),
  maybeRemindPending: vi.fn(() => null),
  maybeRemindBitIdle: vi.fn(() => null),
  row: null,
  writes: [],
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body, init) => ({ body, status: init?.status || 200 }),
  },
}));
vi.mock("@/lib/cronAuth", () => ({ authorizedCron: (req) => req.headers.get("x-test-auth") === "1" }));
vi.mock("@/lib/monitor", () => ({ reportError: vi.fn(async () => {}) }));
vi.mock("@/lib/env", () => ({
  envValue: (name) =>
    ({ KUPA_GROUP_SLUG: "g1", WHAPI_TOKEN: "tok", WHATSAPP_OWNER: "972500000000", WHAPI_GROUP_ID: "grp@g.us", WA_REMINDERS_TOKEN: "remind-tok" })[name] || "",
}));
vi.mock("@/lib/whatsapp", () => ({
  sendToGroup: h.sendToGroup,
  maybeRemindPending: h.maybeRemindPending,
  maybeRemindBitIdle: h.maybeRemindBitIdle,
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: () => ({
    /* write_group_cas (מיגרציית גל 3ב): ה־patch נרשם כמו update רגיל. */
    rpc: async (_fn, args) => {
      h.writes.push(args.p_patch);
      return { data: "2026-10-24T20:00:01.000Z", error: null };
    },
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: h.row, error: null }),
        maybeSingle: async () => ({ data: h.row, error: null }),
        update: (payload) => {
          h.writes.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      };
      return chain;
    },
  }),
}));

import { GET } from "../app/api/wa-reminders/route.js";


function makeReq(auth, bearer) {
  const headers = {
    get: (k) => {
      if (k === "x-test-auth") return auth ? "1" : "0";
      if (k === "authorization") return bearer ? `Bearer ${bearer}` : null;
      return null;
    },
  };
  return { url: "https://x/api/wa-reminders", headers };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.writes = [];
  h.row = { id: 7, slug: "g1", live: { players: [{ name: "אבי" }] }, config: { botOn: true } };
  h.maybeRemindPending.mockReturnValue(null);
  h.maybeRemindBitIdle.mockReturnValue(null);
});

describe("wa-reminders route", () => {
  it("בלי הרשאת cron — 403 ושום שליחה", async () => {
    const res = await GET(makeReq(false));
    expect(res.status).toBe(403);
    expect(h.sendToGroup).not.toHaveBeenCalled();
  });

  it("טוקן ייעודי (WA_REMINDERS_TOKEN) מאשר גם בלי cron רגיל", async () => {
    const res = await GET(makeReq(false, "remind-tok"));
    expect(res.status).toBe(200);
    const bad = await GET(makeReq(false, "wrong-tok"));
    expect(bad.status).toBe(403);
  });

  it("בוט כבוי — מדלג", async () => {
    h.row = { ...h.row, config: { botOn: false } };
    const res = await GET(makeReq(true));
    expect(res.body).toMatchObject({ ok: true, skipped: "bot off" });
    expect(h.maybeRemindPending).not.toHaveBeenCalled();
  });

  it("אין תזכורת בשלה — לא כותב ולא שולח", async () => {
    const res = await GET(makeReq(true));
    expect(res.body).toMatchObject({ ok: true, reminded: null });
    expect(h.writes).toHaveLength(0);
    expect(h.sendToGroup).not.toHaveBeenCalled();
  });

  it("תזכורת ממתינים בשלה — שולח קודם, חותם הצלחה אחר כך (גל 3ב)", async () => {
    /* המועמד חותם ב־now שהנתיב מעביר — כמו המימוש האמיתי. */
    h.maybeRemindPending.mockImplementation((_live, now) => ({
      live: { players: [{ name: "אבי" }], pendingRemindedAt: now },
      attemptLive: { players: [{ name: "אבי" }], pendingRemindAttemptAt: now },
      ownerDm: "יש ממתינים",
      reply: null,
    }));
    const res = await GET(makeReq(true));
    expect(res.body).toMatchObject({ ok: true, reminded: "pending" });
    /* כתיבת הלייב נושאת את חותמת ההצלחה; כתיבת ה־config היא של ניטור
       הערוץ (botHealth — השליחה הצליחה, lib/wa/healthServer). */
    const liveWrite = h.writes.find((w) => w.live);
    const healthWrite = h.writes.find((w) => w.config?.botHealth);
    expect(liveWrite.live.players).toEqual([{ name: "אבי" }]);
    expect(liveWrite.live.pendingRemindedAt).toEqual(expect.any(Number));
    expect(liveWrite.live.pendingRemindAttemptAt).toBeUndefined();
    expect(healthWrite?.config?.botHealth).toMatchObject({ fails: 0 });
    expect(healthWrite?.config?.botHealth?.lastOkAt).toEqual(expect.any(Number));
    expect(h.sendToGroup).toHaveBeenCalledTimes(1);
    expect(h.sendToGroup).toHaveBeenCalledWith("יש ממתינים", { token: "tok", groupId: "972500000000" });
  });

  it("שליחת התזכורת נכשלת — נחתמת רק חותמת ניסיון, לא הצלחה (גל 3ב)", async () => {
    h.maybeRemindPending.mockImplementation((_live, now) => ({
      live: { players: [{ name: "אבי" }], pendingRemindedAt: now },
      attemptLive: { players: [{ name: "אבי" }], pendingRemindAttemptAt: now },
      ownerDm: "יש ממתינים",
      reply: null,
    }));
    h.sendToGroup.mockRejectedValueOnce(new Error("whapi down"));
    const res = await GET(makeReq(true));
    expect(res.body).toMatchObject({ ok: true, reminded: "pending", sent: false });
    const liveWrites = h.writes.filter((w) => w.live);
    expect(liveWrites).toHaveLength(1);
    expect(liveWrites[0].live.pendingRemindAttemptAt).toEqual(expect.any(Number));
    expect(liveWrites[0].live.pendingRemindedAt).toBeUndefined();
  });

  it("תזכורת ביט שקט — שולח גם נדנוד לקבוצה", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(999);
    const nextLive = { players: [{ name: "אבי" }], bitIdleRemindedAt: 999 };
    const attemptLive = { players: [{ name: "אבי" }], bitIdleRemindAttemptAt: 999 };
    h.maybeRemindBitIdle.mockReturnValue({ live: nextLive, attemptLive, ownerDm: "שקט פה", reply: "נדנוד" });
    const res = await GET(makeReq(true));
    expect(res.body).toMatchObject({ ok: true, reminded: "bit-idle" });
    expect(h.sendToGroup).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });
});
