import { describe, it, expect } from "vitest";
import { applyChipBackfill, lookupChips, CHIP_BACKFILL } from "../components/poker/chipBackfill.js";
import { DEFAULT_ALIASES } from "../components/poker/helpers.js";

describe("chip backfill from WhatsApp August 2026", () => {
  it("has four nights from the closing bot", () => {
    expect(Object.keys(CHIP_BACKFILL).sort()).toEqual([
      "2026-08-06",
      "2026-08-08",
      "2026-08-11",
      "2026-08-16",
    ]);
  });

  it("matches aliases like קובי → קובי סעדה", () => {
    const map = CHIP_BACKFILL["2026-08-06"];
    expect(lookupChips(map, "קובי סעדה", DEFAULT_ALIASES)).toBe(400);
    expect(lookupChips(map, "אורן", DEFAULT_ALIASES)).toBe(1450);
  });

  it("fills missing chips on matching session iso", () => {
    const db = {
      aliases: {},
      sessions: [
        {
          iso: "2026-08-16",
          d: 16,
          mo: 8,
          y: 2026,
          entries: [
            { name: "אורן גיל", amount: 500 },
            { name: "עדן גיל", amount: -10 },
          ],
        },
      ],
    };
    expect(applyChipBackfill(db)).toBe(true);
    expect(db.sessions[0].entries[0].chips).toBe(1840);
    expect(db.sessions[0].entries[1].chips).toBe(345);
  });

  it("uses previous calendar day when night was saved after midnight", () => {
    const db = {
      aliases: {},
      sessions: [
        {
          iso: "2026-08-07", // נשמר ב־7.8 לפנות בוקר, הערב היה 6.8
          entries: [{ name: "אורן גיל", amount: 525 }],
        },
      ],
    };
    expect(applyChipBackfill(db)).toBe(true);
    expect(db.sessions[0].entries[0].chips).toBe(1450);
  });

  it("does not overwrite existing chips", () => {
    const db = {
      aliases: {},
      sessions: [
        {
          iso: "2026-08-16",
          entries: [{ name: "אורן גיל", amount: 500, chips: 999 }],
        },
      ],
    };
    expect(applyChipBackfill(db)).toBe(false);
    expect(db.sessions[0].entries[0].chips).toBe(999);
  });
});
