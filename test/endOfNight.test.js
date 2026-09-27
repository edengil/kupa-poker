import { describe, it, expect } from "vitest";
import { applyCommands, BOT_MARK } from "../lib/whatsapp.js";
import { buildReport, settleLine, nightDateParts } from "../lib/report.js";
import { nightSummaryText, sessionFromLive } from "../lib/nightShare.js";
import { settlementAppUrl, settlementLinkMessage, withSettlementLink } from "../lib/settlementInvite.js";
import { isNightShareText } from "../lib/waPins.js";
import {
  sessionsDueForPaymentReminder,
  buildPaymentReminderText,
} from "../lib/paymentReminder.js";
import { NIGHT_26_9, liveBeforeLastCashout } from "./fixtures/night-2026-09-26.js";

describe("end of night — the group gets the upgraded summary, once", () => {
  it("the last cashout outside guided closing is a short ACK, not the old bit report", () => {
    const { live, reply } = applyCommands(
      liveBeforeLastCashout(),
      [{ kind: "cashout", name: "נתנאל", chips: 0, siteUrl: "https://kupa.test", slug: "g1" }],
      "m-last",
      2,
      { now: NIGHT_26_9.endedAt }
    );
    expect(reply).toContain("נתנאל כהן יצא עם 0 ג'יטונים · נתנאל כהן חייב 200₪");
    expect(reply).toContain("כולם סגורים · קופה 1125₪");
    expect(reply).not.toContain("כניסות מתוכם");
    expect(reply).not.toContain("27/09/2026");
    expect(reply).not.toContain("אורן גיל חייב ");
    expect(isNightShareText(reply)).toBe(false);
    expect(live.closing).toBe(false);
    expect(live.players.every((p) => p.cashout !== "")).toBe(true);
  });

  it("writes female forms for אורן in bot replies", () => {
    const start = {
      players: [
        { name: "אורן גיל", buyin: 250, cashout: "" },
        { name: "עדן גיל", buyin: 50, cashout: "" },
      ],
      applied: {},
    };
    const { reply } = applyCommands(start, [{ kind: "cashout", name: "אורן", chips: 180 }], "m-oren");
    expect(reply).toContain("אורן גיל יצאה עם 180 ג'יטונים · אורן גיל חייבת 160₪");
    expect(settleLine({ name: "אורן גיל", buyin: 50, cashout: "200" })).toBe("אורן גיל מגיעה 50₪");
    expect(settleLine({ name: "אורן גיל", buyin: 50, cashout: "100" })).toBe("אורן גיל סגרה באפס");
    expect(settleLine({ name: "נתנאל כהן", buyin: 200, cashout: "0" })).toBe("נתנאל כהן חייב 200₪");
  });

  it("dates the report by the Jerusalem start day even after midnight", () => {
    const text = buildReport({
      players: [{ name: "דן ינקלויץ", buyin: 100, cashout: "" }],
      startedAt: NIGHT_26_9.startedAt,
      now: NIGHT_26_9.endedAt,
    });
    expect(text.startsWith("26/09/2026")).toBe(true);
    expect(nightDateParts(NIGHT_26_9.startedAt, NIGHT_26_9.endedAt)).toEqual({
      d: 26,
      mo: 9,
      y: 2026,
      iso: "2026-09-26",
    });
  });

  it("the bot's live summary equals the app's saved-night preview", () => {
    const closed = liveBeforeLastCashout();
    closed.players = closed.players.map((p) => (p.cashout === "" ? { ...p, cashout: "0" } : p));
    const fromLive = sessionFromLive(closed, { cps: 2, now: NIGHT_26_9.endedAt });
    expect(fromLive).toMatchObject({ iso: "2026-09-26", d: 26, mo: 9, y: 2026 });
    expect(nightSummaryText(fromLive)).toBe(nightSummaryText(NIGHT_26_9));
  });

  it("the preview does not change between opening the sheet and pressing send", () => {
    const realNow = Date.now;
    try {
      Date.now = () => NIGHT_26_9.endedAt + 60_000;
      const first = nightSummaryText(NIGHT_26_9);
      Date.now = () => NIGHT_26_9.endedAt + 7 * 60_000;
      expect(nightSummaryText(NIGHT_26_9)).toBe(first);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("end of night — night link with the summary", () => {
  const url = settlementAppUrl({ siteUrl: "https://kupa.test", slug: "g1", sessionId: NIGHT_26_9.id });

  it("one message: full summary, then the night page link", () => {
    const text = withSettlementLink(nightSummaryText(NIGHT_26_9), url);
    expect(text.startsWith(`${BOT_MARK} סיכום פוקר 26.9`)).toBe(true);
    expect(text.startsWith(`${BOT_MARK} ${BOT_MARK}`)).toBe(false);
    expect(text).toContain("אורן גיל חייבת 160");
    expect(text).toContain("💸 טיפים הערב");
    expect(text).toContain("https://kupa.test/g/g1/n/live_1790462371219");
    expect(text.indexOf("טיפים הערב")).toBeLessThan(text.indexOf("https://kupa.test"));
    expect(isNightShareText(text)).toBe(true);
  });

  it("the 08:00 reminder picks up the 26.9 night with its five open transfers", () => {
    const due = sessionsDueForPaymentReminder([NIGHT_26_9], "2026-09-27", {
      alreadySent: { live_1790201099969: "2026-09-25" },
    });
    expect(due).toHaveLength(1);
    expect(due[0].check.unpaid).toHaveLength(5);
    const text = buildPaymentReminderText(NIGHT_26_9, due[0].check.unpaid, {
      siteUrl: "https://kupa.test",
      slug: "g1",
    });
    expect(text).toContain("חלוקת ערב 26.9");
    expect(text).toContain("https://kupa.test/g/g1/n/live_1790462371219");
  });
});

describe("send the night settlement link again from the night card", () => {
  const url = settlementAppUrl({ siteUrl: "https://kupa-poker.vercel.app", slug: "kupa", sessionId: NIGHT_26_9.id });

  it("is a short bot message with the night date and the /n/ link", () => {
    const text = settlementLinkMessage(url, NIGHT_26_9);
    expect(text.split("\n")).toEqual([
      `${BOT_MARK} החלוקה של ערב 26.9 — מסמנים כאן מי העביר:`,
      `https://kupa-poker.vercel.app/g/kupa/n/${NIGHT_26_9.id}`,
    ]);
  });

  it("does not take over the night pin from the full summary", () => {
    expect(isNightShareText(settlementLinkMessage(url, NIGHT_26_9))).toBe(false);
  });

  it("still sends something readable without a date or a slug", () => {
    expect(settlementLinkMessage(null)).toBe(`${BOT_MARK} החלוקה של הערב — מסמנים כאן מי העביר:\n(לינק לא מוגדר)`);
  });
});
