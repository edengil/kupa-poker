import { describe, it, expect } from "vitest";
import { parseCommands, applyCommands, helpText, BOT_MARK } from "../lib/whatsapp.js";
import { isNightShareText } from "../lib/waPins.js";
import { buildTipsTable, rankTips } from "../lib/tipsTable.js";
import { NIGHT_26_9, liveBeforeLastCashout } from "./fixtures/night-2026-09-26.js";

describe("סיכום טיפים", () => {
  it("parses the command and close variants", () => {
    for (const phrase of ["סיכום טיפים", "סיכום טיפ", "טיפים", "טבלת טיפים", "דירוג טיפים", "מי מוביל בטיפים?"]) {
      expect(parseCommands(phrase, 50, true)).toEqual([{ kind: "tipsSummary" }]);
      expect(parseCommands(phrase, 50, false)).toEqual([{ kind: "tipsSummary" }]);
    }
    expect(parseCommands("סיכום", 50, true)).toEqual([{ kind: "settle" }]);
    expect(parseCommands("אופיר טיפ 10", 50, true)[0]).toMatchObject({ kind: "tip", chips: 10 });
    expect(parseCommands("טיפ", 50, false)).toEqual([]);
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
