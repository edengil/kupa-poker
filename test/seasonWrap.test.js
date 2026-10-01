import { describe, it, expect } from "vitest";
import { computeSeasonWrap, seasonWrapText } from "../lib/poker/seasonWrap.js";

function night(iso, entries, extra = {}) {
  const [y, mo, d] = iso.split("-").map(Number);
  return {
    id: iso,
    iso,
    d,
    mo,
    y,
    entries: Object.entries(entries).map(([name, amount]) => ({ name, amount })),
    ...extra,
  };
}

/* תאריכי 2027 — מחוץ לטווח של CHAT_NIGHT_SPANS, כדי שמשך הערב יבוא רק מ־startedAt/endedAt */
const T0 = new Date("2027-05-06T20:00:00").getTime();
const db = {
  aliases: {},
  roster: [],
  yearly: [],
  sessions: [
    night("2027-05-06", { "עדן גיל": 300, "קובי סעדה": -300 }, { startedAt: T0, endedAt: T0 + 4 * 3600e3 }),
    night("2027-05-13", { "עדן גיל": 200, "קובי סעדה": -200 }),
    night("2027-05-20", { "עדן גיל": -100, "קובי סעדה": 100 }),
    night("2027-05-27", { "עדן גיל": 150, "קובי סעדה": -150 }),
    night("2026-06-01", { "עדן גיל": 5000, "קובי סעדה": -5000 }),
  ],
};

describe("computeSeasonWrap", () => {
  it("returns null for a year without nights", () => {
    expect(computeSeasonWrap(db, 2024)).toBeNull();
    expect(computeSeasonWrap(null, 2027)).toBeNull();
  });

  it("per-player card: best night, streak, hours, net", () => {
    const wrap = computeSeasonWrap(db, 2027);
    expect(wrap.nights).toBe(4);
    const eden = wrap.players.find((p) => p.name === "עדן גיל");
    expect(eden.net).toBe(550);
    expect(eden.bestNight.amount).toBe(300);
    expect(eden.bestNight.d).toBe(6);
    expect(eden.maxStreak).toBe(2);
    expect(eden.hoursMs).toBe(4 * 3600e3);
    expect(eden.hoursKnown).toBe(1);
    expect(eden.crowns).toBe(1);
  });

  it("king of the year is the year's top net", () => {
    const wrap = computeSeasonWrap(db, 2027);
    expect(wrap.king.name).toBe("עדן גיל");
    expect(wrap.king.amount).toBe(550);
  });

  it("nemesis inside the year with a low seatmate average", () => {
    const wrap = computeSeasonWrap(db, 2027);
    const eden = wrap.players.find((p) => p.name === "עדן גיל");
    // רק יריב אחד בשנה הזו — אין גם הטוב ביותר וגם נמסיס
    expect(eden.bestPartner?.name).toBe("קובי סעדה");
    expect(eden.nemesis).toBeNull();
  });
});

describe("seasonWrapText", () => {
  it("group text mentions the king and the year", () => {
    const text = seasonWrapText(db, 2027);
    expect(text).toContain("2027");
    expect(text).toContain("עדן גיל");
    expect(text).toContain("מלך השנה");
  });

  it("personal text focuses on the player's card", () => {
    const text = seasonWrapText(db, 2027, "עדן");
    expect(text).toContain("הכרטיס של עדן גיל");
    expect(text).toContain("ערב השיא");
  });

  it("empty string when no data", () => {
    expect(seasonWrapText(db, 2024)).toBe("");
  });
});
