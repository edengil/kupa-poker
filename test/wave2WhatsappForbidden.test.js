/**
 * גל 2, פריט 2.4 — תגובת ה־403 של /api/whatsapp לא דולפת מידע אבחוני:
 * לא את אורך הסוד הצפוי, לא את אורך הניחוש, לא אילו משתני סביבה קיימים.
 * (בעבר why() החזיר expectedLength/receivedLength — מד־אורך לניחוש הסוד.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: vi.fn(() => null),
  pingViewers: vi.fn(async () => {}),
}));
vi.mock("@/lib/whatsapp", () => ({
  parseCommands: vi.fn(() => []),
  applyCommands: vi.fn(async () => ({ replies: [], newLive: null })),
  extractMessage: vi.fn(() => null),
  isAllowed: vi.fn(() => false),
  sendToGroup: vi.fn(async () => {}),
  listGroups: vi.fn(async () => ({ groups: [] })),
  BOT_MARK: "🤖",
  setPresenceOffline: vi.fn(async () => {}),
  maybeRemindPending: vi.fn(async () => {}),
  maybeRemindBitIdle: vi.fn(async () => {}),
}));
vi.mock("@/lib/waPins", () => ({
  isNightShareText: vi.fn(() => false),
  nightIsoFromText: vi.fn(() => null),
  jerusalemIso: vi.fn(() => new Date().toISOString()),
  pinAfterSend: vi.fn(async () => {}),
  normalizePins: vi.fn((x) => x),
}));

const { GET } = await import("../app/api/whatsapp/route.js");

const SECRET = "wa-webhook-secret-for-tests";

beforeEach(() => {
  process.env.WHATSAPP_WEBHOOK_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.WHATSAPP_WEBHOOK_SECRET;
});

describe("GET /api/whatsapp forbidden response (wave 2.4)", () => {
  it("returns a generic 403 with no secret-length oracle when the token is missing", async () => {
    const res = await GET(new Request("https://kupa-poker.vercel.app/api/whatsapp"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "forbidden" });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("expectedLength");
    expect(raw).not.toContain("receivedLength");
    expect(raw).not.toContain("configured");
    expect(raw).not.toContain(String(SECRET.length));
  });

  it("returns the same generic 403 for a wrong token (no length hint)", async () => {
    const res = await GET(
      new Request("https://kupa-poker.vercel.app/api/whatsapp?secret=" + "x".repeat(SECRET.length))
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "forbidden" });
  });
});
