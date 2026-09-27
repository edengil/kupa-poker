import { describe, it, expect } from "vitest";
import { parseCommands, applyCommands, helpText, BOT_MARK } from "../lib/whatsapp.js";
import { isNightShareText } from "../lib/waPins.js";
import { buildTipsTable, rankTips } from "../lib/tipsTable.js";
import { NIGHT_26_9, liveBeforeLastCashout } from "./fixtures/night-2026-09-26.js";

describe("סיכום טיפים", () => {
  it("parses the command and close variants", () => {
    for (const phrase of ["סיכום טיפים", "סיכום טיפ", "טיפים", "טיפ", "טבלת טיפים", "דירוג טיפים", "מי מוביל בטיפים?"]) {
      expect(parseCommands(phrase, 50, true)).toEqual([{ kind: "tipsSummary" }]);
      expect(parseCommands(phrase, 50, false)).toEqual([{ kind: "tipsSummary" }]);
    }
    expect(parseCommands("סיכום", 50, true)).toEqual([{ kind: "settle" }]);
  });

  it("accepts punctuation, spacing and a bot mention around the word", () => {
    for (const phrase of [
      "טיפים?",
      "טיפ!",
      "  סיכום טיפים.  ",
      "סיכום טיפ?!",
      "טיפים…",
      "@972501234567 טיפים",
      "@972501234567, סיכום טיפים?",
      "בוט טיפים",
      "הבוט, טיפ?",
      "טיפים @972501234567",
      "סיכום הטיפים",
      "שלח טבלת טיפים",
    ]) {
      expect(parseCommands(phrase, 50, true), phrase).toEqual([{ kind: "tipsSummary" }]);
    }
  });

  it("with an amount it records a tip, never a summary", () => {
    expect(parseCommands("אופיר טיפ 10", 50, true)).toEqual([{ kind: "tip", name: "אופיר", chips: 10 }]);
    expect(parseCommands("אופיר 10 טיפ", 50, true)).toEqual([{ kind: "tip", name: "אופיר", chips: 10 }]);
    expect(parseCommands("אופיר נתן טיפים 20", 50, true)).toEqual([{ kind: "tip", name: "אופיר", chips: 20 }]);
    expect(parseCommands("טיפ אופיר 10", 50, true)).toEqual([{ kind: "tip", name: "אופיר", chips: 10 }]);
    expect(parseCommands("טיפ 10 אופיר", 50, true)).toEqual([{ kind: "tip", name: "אופיר", chips: 10 }]);
    expect(parseCommands("טיפים של קובי 15", 50, true)).toEqual([{ kind: "tip", name: "קובי", chips: 15 }]);
  });

  it("an amount without a name asks whose tip, instead of adding a player named טיפ", () => {
    expect(parseCommands("טיפ 50", 50, true)).toEqual([{ kind: "tipNoName", chips: 50 }]);
    expect(parseCommands("טיפ 50", 50, false)).toEqual([]);
    const live = { players: [{ name: "אופיר סנה", buyin: 50, cashout: "" }], applied: {} };
    const out = applyCommands(live, parseCommands("טיפ 50", 50, true), "m-noname");
    expect(out.reply).toContain("של מי?");
    expect(out.reply).toContain("«אופיר טיפ 50»");
    expect(out.live.players.map((p) => p.name)).toEqual(["אופיר סנה"]);
    expect(out.live.tips || []).toEqual([]);
  });

  it("does not steal a player whose name starts with בוט", () => {
    expect(parseCommands("בוטי 50", 50, true)).toEqual([{ kind: "add", name: "בוטי", amount: 50 }]);
  });

  it("sums WhatsApp and app tips under one name, nicknames included", () => {
    const live = {
      startedAt: NIGHT_26_9.startedAt,
      players: [
        { name: "אופיר סנה", buyin: 50, cashout: "", tipsGiven: 30 },
        { name: "קובי סעדה", buyin: 50, cashout: "" },
      ],
      tips: [
        { id: "wa1", name: "אופיר", amount: 10, at: 1 },
        { id: "app1", name: "אופיר סנה", amount: 20, at: 2 },
        { id: "wa2", name: "קובי", amount: 15, at: 3 },
      ],
      applied: {},
    };
    const { reply } = applyCommands(live, parseCommands("טיפים", 50, true), "m-mix", 2, { now: NIGHT_26_9.endedAt });
    expect(reply).toContain("🥇 אופיר סנה · 30 ג׳");
    expect(reply).toContain("🥈 קובי סעדה · 15 ג׳");
    expect(reply).not.toMatch(/^.*אופיר · /m);
    expect(reply).toContain("סה״כ טיפים: 45 ג׳");
  });

  it("counts app-only tipsGiven on a saved night with no tips log", () => {
    const saved = {
      d: 23,
      mo: 9,
      entries: [
        { name: "עדן גיל", amount: 10, tipsGiven: 30 },
        { name: "דן ינקלויץ", amount: -10 },
      ],
    };
    expect(rankTips(saved).map((r) => [r.place, r.name, r.amount])).toEqual([
      [1, "עדן גיל", 30],
      [2, "דן ינקלויץ", 0],
    ]);
  });

  it("ranks the 26.9 tips from first to last, ties share a place", () => {
    expect(rankTips(NIGHT_26_9).map((r) => [r.place, r.name, r.amount])).toEqual([
      [1, "קובי סעדה", 40],
      [2, "עדן גיל", 35],
      [3, "אופיר סנה", 20],
      [4, "דור לירז", 10],
      [4, "דן ינקלויץ", 10],
      [6, "נתנאל כהן", 5],
      [7, "אורן גיל", 0],
    ]);
    const text = buildTipsTable(NIGHT_26_9);
    expect(text.split("\n")).toEqual([
      `${BOT_MARK} 💸 סיכום טיפים · ערב 26.9`,
      "",
      "🥇 קובי סעדה · 40 ג׳",
      "🥈 עדן גיל · 35 ג׳",
      "🥉 אופיר סנה · 20 ג׳",
      "4. דור לירז · 10 ג׳",
      "4. דן ינקלויץ · 10 ג׳",
      "6. נתנאל כהן · 5 ג׳",
      "",
      "סה״כ טיפים: 120 ג׳",
      "בלי טיפ: אורן גיל",
    ]);
    expect(isNightShareText(text)).toBe(false);
  });

  it("says so when nobody tipped yet", () => {
    const text = buildTipsTable({ players: [{ name: "דן ינקלויץ", buyin: 50, cashout: "" }] }, { live: true });
    expect(text).toContain("אף אחד עוד לא שם טיפ");
  });

  it("answers for the live game, else for the last saved night", () => {
    const live = liveBeforeLastCashout();
    const during = applyCommands(live, [{ kind: "tipsSummary" }], "m-t1", 2, { now: NIGHT_26_9.endedAt });
    expect(during.live).toBe(live);
    expect(during.reply).toContain("סיכום טיפים · הערב 26.9");
    expect(during.reply).toContain("🥇 קובי סעדה · 40 ג׳");

    const after = applyCommands(null, [{ kind: "tipsSummary" }], "m-t2", 2, { lastSession: NIGHT_26_9 });
    expect(after.reply).toContain("סיכום טיפים · ערב 26.9");

    const nothing = applyCommands(null, [{ kind: "tipsSummary" }], "m-t3");
    expect(nothing.reply).toContain("אין משחק פעיל");
  });

  it("is listed in the help text", () => {
    expect(helpText()).toContain("סיכום טיפים");
  });
});

describe("קובי טיפ", () => {
  const table = () => ({
    players: [
      { name: "קובי סעדה", buyin: 50, cashout: "" },
      { name: "אופיר סנה", buyin: 50, cashout: "" },
    ],
    applied: {},
  });

  it("opens every Kobi tip with יא חאלייה, then his normal compliment", () => {
    const { reply } = applyCommands(table(), parseCommands("קובי טיפ 10", 50, true), "m-kobi");
    const lines = reply.split("\n");
    expect(lines[0]).toBe(`${BOT_MARK} יא חאלייה`);
    expect(lines[1]).toContain("קובי סעדה");
    expect(lines[1]).toContain("10");
  });

  it("does not add it for anyone else", () => {
    const { reply } = applyCommands(table(), parseCommands("אופיר טיפ 10", 50, true), "m-ofir");
    expect(reply).not.toContain("יא חאלייה");
  });
});
