import { describe, it, expect } from "vitest";

/* ============================================================================
   גל 2, פריט 2.2 — בלוק כותרות האבטחה ב־next.config:
   CSP במצב Report-Only בלבד (אכיפה רק אחרי עשן חי של כל המסכים —
   כלל התוכנית), X-Frame-Options, nosniff, ו־Referrer-Policy שלא
   דולף את ה־slug. הבדיקה נועלת גם את ההחלטה: אין כותרת CSP אוכפת.
   ============================================================================ */

import nextConfig from "../next.config.mjs";

async function headerMap() {
  const rules = await nextConfig.headers();
  expect(rules).toHaveLength(1);
  expect(rules[0].source).toBe("/:path*");
  return new Map(rules[0].headers.map((h) => [h.key, h.value]));
}

describe("security headers block (wave 2.2)", () => {
  it("serves the anti-framing, nosniff and referrer headers", async () => {
    const m = await headerMap();
    expect(m.get("X-Frame-Options")).toBe("DENY");
    expect(m.get("X-Content-Type-Options")).toBe("nosniff");
    // same-origin: שום Referer לא יוצא החוצה — ה־slug שבנתיב לא דולף
    expect(m.get("Referrer-Policy")).toBe("same-origin");
  });

  it("ships CSP as report-only (not enforcing) per the plan rule", async () => {
    const m = await headerMap();
    expect(m.has("Content-Security-Policy")).toBe(false);
    const csp = m.get("Content-Security-Policy-Report-Only");
    expect(typeof csp).toBe("string");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("CSP allows the resources the app actually loads", async () => {
    const m = await headerMap();
    const csp = m.get("Content-Security-Policy-Report-Only");
    // חיבורי Supabase (REST + realtime) ואנליטיקס
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");
    expect(csp).toContain("https://*.amplitude.com");
    // סקריפטים/סטיילים מוטמעים של Next + תמונות data:/blob: + פונטים עצמיים
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("worker-src 'self'");
  });
});
