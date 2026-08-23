import { describe, it, expect } from "vitest";
import {
  playersFromSession,
  settlementTextForSession,
  tipSummaryForSession,
  nightSummaryText,
  sessionHasBuyinChips,
} from "../lib/nightShare.js";

describe("playersFromSession", () => {
  it("uses buyin/chips when present", () => {
    const session = {
      entries: [
        { name: "א", amount: 50, buyin: 100, chips: 300, tipsGiven: 10 },
        { name: "ב", amount: -50, buyin: 100, chips: 100 },
      ],
    };
    expect(sessionHasBuyinChips(session)).toBe(true);
    const players = playersFromSession(session);
    expect(players[0]).toMatchObject({ name: "א", buyin: 100, cashout: "300", tipsGiven: 10 });
    expect(players[1]).toMatchObject({ name: "ב", buyin: 100, cashout: "100" });
  });

  it("falls back to net-only like InputTab when no buyin/chips", () => {
    const session = {
      entries: [
        { name: "א", amount: 80 },
        { name: "ב", amount: -80 },
      ],
    };
    expect(sessionHasBuyinChips(session)).toBe(false);
    const players = playersFromSession(session);
    expect(players[0]).toMatchObject({ name: "א", buyin: 0, cashout: "80" });
    expect(players[1]).toMatchObject({ name: "ב", buyin: 80, cashout: "0" });
  });
});

describe("settlementTextForSession", () => {
  it("builds transfer lines for a net-only session (cps=1)", () => {
    const session = {
      entries: [
        { name: "שגיא", amount: 100 },
        { name: "קובי", amount: -100 },
      ],
      endedAt: Date.parse("2026-08-20T22:00:00+03:00"),
    };
    const text = settlementTextForSession(session);
    expect(text).toContain("חלוקה");
    expect(text).toMatch(/קובי מעביר 100 לשגיא/);
  });

  it("builds transfer lines from buyin/chips with default cps", () => {
    // cps=2: net = chips/2 - buyin → א +100, ב -100
    const session = {
      entries: [
        { name: "א", amount: 100, buyin: 100, chips: 400 },
        { name: "ב", amount: -100, buyin: 100, chips: 0 },
      ],
      endedAt: Date.parse("2026-08-20T22:00:00+03:00"),
    };
    const text = settlementTextForSession(session);
    expect(text).toMatch(/ב מעביר 100 לא/);
  });

  it("returns empty string when there are no entries", () => {
    expect(settlementTextForSession({ entries: [] })).toBe("");
  });
});

describe("tipSummaryForSession", () => {
  it("ranks tippers from tipsGiven on a saved session", () => {
    const session = {
      entries: [
        { name: "אופיר", amount: 20, tipsGiven: 15 },
        { name: "דן", amount: -10, tipsGiven: 5 },
        { name: "קובי", amount: -10 },
      ],
    };
    const text = tipSummaryForSession(session);
    expect(text).toContain("💸 טיפים הערב");
    expect(text).toContain("🥇");
    expect(text).toContain("אופיר");
    expect(text).toContain("15");
    expect(text).toContain("🥈");
    expect(text).toContain("דן");
    expect(text).toMatch(/קובי/);
  });

  it("uses tipsGiven on entries when tips array is empty (live save shape)", () => {
    /* כמו saveNight: tipsGiven על entries, tips: [] / undefined */
    const session = {
      entries: [
        { name: "אופיר", amount: 50, buyin: 100, chips: 300, tipsGiven: 12 },
        { name: "דן", amount: -20, buyin: 100, chips: 160, tipsGiven: 0 },
        { name: "קובי", amount: -30, buyin: 100, chips: 140 },
      ],
      tips: [],
    };
    const text = tipSummaryForSession(session);
    expect(text).toContain("💸 טיפים הערב");
    expect(text).toContain("🥇");
    expect(text).toContain("אופיר");
    expect(text).toContain("12");
    expect(text).toMatch(/דן|קובי/);
  });

  it("merges tips[] events with tipsGiven on entries", () => {
    const session = {
      entries: [
        { name: "אופיר", amount: 10, tipsGiven: 20 },
        { name: "דן", amount: -10, tipsGiven: 5 },
      ],
      tips: [{ name: "אופיר", amount: 8, at: 1 }],
    };
    const text = tipSummaryForSession(session);
    /* tipsGiven גבוה יותר מיומן — לוקחים את המקסימום */
    expect(text).toContain("אופיר");
    expect(text).toContain("20");
    expect(text).toContain("דן");
    expect(text).toContain("5");
  });

  it("always shows tip block when nobody tipped", () => {
    const session = {
      entries: [
        { name: "א", amount: 40 },
        { name: "ב", amount: -40 },
      ],
    };
    const text = tipSummaryForSession(session);
    expect(text).toContain("💸 טיפים הערב");
    expect(text).toContain("אף אחד לא שם טיפ הערב");
    expect(text).toMatch(/א|ב/);
  });

  it("works with live-style players + tips array", () => {
    const state = {
      players: [
        { name: "אופיר", buyin: 50, cashout: "200", tipsGiven: 10 },
        { name: "דן", buyin: 50, cashout: "0", tipsGiven: 0 },
      ],
      tips: [{ name: "אופיר", amount: 10, at: 1 }],
    };
    const withNet = [
      { p: state.players[0], net: 50 },
      { p: state.players[1], net: -50 },
    ];
    const text = tipSummaryForSession(state, withNet);
    expect(text).toContain("אופיר");
    expect(text).toContain("תותח");
    expect(text).toMatch(/דן/);
  });
});

describe("nightSummaryText", () => {
  it("combines nets WhatsApp text with tip summary", () => {
    const session = {
      d: 20,
      mo: 8,
      entries: [
        { name: "אופיר", amount: 50, tipsGiven: 10 },
        { name: "קובי", amount: -50 },
      ],
    };
    const text = nightSummaryText(session);
    expect(text).toContain("סיכום פוקר 20.8");
    expect(text).toContain("אופיר");
    expect(text).toContain("💸 טיפים הערב");
  });

  it("appends tip summary for tipsGiven-only night (no tips array) like Sessions share", () => {
    const session = {
      d: 23,
      mo: 8,
      y: 2026,
      entries: [
        { name: "אופיר", amount: 80, buyin: 100, chips: 360, tipsGiven: 15 },
        { name: "קובי", amount: -80, buyin: 100, chips: 40, tipsGiven: 0 },
      ],
      tips: [],
      startedAt: Date.parse("2026-08-23T20:00:00+03:00"),
      endedAt: Date.parse("2026-08-23T23:30:00+03:00"),
    };
    const text = nightSummaryText(session);
    expect(text).toContain("סיכום פוקר 23.8");
    expect(text).toContain("💸 טיפים הערב");
    expect(text).toContain("🥇");
    expect(text).toContain("אופיר");
    expect(text).toContain("15");
    expect(text).toMatch(/קובי/);
    /* טאב חלוקה ב־ShareSheet נשען על אותו ערב */
    const split = settlementTextForSession(session);
    expect(split).toContain("חלוקה");
    expect(split).toMatch(/מעביר/);
  });

  it("still appends tip block when all tip totals are zero", () => {
    const session = {
      d: 23,
      mo: 8,
      entries: [
        { name: "א", amount: 10 },
        { name: "ב", amount: -10 },
      ],
    };
    const text = nightSummaryText(session);
    expect(text).toContain("💸 טיפים הערב");
    expect(text).toContain("אף אחד לא שם טיפ הערב");
  });
});
