import { describe, it, expect } from "vitest";
import { authorizedCron, authorizedAdmin } from "../lib/cronAuth.js";

function req({ secret, auth, vercelCron } = {}) {
  const url = secret
    ? `https://example.com/api/reports?secret=${encodeURIComponent(secret)}`
    : "https://example.com/api/reports";
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  if (vercelCron) headers.set("x-vercel-cron", "1");
  return new Request(url, { headers });
}

describe("authorizedCron", () => {
  it("accepts webhook secret query", () => {
    process.env.WHATSAPP_WEBHOOK_SECRET = "s3cret";
    delete process.env.CRON_SECRET;
    expect(authorizedCron(req({ secret: "s3cret" }))).toBe(true);
    expect(authorizedCron(req({ secret: "nope" }))).toBe(false);
  });

  it("accepts CRON_SECRET bearer", () => {
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    process.env.CRON_SECRET = "cron";
    expect(authorizedCron(req({ auth: "Bearer cron" }))).toBe(true);
    expect(authorizedCron(req({ auth: "Bearer wrong" }))).toBe(false);
  });

  it("accepts Vercel cron header so daily jobs are not 403", () => {
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    delete process.env.CRON_SECRET;
    expect(authorizedCron(req({ vercelCron: true }))).toBe(true);
    expect(authorizedCron(req({}))).toBe(false);
  });
});

/* גל 4ב (ממצא 23): הפרדת סודות לפי תפקיד + הנפילות המבוקרות. */
describe("authorizedCron — role separation (wave 4b)", () => {
  it("rejects a spoofed x-vercel-cron header once CRON_SECRET is configured", () => {
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    process.env.CRON_SECRET = "cron-secret";
    expect(authorizedCron(req({ vercelCron: true }))).toBe(false);
    expect(authorizedCron(req({ auth: "Bearer cron-secret", vercelCron: true }))).toBe(true);
  });

  it("keeps the header bootstrap only while CRON_SECRET is unset", () => {
    process.env.WHATSAPP_WEBHOOK_SECRET = "webhook-secret";
    delete process.env.CRON_SECRET;
    expect(authorizedCron(req({ vercelCron: true }))).toBe(true);
  });

  it("rejects wrong credentials in every mode", () => {
    process.env.WHATSAPP_WEBHOOK_SECRET = "webhook-secret";
    process.env.CRON_SECRET = "cron-secret";
    expect(authorizedCron(req({ secret: "cron-secret" }))).toBe(false);
    expect(authorizedCron(req({ auth: "Bearer webhook-secret" }))).toBe(false);
    expect(authorizedCron(req({}))).toBe(false);
  });
});

describe("authorizedAdmin — admin gate (wave 4b)", () => {
  function adminReq(secret) {
    const url = secret
      ? `https://example.com/api/health?secret=${secret}`
      : "https://example.com/api/health";
    return new Request(url);
  }

  it("prefers ADMIN_SECRET once configured — the webhook secret no longer opens the gate", () => {
    process.env.ADMIN_SECRET = "admin-secret";
    process.env.WHATSAPP_WEBHOOK_SECRET = "webhook-secret";
    expect(authorizedAdmin(adminReq("admin-secret"))).toBe(true);
    expect(authorizedAdmin(adminReq("webhook-secret"))).toBe(false);
    expect(authorizedAdmin(adminReq("nope"))).toBe(false);
    expect(authorizedAdmin(adminReq(null))).toBe(false);
  });

  it("falls back to the webhook secret while ADMIN_SECRET is not configured", () => {
    delete process.env.ADMIN_SECRET;
    process.env.WHATSAPP_WEBHOOK_SECRET = "webhook-secret";
    expect(authorizedAdmin(adminReq("webhook-secret"))).toBe(true);
    expect(authorizedAdmin(adminReq("nope"))).toBe(false);
  });

  it("never authorizes when no admin-capable secret exists", () => {
    delete process.env.ADMIN_SECRET;
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    expect(authorizedAdmin(adminReq("anything"))).toBe(false);
    expect(authorizedAdmin(adminReq(null))).toBe(false);
  });
});
