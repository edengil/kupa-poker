import { afterEach, describe, expect, it, vi } from "vitest";
import { envValue, hasEnv, serverSiteUrl } from "../lib/env.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("server env reader", () => {
  it("returns an empty default without exposing a missing secret", () => {
    delete process.env.WHAPI_TOKEN;
    expect(envValue("WHAPI_TOKEN")).toBe("");
    expect(hasEnv("WHAPI_TOKEN")).toBe(false);
  });

  it("reads a configured value and rejects unknown names", () => {
    process.env.WHAPI_TOKEN = "configured";
    expect(envValue("WHAPI_TOKEN")).toBe("configured");
    expect(hasEnv("WHAPI_TOKEN")).toBe(true);
    expect(() => envValue("NOT_A_REAL_ENV_NAME")).toThrow(TypeError);
  });

  it("keeps the existing site URL fallback order", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "example.vercel.app";
    expect(serverSiteUrl()).toBe("https://example.vercel.app");

    process.env.NEXT_PUBLIC_SITE_URL = "https://poker.example";
    expect(serverSiteUrl()).toBe("https://poker.example");
  });

  it("registers ADMIN_SECRET and drops the never-read legacy anon key name (wave 4b)", () => {
    delete process.env.ADMIN_SECRET;
    expect(envValue("ADMIN_SECRET")).toBe("");
    expect(hasEnv("ADMIN_SECRET")).toBe(false);
    process.env.ADMIN_SECRET = "configured";
    expect(envValue("ADMIN_SECRET")).toBe("configured");
    // ממצא 16: אף נתיב לא קרא את שם ה־anon הישן — הרישום הוסר בגל 4ב
    expect(() => envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY")).toThrow(TypeError);
    expect(envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")).toBe("");
  });
});
