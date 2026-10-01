import { describe, it, expect } from "vitest";
import { computeHeadToHead, playerRivals, headToHeadYears } from "../lib/poker/headToHead.js";

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

/* שתי שנים עם תמונת יריבויות הפוכה: ב־2025 קובי הוא השותף ונתנאל הנמסיס,
   וב־2026 זה מתהפך. */
const dbYears = dbOf([
  night("2025-01-02", { "עדן גיל": 100, "קובי סעדה": -100 }, 11),
  night("2025-01-09", { "עדן גיל": 120, "קובי סעדה": -120 }, 12),
  night("2025-01-16", { "עדן גיל": -80, "נתנאל כהן": 80 }, 13),
  night("2025-01-23", { "עדן גיל": -100, "נתנאל כהן": 100 }, 14),
  night("2026-03-05", { "עדן גיל": -100, "קובי סעדה": 100 }, 15),
  night("2026-03-12", { "עדן גיל": -120, "קובי סעדה": 120 }, 16),
  night("2026-03-19", { "עדן גיל": 90, "נתנאל כהן": -90 }, 17),
  night("2026-03-26", { "עדן גיל": 110, "נתנאל כהן": -110 }, 18),
]);

describe("computeHeadToHead year filter", () => {
  it("counts only nights of the requested year", () => {
    const h2025 = computeHeadToHead(dbYears, { year: 2025, minTogether: 2 });
    expect(h2025.forPlayer["עדן גיל"].nights).toBe(4);
    const edenKobi = h2025.pairList.find(
      (p) => [p.a, p.b].includes("עדן גיל") && [p.a, p.b].includes("קובי סעדה")
    );
    expect(edenKobi.nights).toBe(2);

    const h2026 = computeHeadToHead(dbYears, { year: 2026, minTogether: 2 });
    expect(h2026.forPlayer["עדן גיל"].nights).toBe(4);
    const edenNet = h2026.pairList.find(
      (p) => [p.a, p.b].includes("עדן גיל") && [p.a, p.b].includes("נתנאל כהן")
    );
    const net = edenNet.a === "עדן גיל" ? edenNet.aNet : edenNet.bNet;
    expect(net).toBe(200);
  });

  it("returns null for a year without nights", () => {
    expect(computeHeadToHead(dbYears, { year: 2027 })).toBeNull();
    expect(playerRivals(dbYears, "עדן גיל", { year: 2027 })).toBeNull();
  });

  it("nemesis changes between years", () => {
    const r2025 = playerRivals(dbYears, "עדן גיל", { year: 2025, minTogether: 2 });
    expect(r2025.bestPartner.name).toBe("קובי סעדה");
    expect(r2025.nemesis.name).toBe("נתנאל כהן");

    const r2026 = playerRivals(dbYears, "עדן גיל", { year: 2026, minTogether: 2 });
    expect(r2026.bestPartner.name).toBe("נתנאל כהן");
    expect(r2026.nemesis.name).toBe("קובי סעדה");
  });

  it("without a year it is the all-time behavior (default unchanged)", () => {
    const all = playerRivals(dbYears, "עדן גיל", { minTogether: 2 });
    expect(all.nights).toBe(8);
    expect(all.bestPartner.name).toBe("נתנאל כהן");
    expect(all.bestPartner.avg).toBe(5);
    expect(all.nemesis.name).toBe("קובי סעדה");
    expect(all.nemesis.avg).toBe(0);

    /* כשהכול בשנה אחת, סינון לאותה שנה זהה לברירת המחדל */
    const only2026 = computeHeadToHead(db, { minTogether: 2 });
    const filtered = computeHeadToHead(db, { year: 2026, minTogether: 2 });
    expect(filtered.pairList.map((p) => [p.a, p.b, p.nights, p.aNet, p.bNet])).toEqual(
      only2026.pairList.map((p) => [p.a, p.b, p.nights, p.aNet, p.bNet])
    );
  });

  it("falls back to iso when a session has no y", () => {
    const dbIsoOnly = dbOf([
      {
        id: "iso1",
        iso: "2024-05-01",
        d: 1,
        mo: 5,
        entries: [
          { name: "עדן גיל", amount: 50 },
          { name: "קובי סעדה", amount: -50 },
        ],
      },
      {
        id: "iso2",
        iso: "2024-05-08",
        d: 8,
        mo: 5,
        entries: [
          { name: "עדן גיל", amount: 70 },
          { name: "קובי סעדה", amount: -70 },
        ],
      },
    ]);
    const h = computeHeadToHead(dbIsoOnly, { year: 2024, minTogether: 2 });
    expect(h).not.toBeNull();
    expect(h.forPlayer["עדן גיל"].nights).toBe(2);
    expect(headToHeadYears(dbIsoOnly)).toEqual([2024]);
  });

  it("headToHeadYears lists years with nights, descending", () => {
    expect(headToHeadYears(dbYears)).toEqual([2026, 2025]);
    expect(headToHeadYears(db)).toEqual([2026]);
    expect(headToHeadYears({ sessions: [] })).toEqual([]);
  });
});

/* בחירת שותף/נמסיס מודעת־תדירות: הציון הוא הנטו הכולל בערבים המשותפים (sum),
   מעל סף HEAD_TO_HEAD_MIN — לא ממוצע לערב בלבד. */
function manyNights(rivalName, count, edenAmount, startOffset) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(Date.UTC(2026, 0, 1 + startOffset + i));
    const iso = dt.toISOString().slice(0, 10);
    out.push(night(iso, { "עדן גיל": edenAmount, [rivalName]: -edenAmount }, 1000 + startOffset + i));
  }
  return out;
}

describe("frequency-aware nemesis and partner", () => {
  const dbFreq = dbOf([
    ...manyNights("נדיר קיצוני", 3, -100, 0), // ממוצע −100, סכום −300
    ...manyNights("קבוע בינוני", 20, -20, 10), // ממוצע −20, סכום −400
    ...manyNights("נדיר חיובי", 3, 100, 40), // ממוצע +100, סכום +300
    ...manyNights("קבוע חיובי", 20, 20, 50), // ממוצע +20, סכום +400
  ]);

  it("a rare rival with a terrible average in 3 nights does not beat a frequent rival in 20", () => {
    const eden = playerRivals(dbFreq, "עדן גיל"); // minTogether ברירת מחדל = 3
    expect(eden.nemesis.name).toBe("קבוע בינוני");
    expect(eden.nemesis.nights).toBe(20);
    expect(eden.nemesis.avg).toBe(-20);
    expect(eden.nemesis.sum).toBe(-400);
  });

  it("best partner is frequency-aware too", () => {
    const eden = playerRivals(dbFreq, "עדן גיל");
    expect(eden.bestPartner.name).toBe("קבוע חיובי");
    expect(eden.bestPartner.nights).toBe(20);
    expect(eden.bestPartner.sum).toBe(400);
  });
});
