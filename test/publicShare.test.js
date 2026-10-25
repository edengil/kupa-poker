import { describe, expect, it } from "vitest";
import { snapshotForViewer, viewerCps } from "../lib/publicShare.js";
import { paymentPlan } from "../lib/paymentTracking.js";
import { NIGHT_24_10 } from "./fixtures/night-2026-10-24.js";

describe("publicShare", () => {
  it("keeps history when shareHistory is on or unset", () => {
    const snap = {
      config: {},
      data: { sessions: [{ id: "1" }], yearly: [{ y: 2026 }], monthly: [] },
    };
    expect(snapshotForViewer(snap).data.sessions).toHaveLength(1);
  });

  it("keeps only the latest session when shareHistory is false", () => {
    const snap = {
      config: { shareHistory: false },
      data: {
        sessions: [
          { id: "old", iso: "2026-08-01", d: 1, mo: 8, y: 2026, entries: [] },
          { id: "new", iso: "2026-09-10", d: 10, mo: 9, y: 2026, endedAt: 2000, entries: [] },
        ],
        yearly: [{ y: 2026 }],
        monthly: [{ mo: 1 }],
        plan: { iso: "2026-09-10" },
        roster: ["דן"],
        aliases: { דן: "דן ינקלויץ" },
      },
    };
    const out = snapshotForViewer(snap);
    expect(out.data.sessions).toHaveLength(1);
    expect(out.data.sessions[0].id).toBe("new");
    expect(out.data.yearly).toEqual([]);
    expect(out.data.monthly).toEqual([]);
    expect(out.data.plan).toEqual({ iso: "2026-09-10" });
    expect(out.data.roster).toEqual([]);
    expect(out.data.aliases).toEqual({ דן: "דן ינקלויץ" });
  });

  it("reads chips-per-shekel from config for viewers", () => {
    expect(viewerCps({ config: { chipsPerShekel: 4 } }, null)).toBe(4);
    expect(viewerCps({ config: { chipsPerShekel: 2 } }, { cps: 3 })).toBe(3);
  });

  it("F4: frozenActual לא דולף לצופה — מפת החוסר הקפואה כן נשארת", () => {
    const frozen = {
      ...NIGHT_24_10,
      manualSettlement: { ...NIGHT_24_10.manualSettlement, frozenActual: 70 },
    };
    const snap = { id: "g1", config: { shareHistory: true }, data: { sessions: [frozen] } };
    const out = snapshotForViewer(snap);
    expect(JSON.stringify(out)).not.toContain("frozenActual");
    const viewerSession = out.data.sessions[0];
    expect("frozenActual" in (viewerSession.manualSettlement || {})).toBe(false);
    // בלי frozenActual ה־manualSettlement של הצופה זהה לזה של המנהל
    const { frozenActual, ...expectedMs } = frozen.manualSettlement;
    expect(viewerSession.manualSettlement).toEqual(expectedMs);
    // וסכומי השחקנים שהצופה מחשב זהים לאלה של המנהל
    expect(paymentPlan(viewerSession).transfers).toEqual(paymentPlan(frozen).transfers);
  });

  it("F4: ערך הבפועל עצמו לא מופיע בשום מקום בסריאליזציית הצופה", () => {
    const session = {
      ...NIGHT_24_10,
      savingsPotActual: 17.25,
      manualSettlement: { ...NIGHT_24_10.manualSettlement, frozenActual: 17.25 },
    };
    const snap = { id: "g1", config: { shareHistory: true }, data: { sessions: [session] } };
    const serialized = JSON.stringify(snapshotForViewer(snap));
    expect(serialized).not.toContain("frozenActual");
    expect(serialized).not.toContain("17.25");
    expect(serialized).not.toContain("savingsPotActual");
  });
});
