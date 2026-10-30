import { beforeEach, describe, expect, it, vi } from "vitest";
import { blank } from "../lib/wa/state";
import { pickLiveMeta } from "../lib/liveMeta.js";

/* ============================================================================
   גל 3 — נעילות פתרון־הקונפליקטים במיזוג (merge/wave3-release):
   שני חצאי הגל נבנו בנפרד ונגעו באותם אזורים. הפתרון מחבר אותם, והבדיקות
   כאן נועלות את החיבור — כל אחת נכשלת על פתרון שחסר את החלק שלה:
   (א) שער המסירה המאוחרת של 3א (ממצא 21) חייב לפעול גם בתוך לולאת
       ה־CAS של 3ב ב־route — כלומר route חייב להעביר msgTs ל־applyCommands.
   (ב) blank של 3א (spread — ממצא 5) חייב לכבד את סמנטיקת חותמות־הניסיון
       של 3ב (ממצא 10): מפתח חסר = לא נוסה; null מפורש נמחק, חותמת
       אמיתית עוברת.
   (ג) pickLiveMeta של 3א חייב לשאת גם את חותמות־הניסיון של 3ב, אחרת
       שמירת אפליקציה מוחקת אותן והבוט מנסה תזכורת שוב על ערוץ פג.
   ============================================================================ */

const T0 = 1_700_000_000_000;

/* ------------------------------- (ב) blank ------------------------------- */

describe("מיזוג גל 3 — blank: חותמות־ניסיון בסמנטיקת 3ב על גוף ה־spread של 3א", () => {
  it("חותמת־ניסיון אמיתית עוברת כמו שהיא", () => {
    const out = blank({ pendingRemindAttemptAt: T0 + 1, bitIdleRemindAttemptAt: T0 + 2 });
    expect(out.pendingRemindAttemptAt).toBe(T0 + 1);
    expect(out.bitIdleRemindAttemptAt).toBe(T0 + 2);
  });

  it("null מפורש — המפתח מושמט לגמרי, לא נשאר null", () => {
    const out = blank({ pendingRemindAttemptAt: null, bitIdleRemindAttemptAt: null });
    expect("pendingRemindAttemptAt" in out).toBe(false);
    expect("bitIdleRemindAttemptAt" in out).toBe(false);
  });

  it("מעורב: חותמת אמיתית נשמרת ו־null מושמט, כל מפתח בנפרד", () => {
    const out = blank({ pendingRemindAttemptAt: T0 + 3, bitIdleRemindAttemptAt: null });
    expect(out.pendingRemindAttemptAt).toBe(T0 + 3);
    expect("bitIdleRemindAttemptAt" in out).toBe(false);
  });

  it("בלי חותמות בכלל — המפתחות לא מומצאים", () => {
    const out = blank({});
    expect("pendingRemindAttemptAt" in out).toBe(false);
    expect("bitIdleRemindAttemptAt" in out).toBe(false);
  });
});

/* ---------------------------- (ג) pickLiveMeta ---------------------------- */

describe("מיזוג גל 3 — pickLiveMeta שומר את חותמות־הניסיון של הבוט (3ב)", () => {
  it("שתי חותמות־הניסיון עוברות בשמירת אפליקציה, לצד חותמות ההצלחה", () => {
    const meta = pickLiveMeta({
      applied: { m1: [] },
      pendingRemindedAt: T0 + 111,
      bitIdleRemindedAt: T0 + 222,
      pendingRemindAttemptAt: T0 + 333,
      bitIdleRemindAttemptAt: T0 + 444,
    });
    expect(meta.pendingRemindAttemptAt).toBe(T0 + 333);
    expect(meta.bitIdleRemindAttemptAt).toBe(T0 + 444);
    expect(meta.pendingRemindedAt).toBe(T0 + 111);
    expect(meta.bitIdleRemindedAt).toBe(T0 + 222);
  });

  it("בלי חותמות־ניסיון — המפתחות לא מומצאים", () => {
    const meta = pickLiveMeta({ applied: {} });
    expect("pendingRemindAttemptAt" in meta).toBe(false);
    expect("bitIdleRemindAttemptAt" in meta).toBe(false);
  });
});

