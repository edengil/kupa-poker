/* גל 6, פריט 6.2 (ו-29, השאר) — חבילת השגיאות השקטות:

   (2) חותמת "המשחק התחיל" ב־push.js: כשל בכתיבת החותמה (CAS מחזיר
       conflict או זורק) חייב להיות מדווח דרך reportError — לא נבלע.
       הצלחה: בלי דיווח.
   (3) שלושת fetch־י התראות־הבונוס בודקים res.ok ומדווחים לקונסול.
   (1) Rsvp.jsx: הכשל עצמו מכוסה ב־wave5Correctness דרך castRsvpVote
       (write_failed/not_landed/verify_failed) והרכיב מציג alert + באנר —
       כאן נועלים שהרכיב באמת קורא ל־alert על כשל ולא על הצלחה (מעבר
       מקור: הבאנר וה־alert חיים באותו ענף else). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  reportError: vi.fn(async () => {}),
  casResult: { ok: true, updatedAt: "2026-11-09T06:00:00.000Z" },
  casThrows: false,
  subs: [{ id: "s1", endpoint: "https://push.example/1", p256dh: "p", auth: "a" }],
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: vi.fn(async () => ({})),
  },
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: async () => ({ data: h.subs, error: null }),
      }),
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  }),
}));
vi.mock("@/lib/groupCas", () => ({
  updateGroupCas: async () => {
    if (h.casThrows) throw new Error("cas boom");
    return h.casResult;
  },
}));
vi.mock("@/lib/monitor", () => ({ reportError: h.reportError }));

const { notifyGameStart } = await import("../lib/push.js");

beforeEach(() => {
  vi.clearAllMocks();
  h.casResult = { ok: true, updatedAt: "2026-11-09T06:00:00.000Z" };
  h.casThrows = false;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
});

describe("6.2 — חותמת המשחק התחיל (push.js)", () => {
  const row = { id: "g1", config: {} };

  it("חותמה נחתה: נשלח פוש, אין דיווח שגיאה", async () => {
    const res = await notifyGameStart(row, "slug1");
    expect(res.sent).toBe(1);
    expect(h.reportError).not.toHaveBeenCalled();
  });

  it("חותמה נכשלה (conflict): מדווח, לא נבלע", async () => {
    h.casResult = { ok: false, conflict: true };
    const res = await notifyGameStart(row, "slug1");
    expect(res.sent).toBe(1);
    expect(h.reportError).toHaveBeenCalledTimes(1);
    expect(h.reportError.mock.calls[0][1]).toBe("push/game-start-stamp");
  });

  it("חותמה זרקה: מדווח, לא נבלע", async () => {
    h.casThrows = true;
    await notifyGameStart(row, "slug1");
    expect(h.reportError).toHaveBeenCalledTimes(1);
  });
});

describe("6.2 — שלושת fetch־י הבונוס בודקים res.ok (מעבר מקור)", () => {
  const transfers = readFileSync(
    new URL("../lib/poker/notifyTransfersClient.js", import.meta.url),
    "utf8"
  );
  const closed = readFileSync(
    new URL("../lib/announceSettlementClosed.js", import.meta.url),
    "utf8"
  );

  it("notifyTransfersClient: שני ה־fetchים עוברים דרך bonusFetch שבודק res.ok", () => {
    expect(transfers).toContain("if (!res.ok)");
    expect(transfers).toContain("console.warn");
    expect((transfers.match(/bonusFetch\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it("announceSettlementClosed: ה־fetch בודק res.ok ומדווח", () => {
    expect(closed).toContain("if (!res.ok)");
    expect(closed).toContain("console.warn");
  });
});

describe("6.2 — Rsvp.jsx: alert על כשל הצבעה (מעבר מקור)", () => {
  const rsvp = readFileSync(new URL("../components/Rsvp.jsx", import.meta.url), "utf8");

  it("ענף הכשל של vote() מציג alert ובאנר, ומנקה את באנר ההצלחה", () => {
    const elseBranch = rsvp.slice(rsvp.indexOf("} else {"), rsvp.indexOf("setBusy(false)"));
    expect(elseBranch).toContain("setJustVoted(null)");
    expect(elseBranch).toContain("setVoteError(true)");
    expect(elseBranch).toContain('alert("ההצבעה לא נשמרה');
  });
});
