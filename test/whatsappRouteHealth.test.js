import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================================
   נתיב ה־webhook של הוואטסאפ מול כשל/הצלחת שליחה (fix/wa-channel-monitor):
   - כשל שליחת התשובה → שורת wa-send-fail ב־diag_events, ‏botHealth=down
     ב־config, ורשומת waFail גלויה ביומן הפעולות של הלייב — בלי לשבור
     את תשובת הנתיב (הנתונים כבר נשמרו, התשובה היא בונוס).
   - הצלחה → botHealth=up ואין רשומת כשל ביומן.
   ============================================================================ */

const h = vi.hoisted(() => ({
  sendToGroup: vi.fn(async () => ({ ok: true })),
  row: null,
  nextLive: null,
  updates: [],
  diag: [],
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body, init) => ({ body, status: init?.status || 200 }),
  },
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: () => ({
    /* write_group_cas (מיגרציית גל 3ב): ה־patch נרשם כמו update רגיל,
       וחותמת מוחזרת כהצלחה. */
    rpc: async (_fn, args) => {
      h.updates.push(args.p_patch);
      return { data: "2026-10-24T20:00:01.000Z", error: null };
    },
    from(table) {
      if (table === "diag_events") {
        return {
          insert: async (row) => {
            h.diag.push(row);
            return { error: null };
          },
        };
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: h.row, error: null }),
        maybeSingle: async () => ({ data: h.row, error: null }),
        update: (payload) => {
          h.updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      };
      return chain;
    },
  }),
  pingViewers: vi.fn(async () => {}),
}));
vi.mock("@/lib/push", () => ({ notifyGameStart: vi.fn(async () => {}) }));
vi.mock("@/lib/monitor", () => ({ reportError: vi.fn(async () => {}) }));
vi.mock("@/lib/env", () => ({
  envValue: (name) =>
    ({
      WHATSAPP_WEBHOOK_SECRET: "s3cr3t",
      WHAPI_TOKEN: "tok",
      WHAPI_GROUP_ID: "grp@g.us",
      WHATSAPP_OWNER: "972500000000",
      KUPA_GROUP_SLUG: "g1",
    })[name] || "",
  hasEnv: () => true,
  serverSiteUrl: () => "https://x",
}));
vi.mock("@/lib/whatsapp", () => ({
  parseCommands: () => [{ kind: "buyin" }],
  applyCommands: () => ({ live: h.nextLive, reply: "בוצע ✅", ownerDm: null }),
  extractMessage: () => ({ text: "דן +50", chatId: "grp@g.us", id: "m1" }),
  isAllowed: () => true,
  sendToGroup: h.sendToGroup,
  listGroups: vi.fn(async () => ({ groups: [] })),
  BOT_MARK: "🤖",
  setPresenceOffline: vi.fn(async () => ({})),
  maybeRemindPending: () => null,
  maybeRemindBitIdle: () => null,
}));
vi.mock("@/lib/poker/personalHighlights", () => ({ knownPlayerNames: () => [] }));
vi.mock("@/lib/poker/helpers", () => ({ AL: () => ({}), canon: (n) => n }));
vi.mock("@/lib/poker/db", () => ({ normalize: (d) => ({ sessions: [], ...(d || {}) }) }));
vi.mock("@/lib/lastSession", () => ({ latestSession: () => null }));
vi.mock("@/lib/waPins", () => ({
  isNightShareText: () => false,
  nightIsoFromText: () => null,
  jerusalemIso: () => "2026-10-24",
  pinAfterSend: vi.fn(async () => ({})),
  normalizePins: (p) => p || {},
}));

import { POST } from "../app/api/whatsapp/route.js";

function makeReq() {
  return {
    url: "https://x/api/whatsapp?secret=s3cr3t",
    json: async () => ({}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.updates = [];
  h.diag = [];
  h.sendToGroup.mockImplementation(async () => ({ ok: true }));
  const seatEntry = { t: "seat", name: "אבי", amount: 50, id: "a1", at: 1 };
  h.row = {
    id: 7,
    slug: "g1",
    live: { players: [{ name: "אבי" }], actionLog: [seatEntry], applied: {} },
    config: { botOn: true },
    data: { sessions: [] },
  };
  h.nextLive = { players: [{ name: "אבי" }, { name: "דן" }], applied: { m1: true } };
});

describe("whatsapp route — ניטור ערוץ ונפילה מסודרת", () => {
  it("שליחה מצליחה: botHealth נרשם כ־up, אין waFail ביומן", async () => {
    const res = await POST(makeReq());
    expect(res.body).toMatchObject({ ok: true, handled: 1 });
    const healthWrite = h.updates.find((u) => u.config?.botHealth);
    expect(healthWrite).toBeTruthy();
    expect(healthWrite.config.botHealth.lastOkAt).toEqual(expect.any(Number));
    const liveWrites = h.updates.filter((u) => u.live);
    expect(liveWrites.every((u) => !u.live.actionLog?.some((a) => a.t === "waFail"))).toBe(true);
    expect(h.diag).toHaveLength(0);
  });

  it("שליחה נכשלת: diag + botHealth=down + waFail ביומן הפעולות, והנתיב עדיין עונה ok", async () => {
    h.sendToGroup.mockImplementation(async () => {
      throw new Error("Whapi send failed (404): channel not found");
    });
    const res = await POST(makeReq());
    expect(res.body).toMatchObject({ ok: true, handled: 1 });

    /* diag_events */
    expect(h.diag).toHaveLength(1);
    expect(h.diag[0].kind).toBe("wa-send-fail");
    expect(h.diag[0].payload.code).toBe("whapi_not_found");

    /* botHealth ב־config */
    const healthWrite = h.updates.find((u) => u.config?.botHealth);
    expect(healthWrite.config.botHealth.lastFailAt).toEqual(expect.any(Number));
    expect(healthWrite.config.botHealth.lastFailWhere).toBe("whatsapp/reply");
    expect(healthWrite.config.botHealth.fails).toBe(1);

    /* יומן הפעולות של הלייב: הרשומה האחרונה היא כשל גלוי, והקודמות נשמרו */
    const logWrites = h.updates.filter((u) => Array.isArray(u.live?.actionLog));
    expect(logWrites.length).toBeGreaterThan(0);
    const log = logWrites[logWrites.length - 1].live.actionLog;
    expect(log[0].t).toBe("seat");
    expect(log[log.length - 1].t).toBe("waFail");
    expect(log[log.length - 1].error).toContain("404");
  });
});
