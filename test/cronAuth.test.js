import { describe, it, expect } from "vitest";
import { authorizedCron } from "../lib/cronAuth.js";

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
