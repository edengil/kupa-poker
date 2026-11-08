import { describe, it, expect, vi } from "vitest";

/* ============================================================================
   גל 2, פריט 2.1 — Reflected XSS ב־/api/calendar/callback:
   פרמטר error מהבקשה הוזרק גולמי לדף ה־HTML. רגרסיה: מטען XSS חייב
   לחזור מקודד, וקוד שגיאה לגיטימי של גוגל חייב להישאר קריא.
   ============================================================================ */

vi.mock("@/lib/supabaseAdmin", () => ({ getAdminSupabase: () => ({}) }));
vi.mock("@/lib/monitor", () => ({ reportError: vi.fn(async () => {}) }));

import { GET } from "../app/api/calendar/callback/route.js";

function reqWithError(error) {
  const qs = error == null ? "" : `?error=${encodeURIComponent(error)}`;
  return new Request(`https://kupa-poker.vercel.app/api/calendar/callback${qs}`);
}

describe("calendar callback — error param escaping (wave 2.1)", () => {
  it("escapes a <script> payload instead of reflecting it raw", async () => {
    const res = await GET(reqWithError("<script>alert(1)</script>"));
    const body = await res.text();
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes an attribute-breaking svg payload", async () => {
    const res = await GET(reqWithError('"><svg onload=alert(1)>'));
    const body = await res.text();
    expect(body).not.toContain('"><svg onload=alert(1)>');
    expect(body).toContain("&quot;&gt;&lt;svg onload=alert(1)&gt;");
  });

  it("keeps a legitimate Google error code readable", async () => {
    const res = await GET(reqWithError("access_denied"));
    const body = await res.text();
    expect(body).toContain("access_denied");
    expect(body).toContain("החיבור נכשל");
  });

  it("falls back to no_code when neither code nor error is present", async () => {
    const res = await GET(reqWithError(null));
    const body = await res.text();
    expect(body).toContain("no_code");
  });
});
