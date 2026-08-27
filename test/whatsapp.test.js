import { describe, it, expect } from "vitest";
import { parseCommands, applyCommands, findPlayer, isAllowed, BOT_MARK, maybeRemindPending, PENDING_REMIND_MS } from "../lib/whatsapp.js";

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

  it("resolves דור בני to דוד בני גיל", () => {
    const players = [{ name: "דוד בני גיל" }];
    expect(findPlayer(players, "דור בני")).toEqual({ index: 0 });
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

describe("new player approval", () => {
  const known = ["עדן גיל", "קובי סעדה", "דוד בני גיל"];

  it("holds an unknown name until Eden approves", () => {
    const { live, reply, ownerDm } = applyCommands(
      null,
      [{ kind: "add", name: "יוסי", amount: 100 }],
      "m-new",
      2,
      { knownNames: known }
    );
    expect(live.players).toHaveLength(0);
    expect(live.pendingApprovals).toEqual([
      expect.objectContaining({ name: "יוסי", amount: 100 }),
    ]);
    expect(reply).toContain("שחקן חדש");
    expect(ownerDm).toContain("יוסי");
    expect(ownerDm).toContain("אשר");
  });

  it("does not gate a known roster player", () => {
    const { live } = applyCommands(
      null,
      [{ kind: "add", name: "קובי", amount: 50 }],
      "m-kobi",
      2,
      { knownNames: known }
    );
    expect(live.players[0].name).toBe("קובי");
    expect(live.pendingApprovals).toEqual([]);
  });

  it("seats the player after אשר", () => {
    const pending = applyCommands(
      null,
      [{ kind: "add", name: "יוסי", amount: 100 }],
      "m-new",
      2,
      { knownNames: known }
    ).live;
    const { live, reply } = applyCommands(
      pending,
      [{ kind: "approve", name: "יוסי" }],
      "m-ok",
      2,
      { knownNames: known }
    );
    expect(live.players).toHaveLength(1);
    expect(live.players[0]).toMatchObject({ name: "יוסי", buyin: 100 });
    expect(live.pendingApprovals).toEqual([]);
    expect(live.approvedNames).toContain("יוסי");
    expect(reply).toContain("אושר");
  });

  it("drops the buy-in on דחה", () => {
    const pending = applyCommands(
      null,
      [{ kind: "add", name: "יוסי", amount: 100 }],
      "m-new",
      2,
      { knownNames: known }
    ).live;
    const { live } = applyCommands(
      pending,
      [{ kind: "reject", name: "יוסי" }],
      "m-no",
      2,
      { knownNames: known }
    );
    expect(live.players).toHaveLength(0);
    expect(live.pendingApprovals).toEqual([]);
  });

  it("parses אשר יוסי and דחה יוסי", () => {
    expect(parseCommands("אשר יוסי", 50, true)[0]).toMatchObject({ kind: "approve", name: "יוסי" });
    expect(parseCommands("דחה יוסי", 50, true)[0]).toMatchObject({ kind: "reject", name: "יוסי" });
  });

  it("parses טעות and לא as reject (typo cancel)", () => {
    expect(parseCommands("טעות", 50, true)[0]).toMatchObject({ kind: "reject", name: "" });
    expect(parseCommands("לא", 50, true)[0]).toMatchObject({ kind: "reject", name: "" });
    expect(parseCommands("לא יכול", 50, false)).toHaveLength(0);
    expect(parseCommands("לא יכול", 50, true).some((c) => c.kind === "reject")).toBe(false);
  });

  it("drops the buy-in on טעות", () => {
    const pending = applyCommands(
      null,
      [{ kind: "add", name: "יוסי", amount: 100 }],
      "m-new",
      2,
      { knownNames: known }
    ).live;
    const { live, reply } = applyCommands(
      pending,
      [{ kind: "reject" }],
      "m-typo",
      2,
      { knownNames: known }
    );
    expect(live.players).toHaveLength(0);
    expect(live.pendingApprovals).toEqual([]);
    expect(reply).toContain("נדחה");
  });

  it("reminds Eden after cooldown, not immediately", () => {
    const t0 = 1_000_000;
    const pending = applyCommands(
      null,
      [{ kind: "add", name: "יוסי", amount: 100 }],
      "m-new",
      2,
      { knownNames: known, now: t0 }
    );
    expect(pending.ownerDm).toContain("שחקן חדש מחכה");
    expect(pending.live.pendingRemindedAt).toBe(t0);

    const soon = applyCommands(
      pending.live,
      [{ kind: "status" }],
      null,
      2,
      { knownNames: known, now: t0 + 60_000 }
    );
    expect(soon.ownerDm).toBeFalsy();
    expect(soon.reply).not.toMatch(/תזכורת/);

    const later = applyCommands(
      pending.live,
      [{ kind: "status" }],
      null,
      2,
      { knownNames: known, now: t0 + PENDING_REMIND_MS + 1000 }
    );
    expect(later.ownerDm).toContain("תזכורת");
    expect(later.reply).toContain("תזכורת");
    expect(later.live.pendingRemindedAt).toBe(t0 + PENDING_REMIND_MS + 1000);
  });

  it("maybeRemindPending stays quiet before cooldown", () => {
    const live = {
      pendingApprovals: [{ name: "יוסי", amount: 50, at: 1000 }],
      pendingRemindedAt: 1000,
    };
    expect(maybeRemindPending(live, 1000 + 60_000)).toBeNull();
    const due = maybeRemindPending(live, 1000 + PENDING_REMIND_MS);
    expect(due.ownerDm).toContain("יוסי");
    expect(due.reply).toBeNull();
  });
});

describe("closing list sort", () => {
  it("lists closed players winners then losers by net, open last", () => {
    const live = {
      closing: true,
      players: [
        { name: "דור", buyin: 150, cashout: "0" },
        { name: "עדן", buyin: 100, cashout: "80" },
        { name: "קובי", buyin: 50, cashout: "140" },
        { name: "פתוח", buyin: 50, cashout: "" },
      ],
    };
    const { reply } = applyCommands(live, [{ kind: "cashout", name: "עדן", chips: 80 }], "m-x", 2);
    expect(reply).toContain("מי הבא");
    const kobi = reply.indexOf("קובי");
    const eden = reply.indexOf("✅ עדן");
    const dor = reply.indexOf("דור");
    const open = reply.indexOf("פתוח");
    expect(kobi).toBeLessThan(eden);
    expect(eden).toBeLessThan(dor);
    expect(dor).toBeLessThan(open);
  });
});
