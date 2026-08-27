import { describe, it, expect } from "vitest";
import {
  reconstructedChips,
  chatBuyinFor,
  resolveEntryChips,
  chipReconstructionCoverage,
  MAX_RECOVERABLE_BUYIN,
} from "../components/poker/reconstructChips.js";
import { computeChipRecords } from "../components/poker/chipRecords.js";
import { buildSeedDb } from "../components/poker/seed.js";

describe("reconstructedChips formula", () => {
  it("matches Eden 18.7: buyin 300 + net 185 at cps 2 → 970 chips", () => {
    expect(reconstructedChips({ buyin: 300, net: 185, cps: 2 })).toBe(970);
  });

  it("returns 0 when the player busts the full buyin", () => {
    expect(reconstructedChips({ buyin: 150, net: -150, cps: 2 })).toBe(0);
  });

  it("skips missing buyin, negative chips, or oversized buyin", () => {
    expect(reconstructedChips({ buyin: null, net: 100 })).toBeNull();
    expect(reconstructedChips({ buyin: 50, net: -80 })).toBeNull();
    expect(reconstructedChips({ buyin: MAX_RECOVERABLE_BUYIN + 1, net: 0 })).toBeNull();
  });
});

describe("chatBuyinFor", () => {
  it("uses last snapshot b, does not sum increment amounts", () => {
    expect(chatBuyinFor("עדן", "2024-06-04", {}, {
      "עדן גיל": { "2024-06-04": { n: 3, a: [50, 50, 50], b: 150 } },
    })).toBe(150);
    expect(chatBuyinFor("אופיר סנה", "2026-07-15", {}, {
      "אופיר סנה": { "2026-07-15": { n: 1, a: [50, 50, 50], b: 50 } },
    })).toBe(50);
  });

  it("matches the previous calendar day when the session was saved after midnight", () => {
    expect(chatBuyinFor("עדן גיל", "2024-06-05", {}, {
      "עדן גיל": { "2024-06-04": { n: 3, a: [50, 50, 50], b: 150 } },
    })).toBe(150);
  });

  it("skips implied buyin over MAX", () => {
    expect(chatBuyinFor("אופיר סנה", "2026-07-26", {}, {
      "אופיר סנה": { "2026-07-26": { n: 60, a: [50] } },
    })).toBeNull();
  });
});

describe("resolveEntryChips", () => {
  const map = {
    "עדן גיל": { "2026-08-01": { n: 3, a: [50, 50, 50] } },
  };

  it("prefers Eden formula over stored chips", () => {
    const r = resolveEntryChips(
      { name: "עדן גיל", amount: 185, chips: 430, buyin: 300 },
      { iso: "2026-07-18", nightsMap: {} }
    );
    expect(r).toMatchObject({ chips: 970, source: "buyin+net", buyin: 300 });
  });

  it("uses entry buyin when present", () => {
    const r = resolveEntryChips(
      { name: "עדן גיל", amount: 100, buyin: 150 },
      { iso: "2026-08-01", nightsMap: {} }
    );
    expect(r).toMatchObject({ chips: 500, source: "buyin+net", buyin: 150 });
  });

  it("falls back to chat buyin", () => {
    const r = resolveEntryChips(
      { name: "עדן גיל", amount: 100 },
      { iso: "2026-08-01", nightsMap: map }
    );
    expect(r).toMatchObject({ chips: 500, source: "chat+net", buyin: 150 });
  });

  it("skips a player-night with net but no recoverable buyin", () => {
    const r = resolveEntryChips(
      { name: "אורח", amount: 80 },
      { iso: "2020-01-01", nightsMap: map }
    );
    expect(r.chips).toBeNull();
    expect(r.source).toBeNull();
  });
});

describe("chip records with reconstructed cashouts", () => {
  it("counts a historical night from buyin+net", () => {
    const recs = computeChipRecords({
      aliases: {},
      sessions: [
        {
          iso: "2024-01-01",
          d: 1,
          mo: 1,
          y: 2024,
          entries: [{ name: "עדן גיל", amount: 100, buyin: 150 }],
        },
      ],
    });
    expect(recs.bestCashout).toMatchObject({ name: "עדן גיל", chips: 500 });
    expect(recs.nightsWithChips).toBe(1);
  });

  it("still skips a net-only night with no chat buyin", () => {
    const recs = computeChipRecords({
      aliases: {},
      sessions: [
        {
          iso: "2020-01-01",
          d: 1,
          mo: 1,
          y: 2020,
          entries: [{ name: "אורח", amount: 999 }],
        },
      ],
    });
    expect(recs).toBeNull();
  });
});

describe("coverage on seed history", () => {
  it("reconstructs most seed player-nights from chat buyins", () => {
    const cov = chipReconstructionCoverage(buildSeedDb());
    expect(cov.reconstructed).toBeGreaterThan(50);
    expect(cov.nightsWithChips).toBeGreaterThan(20);
    expect(cov.skipped).toBeGreaterThanOrEqual(0);
  });
});
