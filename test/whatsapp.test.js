import { describe, it, expect } from "vitest";
import { parseCommands, applyCommands, findPlayer, isAllowed, BOT_MARK } from "../lib/whatsapp.js";

describe("parseCommands", () => {
  it("parses a buy-in command", () => {
    const cmds = parseCommands("דן עוד 50", 50, true);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]).toMatchObject({ kind: "add", name: "דן", amount: 50 });
  });

  it("uses the default amount when no number is given", () => {
    const cmds = parseCommands("דן עוד", 80, true);
    expect(cmds[0]).toMatchObject({ kind: "add", name: "דן", amount: 80 });
  });

  it("parses a cashout command", () => {
    const cmds = parseCommands("קובי יצא 300", 50, true);
    expect(cmds[0]).toMatchObject({ kind: "cashout", name: "קובי", chips: 300 });
  });

  it("ignores the bot's own echoed messages", () => {
    expect(parseCommands(`${BOT_MARK} דן עוד 50`, 50, true)).toHaveLength(0);
  });

  it("does not treat a bare name+number as a command before a game starts", () => {
    expect(parseCommands("דוד בני 50", 50, false)).toHaveLength(0);
    expect(parseCommands("דוד בני 50", 50, true)).toHaveLength(1);
  });

  it("splits multiple commands across lines", () => {
    const cmds = parseCommands("דן עוד 50\nקובי עוד 100", 50, true);
    expect(cmds).toHaveLength(2);
  });
});

describe("applyCommands", () => {
  it("creates a new player on buy-in", () => {
    const { live, reply } = applyCommands(null, [{ kind: "add", name: "קובי", amount: 100 }], "m1");
    expect(live.players).toHaveLength(1);
    expect(live.players[0]).toMatchObject({ name: "קובי", buyin: 100, cashout: "" });
    expect(reply).toContain("קובי");
  });

  it("is idempotent for a repeated message id (dedupe / edit)", () => {
    const first = applyCommands(null, [{ kind: "add", name: "קובי", amount: 100 }], "m1").live;
    const second = applyCommands(first, [{ kind: "add", name: "קובי", amount: 100 }], "m1").live;
    // same id → undo then reapply, not doubled
    expect(second.players).toHaveLength(1);
    expect(second.players[0].buyin).toBe(100);
  });

  it("records a cashout for an existing player", () => {
    const start = applyCommands(null, [{ kind: "add", name: "קובי", amount: 100 }], "m1").live;
    const { live } = applyCommands(start, [{ kind: "cashout", name: "קובי", chips: 300 }], "m2");
    expect(live.players[0].cashout).toBe("300");
  });

  it("flags an ambiguous name instead of guessing", () => {
    const start = {
      players: [
        { name: "קובי א", buyin: 50, cashout: "" },
        { name: "קובי ב", buyin: 50, cashout: "" },
      ],
    };
    const { reply } = applyCommands(start, [{ kind: "add", name: "קובי", amount: 50 }], "m3");
    expect(reply).toContain("⚠️");
  });

  it("returns help text for the help command", () => {
    const { reply } = applyCommands(null, [{ kind: "help" }], null);
    expect(reply.startsWith(BOT_MARK)).toBe(true);
  });
});

describe("findPlayer (aliases)", () => {
  it("resolves a known alias to the full name", () => {
    const players = [{ name: "דן ינקלויץ" }, { name: "דן ויסמן" }];
    // "דן" is aliased to דן ינקלויץ, so it is not ambiguous
    expect(findPlayer(players, "דן")).toEqual({ index: 0 });
  });

  it("reports ambiguity when a prefix matches more than one player", () => {
    const players = [{ name: "קובי א" }, { name: "קובי ב" }];
    const res = findPlayer(players, "קובי");
    expect(res.index).toBe(-1);
    expect(res.ambiguous).toHaveLength(2);
  });
});

describe("isAllowed", () => {
  it("allows messages sent from the linked phone (fromMe)", () => {
    expect(isAllowed({ fromMe: true, from: "" }, "972500000000", "")).toBe(true);
  });

  it("allows the configured owner number", () => {
    expect(isAllowed({ fromMe: false, from: "972521234567" }, "972521234567", "")).toBe(true);
  });

  it("rejects an unknown number", () => {
    expect(isAllowed({ fromMe: false, from: "972999999999" }, "972521234567", "")).toBe(false);
  });
});

describe("settle / end replies — app CTA", () => {
  it("appends the app link when siteUrl+slug are on the settle command", () => {
    const live = {
      players: [
        { name: "א", buyin: 100, cashout: "400" },
        { name: "ב", buyin: 100, cashout: "0" },
      ],
      tips: [],
      applied: {},
    };
    const { reply } = applyCommands(
      live,
      [{ kind: "settle", siteUrl: "https://example.com", slug: "kupa" }],
      null
    );
    expect(reply).toContain("חשבון סופי");
    expect(reply).toContain("📱 לראות את החלוקה באפליקציה:");
    expect(reply).toContain("https://example.com/g/kupa");
    /* לא שולחים רשימת העברות לקבוצה — רק לינק */
    expect(reply).not.toMatch(/מעביר \d+ ל/);
  });

  it("appends the app link on last cashout in closing mode", () => {
    const live = {
      closing: true,
      players: [
        { name: "א", buyin: 100, cashout: "400" },
        { name: "ב", buyin: 100, cashout: "" },
      ],
      tips: [],
      applied: {},
    };
    const { reply } = applyCommands(
      live,
      [{ kind: "cashout", name: "ב", chips: 0, siteUrl: "https://example.com", slug: "kupa" }],
      "m-close"
    );
    expect(reply).toContain("כולם סגורים");
    expect(reply).toContain("https://example.com/g/kupa");
    expect(reply).not.toContain("לשמירת הערב וחלוקת ההעברות — האפליקציה.");
  });
});
