import { describe, expect, it } from "vitest";
import { snapshotForViewer, viewerCps } from "../lib/publicShare.js";

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
});
