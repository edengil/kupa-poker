import { describe, it, expect } from "vitest";
import {
  buildSettlementInviteText,
  settlementAppUrl,
  settlementUpdateMessage,
} from "../lib/settlementInvite.js";

describe("settlementInvite", () => {
  it("builds app url", () => {
    expect(settlementAppUrl({ siteUrl: "https://x.com/", slug: "kupa" })).toBe(
      "https://x.com/g/kupa"
    );
    expect(settlementAppUrl({ siteUrl: "https://x.com/", slug: "kupa", sessionId: "live_1" })).toBe(
      "https://x.com/g/kupa/n/live_1"
    );
  });

  it("invite text has link and no transfer verbs", () => {
    const text = buildSettlementInviteText({
      pot: 500,
      dateLabel: "14.9",
      siteUrl: "https://example.com",
      slug: "kupa",
      tipText: "💸 טיפים הערב\nא · כל הכבוד",
    });
    expect(text).toContain("קופה 500₪");
    expect(text).toContain("החלוקה אושרה");
    expect(text).toContain("https://example.com/g/kupa");
    expect(text).toContain("💸 טיפים הערב");
    expect(text).not.toMatch(/→/);
  });

  it("builds a short settlement update message with the live night link", () => {
    const text = settlementUpdateMessage("https://example.com/g/kupa/n/s1", {
      d: 14,
      mo: 9,
      settlementVersion: 3,
    });
    expect(text).toContain("החלוקה של ערב 14.9 עודכנה · גרסה 3");
    expect(text).toContain("https://example.com/g/kupa/n/s1");
  });
});
