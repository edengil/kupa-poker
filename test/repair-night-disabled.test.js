import fs from "fs";
import { describe, it, expect } from "vitest";
import { GET, POST } from "../app/api/repair-night-2026-09-01/route.js";

describe("repair-night route", () => {
  it("does not keep that night's data in the deployed route", () => {
    const src = fs.readFileSync("app/api/repair-night-2026-09-01/route.js", "utf8");
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/apply/);
    expect(src).not.toContain("שגיא גיל");
    expect(src).not.toContain("buyin");
  });

  it("refuses a secret plus apply=1 without writing", async () => {
    const url =
      "https://kupa-poker.vercel.app/api/repair-night-2026-09-01?secret=anything&apply=1";
    for (const res of [await GET(new Request(url)), await POST(new Request(url, { method: "POST" }))]) {
      expect(res.status).toBe(410);
      const body = await res.json();
      expect(body.error).toBe("gone");
    }
  });
});
