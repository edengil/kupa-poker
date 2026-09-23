import { describe, it, expect } from "vitest";
import { buildSettlementInviteText, settlementAppUrl } from "../lib/settlementInvite.js";

describe("settlementInvite", () => {
  it("builds app url", () => {
    expect(settlementAppUrl({ siteUrl: "https://x.com/", slug: "kupa" })).toBe(
      "https://x.com/g/kupa"
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
    expect(text).toContain("https://example.com/g/kupa");
    expect(text).toContain("טיפים הערב");
    expect(text).toContain("סימון");
    expect(text).not.toMatch(/מעביר \d+/);
  });
});