/* --------------------- (א) שער מסירה מאוחרת דרך ה־route --------------------- */

const h = vi.hoisted(() => ({
  sendToGroup: vi.fn(async () => ({ message: { id: "sent-1" } })),
  setPresenceOffline: vi.fn(async () => ({ ok: true })),
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

vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: () => ({
    /* write_group_cas (מיגרציית גל 3ב): ה־patch נרשם כמו update רגיל,
       וחותמת חדשה מוחזרת כהצלחה — בלי התנגשויות בבדיקות האלה. */
    rpc: async (_fn, args) => {
      h.writes.push(args.p_patch);
      return { data: "2023-11-14T22:00:01.000Z", error: null };
    },
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

const { POST } = await import("../app/api/whatsapp/route.js");

const ENDED = T0; // סוף הערב השמור האחרון

function closedNightRow() {
  return {
    id: "group-1",
    slug: "kupa",
    config: { botOn: true, pins: {} },
    data: {
      sessions: [{ id: "s-old", iso: "2023-11-14", endedAt: ENDED, entries: [] }],
      roster: ["קובי סעדה"],
      aliases: {},
    },
    live: null,
    updated_at: "2023-11-14T21:00:00.000Z",
  };
}

const WEBHOOK_SECRET = "s3cret";

function webhookRequest(text, tsSec, id = "msg-1") {
  return new Request(`https://kupa-poker.vercel.app/api/whatsapp?secret=${WEBHOOK_SECRET}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          id,
          chat_id: "1203630199@g.us",
          from: "972501111111",
          text: { body: text },
          timestamp: tsSec,
        },
      ],
    }),
  });
}

describe("מיזוג גל 3 — שער המסירה המאוחרת פועל דרך נתיב ה־CAS ב־route (ממצא 21 × ממצא 9)", () => {
  beforeEach(() => {
    h.sendToGroup.mockClear();
    h.setPresenceOffline.mockClear();
    h.writes.length = 0;
    h.row = closedNightRow();
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

  it("הודעה זקנה מערב שנסגר ונשמר: נבלעת — אין לייב רפאים ואין כתיבת לייב בכלל", async () => {
    // חותמת ההודעה: חצי שעה לפני סוף הערב השמור — מעבר לסובלנות הדקה.
    // "קובי נכנס 50" היא צורת פתיחת־הערב בייצור (פועל מפורש): בלי השער
    // היא הייתה מושיבה את קובי בלייב רפאים.
    const res = await POST(webhookRequest("קובי נכנס 50", (ENDED - 1800_000) / 1000, "late-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, skipped: "nothing to do" });
    // אף כתיבה לא נשאה לייב — לולאת ה־CAS אפילו לא ניסתה לכתוב.
    expect(h.writes.filter((w) => w.live)).toHaveLength(0);
    expect(h.sendToGroup).not.toHaveBeenCalled();
  });

  it("הודעה טרייה אחרי סוף הערב השמור: פותחת ערב חדש — כתיבת הלייב עוברת דרך ה־CAS", async () => {
    const res = await POST(webhookRequest("קובי נכנס 50", (ENDED + 3600_000) / 1000, "fresh-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handled).toBe(1);
    const liveWrites = h.writes.filter((w) => w.live);
    expect(liveWrites.length).toBeGreaterThanOrEqual(1);
    const written = liveWrites[liveWrites.length - 1].live;
    expect(written.players).toHaveLength(1);
    expect(written.players[0].name).toBe("קובי סעדה");
    expect(written.players[0].buyin).toBe(50);
    expect(h.sendToGroup).toHaveBeenCalledTimes(1);
  });
});
