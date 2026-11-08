import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================================
   גל 2, פריט 2.3 — הקשחת POST /api/diag (ממצא F9/F10):
   עד הגל הנתיב היה פתוח לגמרי. רגרסיות:
   - אנונימי בלי מזהה־לקוח ובלי סוד ניהול → 403, שום שורה לא נכתבת.
   - לקוח האפליקציה (cid) → נכתב, במסלול מצומצם (בלי השדות החופשיים).
   - מנהל (סוד הניהול הקיים) → נכתב מלא, בלי צורך ב־cid.
   - גוף מעל התקרה → 413. הצפת IP אחד → 429, ו־IP אחר לא נפגע.
   ============================================================================ */

const h = vi.hoisted(() => ({ inserts: [] }));

vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminSupabase: () => ({
    from: () => ({
      insert: async (row) => {
        h.inserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

import { POST } from "../app/api/diag/route.js";
import {
  DIAG_IP_MAX_PER_WINDOW,
  DIAG_DAILY_CAP,
  diagRateCheck,
  resetDiagRateState,
  sanitizeDiagEntry,
} from "../lib/diagGuard.js";

const CID = "test-client-1234";
const ADMIN = "adm1n-test-secret";

function makeReq({ body = "", headers = {}, url = "https://kupa-poker.vercel.app/api/diag" } = {}) {
  return {
    url,
    headers: new Headers(headers),
    text: async () => body,
  };
}

function clientReq(payload, headers = {}) {
  return makeReq({ body: JSON.stringify({ cid: CID, ...payload }), headers });
}

beforeEach(() => {
  h.inserts.length = 0;
  resetDiagRateState();
  process.env.ADMIN_SECRET = ADMIN;
  delete process.env.WHATSAPP_WEBHOOK_SECRET;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/diag — identification (wave 2.3)", () => {
  it("rejects an anonymous POST without client id or admin secret (403, nothing written)", async () => {
    const res = await POST(makeReq({ body: JSON.stringify({ kind: "error", message: "fake" }) }));
    expect(res.status).toBe(403);
    expect(h.inserts).toHaveLength(0);
  });

  it("rejects a malformed client id", async () => {
    const res = await POST(makeReq({ body: JSON.stringify({ cid: "x", kind: "error" }) }));
    expect(res.status).toBe(403);
    expect(h.inserts).toHaveLength(0);
  });

  it("rejects a non-JSON body on the client path (400)", async () => {
    const res = await POST(makeReq({ body: "not json at all" }));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });

  it("rejects a kind outside the app vocabulary on the client path (400)", async () => {
    const res = await POST(clientReq({ kind: "BAD KIND!!", message: "x" }));
    expect(res.status).toBe(400);
    expect(h.inserts).toHaveLength(0);
  });
});

describe("POST /api/diag — legitimate writes (wave 2.3)", () => {
  it("writes an app client report on the narrowed path (free fields dropped)", async () => {
    const res = await POST(
      clientReq({
        kind: "error",
        message: "boom",
        stack: "stack-trace",
        componentStack: "FREE-FIELD",
        detail: "FREE-DETAIL",
        url: "https://kupa-poker.vercel.app/g/abc",
        ua: "test-agent",
        phase: 3,
      })
    );
    expect(res.status).toBe(204);
    expect(h.inserts).toHaveLength(1);
    const row = h.inserts[0];
    expect(row.kind).toBe("error");
    expect(row.stack).toBe("stack-trace");
    expect(row.phase).toBe(3);
    expect(row.payload.componentStack).toBe("");
    expect(row.payload.detail).toBe("");
    expect(JSON.stringify(row)).not.toContain("FREE-FIELD");
    expect(JSON.stringify(row)).not.toContain("FREE-DETAIL");
  });

  it("writes a full admin report without a client id (query secret)", async () => {
    const res = await POST(
      makeReq({
        url: "https://kupa-poker.vercel.app/api/diag?secret=" + ADMIN,
        body: JSON.stringify({ kind: "error", message: "m", stack: "s", componentStack: "CS", detail: "D" }),
      })
    );
    expect(res.status).toBe(204);
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].payload.componentStack).toBe("CS");
    expect(h.inserts[0].payload.detail).toBe("D");
  });

  it("accepts the admin secret as a Bearer header too", async () => {
    const res = await POST(
      makeReq({
        headers: { authorization: `Bearer ${ADMIN}` },
        body: JSON.stringify({ kind: "error", message: "m" }),
      })
    );
    expect(res.status).toBe(204);
    expect(h.inserts).toHaveLength(1);
  });

  it("rejects a wrong admin secret when no client id is present", async () => {
    const res = await POST(
      makeReq({
        url: "https://kupa-poker.vercel.app/api/diag?secret=" + "nope",
        body: JSON.stringify({ kind: "error", message: "m" }),
      })
    );
    expect(res.status).toBe(403);
    expect(h.inserts).toHaveLength(0);
  });
});

describe("POST /api/diag — size and rate limits (wave 2.3)", () => {
  it("rejects a body whose declared size is over the cap (413)", async () => {
    const res = await POST(clientReq({ kind: "error" }, { "content-length": "9000" }));
    expect(res.status).toBe(413);
    expect(h.inserts).toHaveLength(0);
  });

  it("rejects a body that is actually over the cap even without a declared size (413)", async () => {
    const res = await POST(clientReq({ kind: "error", message: "x".repeat(9000) }));
    expect(res.status).toBe(413);
    expect(h.inserts).toHaveLength(0);
  });

  it("cuts a flood from one IP at the window cap (429) and spares other IPs", async () => {
    const ip = { "x-forwarded-for": "9.9.9.9" };
    for (let i = 0; i < DIAG_IP_MAX_PER_WINDOW; i++) {
      const res = await POST(clientReq({ kind: "error", message: `flood ${i}` }, ip));
      expect(res.status).toBe(204);
    }
    const blocked = await POST(clientReq({ kind: "error", message: "one too many" }, ip));
    expect(blocked.status).toBe(429);
    expect(h.inserts).toHaveLength(DIAG_IP_MAX_PER_WINDOW);

    const other = await POST(
      clientReq({ kind: "error", message: "legit" }, { "x-forwarded-for": "8.8.8.8" })
    );
    expect(other.status).toBe(204);
  });
});

describe("diagGuard units (wave 2.3)", () => {
  it("sanitizeDiagEntry caps client fields tighter than admin fields", () => {
    const long = { kind: "error", message: "m".repeat(1500), stack: "s".repeat(3000) };
    const client = sanitizeDiagEntry(long, { admin: false });
    expect(client.message).toHaveLength(500);
    expect(client.stack).toHaveLength(1000);
    const admin = sanitizeDiagEntry(long, { admin: true });
    expect(admin.message).toHaveLength(1000);
    expect(admin.stack).toHaveLength(2048);
  });

  it("diagRateCheck enforces the daily cap across IPs", () => {
    const now = Date.parse("2026-11-08T10:00:00Z");
    for (let i = 0; i < DIAG_DAILY_CAP; i++) {
      const req = makeReq({ headers: { "x-forwarded-for": `10.0.${Math.floor(i / 250)}.${i % 250}` } });
      expect(diagRateCheck(req, now)).toBe(true);
    }
    const req = makeReq({ headers: { "x-forwarded-for": "203.0.113.1" } });
    expect(diagRateCheck(req, now)).toBe(false);
  });
});
