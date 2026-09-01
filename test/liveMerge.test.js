import { describe, it, expect } from "vitest";
import {
  liveFingerprint,
  mergeLiveStates,
  remoteLiveAhead,
} from "../lib/liveMerge.js";

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
    expect(merged.players.find((p) => p.name === "דן").cashout).toBe("300");
    expect(merged.players.find((p) => p.name === "קובי").cashout).toBe("100");
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
});
