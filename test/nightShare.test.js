import { describe, it, expect } from "vitest";
import {
  playersFromSession,
  settlementTextForSession,
  tipSummaryForSession,
  nightSummaryText,
  sessionHasBuyinChips,
} from "../lib/nightShare.js";
import {
  NON_TIPPER_ROASTS,
  tipRankPlaces,
  formatFirstPlaceLine,
  formatNonTipperLine,
} from "../lib/tipSummaryCopy.js";
import { isFemaleName } from "../lib/settlement.js";
import { BOT_MARK, withBotMark } from "../lib/botMark.js";

describe("withBotMark", () => {
  it("prefixes BOT_MARK once", () => {
    expect(withBotMark("שלום")).toBe(`${BOT_MARK} שלום`);
    expect(withBotMark(`${BOT_MARK} שלום`)).toBe(`${BOT_MARK} שלום`);
    expect(withBotMark(`  ${BOT_MARK} שלום`)).toBe(`  ${BOT_MARK} שלום`);
  });
});

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
    expect(text.startsWith(BOT_MARK)).toBe(true);
    expect(text).toContain("חלוקה");
    expect(text).toMatch(/קובי מעביר 100 לשגיא/);
  });

  it("builds transfer lines from buyin/chips with default cps", () => {
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

describe("tipRankPlaces", () => {
  it("shares 2nd place on equal amounts and skips to 4th for next", () => {
    const ranks = tipRankPlaces([
      { name: "א", amount: 100 },
      { name: "ב", amount: 50 },
      { name: "ג", amount: 50 },
      { name: "ד", amount: 10 },
    ]);
    expect(ranks).toEqual([
      { place: 1, names: ["א"], amount: 100 },
      { place: 2, names: ["ב", "ג"], amount: 50 },
      /* מקום 4 — לא מוצג (רק עד 3) */
    ]);
  });

  it("shows 3rd place when amounts differ", () => {
    const ranks = tipRankPlaces([
      { name: "א", amount: 100 },
      { name: "ב", amount: 50 },
      { name: "ג", amount: 20 },
    ]);
    expect(ranks.map((r) => r.place)).toEqual([1, 2, 3]);
    expect(ranks[2].names).toEqual(["ג"]);
  });
});

describe("NON_TIPPER_ROASTS bag", () => {
  const flat = NON_TIPPER_ROASTS.map((e) =>
    typeof e === "string" ? e : [e.m, e.f, e.multi].filter(Boolean).join(" | ")
  ).join("\n");

  it("includes soda line", () => {
    expect(flat).toContain("סודה");
  });

  it("excludes all-in and סלע lines", () => {
    expect(flat).not.toMatch(/all-in/i);
    expect(flat).not.toContain("סלע");
  });
});

describe("tipSummaryForSession", () => {
  const fixedNow = Date.parse("2026-08-23T12:00:00+03:00");

  it("ranks tippers without amounts; omits honor when all on podium; roasts non-tippers", () => {
    const session = {
      entries: [
        { name: "אופיר", amount: 20, tipsGiven: 15 },
        { name: "דן", amount: -10, tipsGiven: 5 },
        { name: "קובי", amount: -10 },
      ],
    };
    const text = tipSummaryForSession(session, undefined, { now: fixedNow });
    expect(text.startsWith(BOT_MARK)).toBe(true);
    expect(text).toContain("💸 טיפים הערב");
    expect(text).toContain("🥇");
    expect(text).toContain("אופיר");
    expect(text).toContain("🥈");
    expect(text).toContain("דן");
    expect(text).not.toContain("גם נתנו טיפ");
    expect(text).toMatch(/קובי/);
    /* אין סכומים בפלט */
    expect(text).not.toMatch(/\b15\b/);
    expect(text).not.toMatch(/\b5\b/);
    expect(text).toMatch(/שם הכי מעט/);
  });

  it("ties share 2nd place; honor lists only tippers off podium", () => {
    const session = {
      entries: [
        { name: "איציק", amount: 40, tipsGiven: 100 },
        { name: "דן", amount: 10, tipsGiven: 40 },
        { name: "אופיר", amount: 10, tipsGiven: 40 },
        { name: "נתנאל", amount: -60, tipsGiven: 10 },
        { name: "קובי", amount: 0 },
      ],
    };
    const text = tipSummaryForSession(session, undefined, { now: fixedNow });
    expect(text).toMatch(/🥈 מקום שני בטיפים: (דן, אופיר|אופיר, דן)/);
    expect(text).not.toContain("🥉");
    expect(text).not.toMatch(/\b100\b/);
    expect(text).not.toMatch(/\b40\b/);
    expect(text).toContain("👏 גם נתנו טיפ: נתנאל");
    expect(text).not.toMatch(/גם נתנו טיפ:.*(איציק|דן|אופיר)/);
    expect(text).toMatch(/שם הכי מעט/);
  });

  it("shows 🥉 third place when three distinct tip amounts; no honor line", () => {
    const session = {
      entries: [
        { name: "א", amount: 30, tipsGiven: 90 },
        { name: "ב", amount: 0, tipsGiven: 50 },
        { name: "ג", amount: -10, tipsGiven: 20 },
        { name: "ד", amount: -20 },
      ],
    };
    const text = tipSummaryForSession(session, undefined, { now: fixedNow });
    expect(text).toContain("🥇");
    expect(text).toContain("🥈 מקום שני בטיפים: ב");
    expect(text).toContain("🥉 מקום שלישי בטיפים: ג");
    expect(text).not.toContain("גם נתנו טיפ");
    expect(text).not.toMatch(/\b90\b|\b50\b|\b20\b/);
  });

  it("uses feminine first-place praise for אורן", () => {
    const session = {
      entries: [
        { name: "אורן", amount: 10, tipsGiven: 80 },
        { name: "דן", amount: -10, tipsGiven: 10 },
      ],
    };
    const text = tipSummaryForSession(session, undefined, { now: fixedNow });
    expect(text).toMatch(/מלכה|תותחית|נותנת|אחות|אגדה|מלכת/);
    expect(text).not.toMatch(/יא מלך[^ה]|אתה נותן|תותח על הטיפ/);
  });

  it("uses tipsGiven on entries when tips array is empty (live save shape)", () => {
    const session = {
      entries: [
        { name: "אופיר", amount: 50, buyin: 100, chips: 300, tipsGiven: 12 },
        { name: "דן", amount: -20, buyin: 100, chips: 160, tipsGiven: 0 },
        { name: "קובי", amount: -30, buyin: 100, chips: 140 },
      ],
      tips: [],
    };
    const text = tipSummaryForSession(session, undefined, { now: fixedNow });
    expect(text).toContain("💸 טיפים הערב");
    expect(text).toContain("🥇");
    expect(text).toContain("אופיר");
    expect(text).not.toContain("12");
    expect(text).toMatch(/דן|קובי/);
  });

  it("merges tips[] events with tipsGiven on entries (no amounts in summary)", () => {
    const session = {
      entries: [
        { name: "אופיר", amount: 10, tipsGiven: 20 },
        { name: "דן", amount: -10, tipsGiven: 5 },
      ],
      tips: [{ name: "אופיר", amount: 8, at: 1 }],
    };
    const text = tipSummaryForSession(session, undefined, { now: fixedNow });
    expect(text).toContain("אופיר");
    expect(text).toContain("דן");
    expect(text).not.toMatch(/\b20\b|\b5\b|\b8\b/);
  });

  it("always shows tip block when nobody tipped", () => {
    const session = {
      entries: [
        { name: "א", amount: 40 },
        { name: "ב", amount: -40 },
      ],
    };
    const text = tipSummaryForSession(session, undefined, { now: fixedNow });
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
    const text = tipSummaryForSession(state, withNet, { now: fixedNow });
    expect(text).toContain("אופיר");
    expect(text).toMatch(/מלך|תותח|ציסר|אגדה/);
    expect(text).toMatch(/דן/);
  });

  it("lists each no-tip player name exactly once (no wonNoTip duplicate)", () => {
    const session = {
      entries: [
        { name: "אופיר", amount: 50, tipsGiven: 10 },
        { name: "קובי", amount: 30 },
        { name: "דן", amount: -80 },
      ],
    };
    const text = tipSummaryForSession(session, undefined, { now: fixedNow });
    expect((text.match(/קובי/g) || []).length).toBe(1);
    expect(text).not.toContain("הרווחתם ולא השארתם");
    expect(text).not.toContain("גם נתנו טיפ");
    const parts = text.split("\n");
    const noTipIdx = parts.findIndex((l) => /בלי טיפ|נעלמו בלי טיפ/.test(l));
    expect(noTipIdx).toBeGreaterThan(0);
    expect(parts[noTipIdx - 1]).toBe("");
    const noTipLine = parts[noTipIdx];
    expect(noTipLine).toMatch(/^\*.*קובי, דן.*\*$/);
    expect(noTipLine).not.toContain("אופיר");
  });

  it("honor line excludes podium tippers and uses גם נתנו טיפ", () => {
    const session = {
      entries: [
        { name: "אלון", amount: 10, tipsGiven: 100 },
        { name: "בני", amount: 0, tipsGiven: 50 },
        { name: "גיא", amount: 0, tipsGiven: 20 },
        { name: "דוד", amount: 0, tipsGiven: 5 },
        { name: "הלל", amount: -10 },
      ],
    };
    const text = tipSummaryForSession(session, undefined, { now: fixedNow });
    expect(text).toContain("👏 גם נתנו טיפ: דוד");
    const honor = text.split("\n").find((l) => l.includes("גם נתנו טיפ"));
    expect(honor).not.toContain("אלון");
    expect(honor).not.toContain("בני");
    expect(honor).not.toContain("גיא");
    const parts = text.split("\n");
    const noTipIdx = parts.findIndex((l) => /בלי טיפ|נעלמו בלי טיפ/.test(l));
    expect(parts[noTipIdx - 1]).toBe("");
    const noTipLine = parts[noTipIdx];
    expect(noTipLine).toMatch(/^\*.*הלל.*\*$/);
    expect(noTipLine).not.toMatch(/אלון|בני|גיא|דוד/);
  });

  it("first-place formatter genders by isFemaleName", () => {
    expect(formatFirstPlaceLine(["אורן"], isFemaleName, fixedNow)).toMatch(/מלכה|תותחית|נותנת|אחות/);
    expect(formatFirstPlaceLine(["איציק"], isFemaleName, fixedNow)).toMatch(/מלך|תותח|נותן|אח /);
  });

  it("bolds the entire no-tip line in WhatsApp markup", () => {
    const line = formatNonTipperLine(["דור", "אורן"], isFemaleName, fixedNow);
    expect(line.startsWith("*")).toBe(true);
    expect(line.endsWith("*")).toBe(true);
    expect(line).toMatch(/^\*(🙊 (?:נעלמו בלי טיפ|בלי טיפ הערב)): דור, אורן — .+\*$/);
    /* לא רק השמות מודגשים */
    expect(line).not.toMatch(/: \*[^*]+\* —/);
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
    expect(text.startsWith(BOT_MARK)).toBe(true);
    expect(text).toContain("סיכום פוקר 20.8");
    expect(text).toContain("אופיר");
    expect(text).toContain("💸 טיפים הערב");
    /* בלוק טיפים כבר מסומן — בלי כפילות בתחילת ההודעה */
    expect(text.indexOf(BOT_MARK)).toBe(0);
    expect(text.lastIndexOf(BOT_MARK)).toBeGreaterThan(0);
    expect(text.indexOf("אופיר מגיע")).toBeLessThan(text.indexOf("קובי חייב"));
  });

  it("orders winners before debtors; single BOT_MARK at start of סיכום פוקר block", () => {
    const session = {
      d: 23,
      mo: 8,
      entries: [
        { name: "גדול", amount: 150 },
        { name: "קטן", amount: 40 },
        { name: "חוב קטן", amount: -40 },
        { name: "חוב גדול", amount: -150 },
      ],
    };
    const text = nightSummaryText(session);
    expect(text.startsWith(BOT_MARK)).toBe(true);
    expect(text).toMatch(new RegExp(`^${BOT_MARK} סיכום פוקר`));
    /* בלי כפילות צמודות בתחילה */
    expect(text).not.toMatch(new RegExp(`${BOT_MARK}\\s*${BOT_MARK}`));
    expect(text).toMatch(/🥇 גדול מגיע 150/);
    expect(text).toMatch(/🥈 קטן מגיע 40/);
    const iWin = text.indexOf("גדול מגיע");
    const iDebtSmall = text.indexOf("חוב קטן חייב");
    const iDebtBig = text.indexOf("חוב גדול חייב");
    expect(iWin).toBeLessThan(iDebtSmall);
    expect(iDebtSmall).toBeLessThan(iDebtBig);
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
    expect(text).not.toContain("15");
    expect(text).toMatch(/קובי/);
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
    expect(text.startsWith(BOT_MARK)).toBe(true);
    expect(text).toContain("💸 טיפים הערב");
    expect(text).toContain("אף אחד לא שם טיפ הערב");
  });
});
