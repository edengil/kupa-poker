import { describe, it, expect, vi } from "vitest";

/* ============================================================================
   גל 2, פריט 2.1 — open redirect ב־/auth/callback:
   פרמטר next הועבר כמו שהוא להפניה. מעכשיו רק נתיבים פנימיים נקיים
   עוברים (safeNextPath); כל השאר נופל ל־"/".
   ============================================================================ */

import { safeNextPath } from "../lib/safeNext.js";

vi.mock("@/lib/supabaseServer", () => ({
  getServerSupabase: async () => ({
    auth: { exchangeCodeForSession: async () => ({ error: null }) },
  }),
}));

import { GET } from "../app/auth/callback/route.js";

describe("safeNextPath (wave 2.1)", () => {
  it("accepts plain internal paths", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/g/some-slug")).toBe("/g/some-slug");
    expect(safeNextPath("/w/host")).toBe("/w/host");
    expect(safeNextPath("/g/%D7%A7%D7%95%D7%A4%D7%94")).toBe("/g/%D7%A7%D7%95%D7%A4%D7%94");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("//evil.com/path")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("http:evil.com")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects backslash tricks that browsers normalize to //", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("/\\/evil.com")).toBe("/");
  });

  it("rejects encoded slash/backslash right after the leading slash", () => {
    expect(safeNextPath("/%2fevil.com")).toBe("/");
    expect(safeNextPath("/%2Fevil.com")).toBe("/");
    expect(safeNextPath("/%5cevil.com")).toBe("/");
  });

  it("rejects empty, missing and whitespace/control values", () => {
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("/g/a b")).toBe("/");
    expect(safeNextPath("/\tevil")).toBe("/");
  });
});

describe("/auth/callback redirect target (wave 2.1)", () => {
  function req(next) {
    const qs = next == null ? "" : `&next=${encodeURIComponent(next)}`;
    return new Request(`https://kupa-poker.vercel.app/auth/callback?code=abc${qs}`);
  }

  it("redirects to a legitimate internal next", async () => {
    const res = await GET(req("/g/abc"));
    expect(res.headers.get("location")).toBe("https://kupa-poker.vercel.app/g/abc");
  });

  it("falls back to / for an external next", async () => {
    const res = await GET(req("//evil.com"));
    expect(res.headers.get("location")).toBe("https://kupa-poker.vercel.app/");
  });

  it("falls back to / when next is missing", async () => {
    const res = await GET(req(null));
    expect(res.headers.get("location")).toBe("https://kupa-poker.vercel.app/");
  });
});
