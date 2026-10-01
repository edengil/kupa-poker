import { describe, it, expect } from "vitest";
import { computeHeadToHead, playerRivals } from "../lib/poker/headToHead.js";

function dbOf(nights) {
  return { aliases: {}, roster: [], yearly: [], sessions: nights };
}

function night(iso, entries, i = 0) {
  const [y, mo, d] = iso.split("-").map(Number);
  return {
    id: `s${i}-${iso}`,
    iso,
    d,
    mo,
    y,
    entries: Object.entries(entries).map(([name, amount]) => ({ name, amount })),
  };
}

/* עדן מרוויח כשקובי בשולחן, מפסיד כשנתנאל בשולחן */
const db = dbOf([
  night("2026-01-01", { "עדן גיל": 100, "קובי סעדה": -100 }, 1),
  night("2026-01-08", { "עדן גיל": 120, "קובי סעדה": -60, "דור לירז": -60 }, 2),
  night("2026-01-15", { "עדן גיל": 80, "קובי סעדה": -80 }, 3),
  night("2026-01-22", { "עדן גיל": -90, "נתנאל כהן": 90 }, 4),
  night("2026-01-29", { "עדן גיל": -70, "נתנאל כהן": 70 }, 5),
  night("2026-02-05", { "עדן גיל": -110, "נתנאל כהן": 110 }, 6),
]);

describe("computeHeadToHead", () => {
  it("returns null without sessions", () => {
    expect(computeHeadToHead(null)).toBeNull();
    expect(computeHeadToHead({ sessions: [] })).toBeNull();
  });

  it("counts shared nights and nets per pair", () => {
    const h = computeHeadToHead(db, { minTogether: 2 });
    const pair = h.pairList.find((p) => p.a === "עדן גיל" || p.b === "עדן גיל");
    const edenKobi = h.pairList.find(
      (p) => [p.a, p.b].includes("עדן גיל") && [p.a, p.b].includes("קובי סעדה")
    );
    expect(edenKobi.nights).toBe(3);
    const edenNet = edenKobi.a === "עדן גיל" ? edenKobi.aNet : edenKobi.bNet;
    expect(edenNet).toBe(300);
    expect(pair).toBeTruthy();
  });

  it("best partner is the most profitable seatmate, nemesis is the worst", () => {
    const eden = playerRivals(db, "עדן גיל", { minTogether: 2 });
    expect(eden.bestPartner.name).toBe("קובי סעדה");
    expect(eden.bestPartner.avg).toBe(100);
    expect(eden.nemesis.name).toBe("נתנאל כהן");
    expect(eden.nemesis.avg).toBe(-90);
  });

  it("respects minTogether", () => {
    const eden = playerRivals(db, "עדן גיל", { minTogether: 4 });
    expect(eden.bestPartner).toBeNull();
    expect(eden.nemesis).toBeNull();
  });

  it("canonicalizes aliases", () => {
    expect(playerRivals(db, "עדן", { minTogether: 2 }).bestPartner.name).toBe("קובי סעדה");
  });

  it("topRivalries puts long-running pairs first", () => {
    const h = computeHeadToHead(db, { minTogether: 2 });
    expect(h.topRivalries.length).toBeGreaterThan(0);
    expect(h.topRivalries[0].nights).toBe(3);
  });
});
