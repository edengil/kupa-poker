import { describe, it, expect } from "vitest";
import {
  liveFingerprint,
  mergeLiveStates,
  remoteLiveAhead,
  livePlayerKey,
  adoptRemoteLiveOnFlush,
} from "../lib/liveMerge.js";

const row = (players, short) => players.find((p) => p.name === livePlayerKey(short));

describe("liveFingerprint", () => {
  it("ignores ts so local saves do not look like remote changes", () => {
    const a = { players: [{ name: "דן", buyin: 50, cashout: "" }], ts: 1 };
    const b = { players: [{ name: "דן", buyin: 50, cashout: "" }], ts: 99 };
    expect(liveFingerprint(a)).toBe(liveFingerprint(b));
  });
});

describe("remoteLiveAhead", () => {
  it("detects new WhatsApp applied message ids", () => {
    const local = { applied: { m1: [] }, players: [] };
    const remote = { applied: { m1: [], m2: [] }, players: [] };
    expect(remoteLiveAhead(local, remote)).toBe(true);
    expect(remoteLiveAhead(remote, local)).toBe(false);
  });
});

describe("mergeLiveStates", () => {
  it("keeps bot cashouts when a stale local flush would wipe them", () => {
    const local = {
      applied: { m1: [{ t: "add" }] },
      players: [
        { name: "דן", buyin: 100, cashout: "" },
        { name: "קובי", buyin: 50, cashout: "" },
      ],
      closing: false,
    };
    const remote = {
      applied: { m1: [{ t: "add" }], m2: [{ t: "out", name: "דן" }] },
      players: [
        { name: "דן", buyin: 100, cashout: "300" },
        { name: "קובי", buyin: 50, cashout: "100" },
      ],
      closing: true,
      pending: null,
    };
    const merged = mergeLiveStates(local, remote);
    expect(row(merged.players, "דן").cashout).toBe("300");
    expect(row(merged.players, "קובי").cashout).toBe("100");
    expect(merged.closing).toBe(true);
    expect(merged.applied.m2).toBeTruthy();
  });

  it("keeps a newer local buyin while adopting remote cashouts", () => {
    const local = {
      applied: { m1: [] },
      players: [{ name: "דן", buyin: 150, cashout: "", buyinEvents: [{ amount: 50 }, { amount: 50 }, { amount: 50 }] }],
    };
    const remote = {
      applied: { m1: [], m2: [{ t: "out" }] },
      players: [{ name: "דן", buyin: 100, cashout: "200", buyinEvents: [{ amount: 50 }, { amount: 50 }] }],
    };
    const merged = mergeLiveStates(local, remote);
    expect(merged.players[0].buyin).toBe(150);
    expect(merged.players[0].cashout).toBe("200");
    expect(merged.players[0].buyinEvents).toHaveLength(3);
  });

  it("does not resurrect a cashout after local UI clear when bot is not ahead", () => {
    const local = {
      applied: { m1: [], m2: [] },
      players: [{ name: "דן", buyin: 100, cashout: "" }],
    };
    const remote = {
      applied: { m1: [], m2: [] },
      players: [{ name: "דן", buyin: 100, cashout: "300" }],
    };
    const merged = mergeLiveStates(local, remote);
    expect(merged.players[0].cashout).toBe("");
  });

  it("adopts empty cashout from bot reopen (חוזר)", () => {
    const local = {
      applied: { m1: [] },
      players: [{ name: "דן", buyin: 100, cashout: "300" }],
    };
    const remote = {
      applied: { m1: [], m3: [{ t: "out", before: "300" }] },
      players: [{ name: "דן", buyin: 100, cashout: "" }],
    };
    const merged = mergeLiveStates(local, remote);
    expect(merged.players[0].cashout).toBe("");
  });

  it("attaches WhatsApp cashout on full name to a local first-name Live row (יצא)", () => {
    const local = {
      applied: { m1: [{ t: "add" }] },
      players: [{ name: "אופיר", buyin: 150, cashout: "" }],
    };
    const remote = {
      applied: { m1: [{ t: "add" }], m2: [{ t: "out", name: "אופיר סנה" }] },
      players: [{ name: "אופיר סנה", buyin: 150, cashout: "280" }],
    };
    const merged = mergeLiveStates(local, remote);
    expect(merged.players).toHaveLength(1);
    expect(merged.players[0]).toMatchObject({
      name: "אופיר סנה",
      buyin: 150,
      cashout: "280",
    });
  });
});

describe("adoptRemoteLiveOnFlush", () => {
  it("adopts bot cashouts so Live יצא can remount with them", () => {
    const local = {
      applied: { m1: [] },
      players: [{ name: "שגיא", buyin: 250, cashout: "" }],
    };
    const remote = {
      applied: { m1: [], m2: [{ t: "out" }] },
      players: [{ name: "שגיא", buyin: 250, cashout: "400" }],
    };
    const { live, adopted } = adoptRemoteLiveOnFlush(local, remote);
    expect(adopted).toBe(true);
    expect(row(live.players, "שגיא").cashout).toBe("400");
    expect(row(live.players, "שגיא").name).toBe("שגיא גיל");
  });

  it("does not adopt when applied ids already match", () => {
    const local = {
      applied: { m1: [], m2: [] },
      players: [{ name: "שגיא", buyin: 250, cashout: "" }],
    };
    const remote = {
      applied: { m1: [], m2: [] },
      players: [{ name: "שגיא", buyin: 250, cashout: "400" }],
    };
    const { live, adopted } = adoptRemoteLiveOnFlush(local, remote);
    expect(adopted).toBe(false);
    expect(live.players[0].cashout).toBe("");
  });
});
