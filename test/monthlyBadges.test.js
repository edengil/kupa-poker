import { describe, it, expect } from "vitest";
import { computeMonthlyBadges, monthlyBadgesForPlayer } from "../lib/poker/monthlyBadges.js";

function night(iso, entries, extra = {}) {
  const [y, mo, d] = iso.split("-").map(Number);
  return {
    id: iso,
    iso,
    d,
    mo,
    y,
    entries: Object.entries(entries).map(([name, amount]) =>
      typeof amount === "object" ? { name, ...amount } : { name, amount }
    ),
    ...extra,
  };
}

/* "עכשיו" = 15.10.2026: אוגוסט וספטמבר הסתיימו, אוקטובר הוא החודש הנוכחי (פתוח) */
const NOW = new Date(2026, 9, 15);

const db = {
  aliases: {},
  roster: [],
  yearly: [],
  sessions: [
    night("2026-08-03", { "עדן גיל": { amount: 200, tipsGiven: 30 }, "קובי סעדה": -200 }),
    night("2026-08-10", {
      "עדן גיל": 100,
      "קובי סעדה": { amount: -50, tipsGiven: 5 },
      "נתנאל כהן": -50,
    }),
    night("2026-08-17", { "קובי סעדה": 300, "עדן גיל": { amount: -300, tipsGiven: 20 } }),
    night("2026-09-07", { "נתנאל כהן": { amount: 150, tipsGiven: 40 }, "עדן גיל": -150 }),
    night("2026-09-14", { "עדן גיל": 90, "נתנאל כהן": -90 }),
    night("2026-09-21", { "עדן גיל": { amount: 60, tipsGiven: 10 }, "קובי סעדה": -60 }),
    /* החודש הנוכחי — לא אמור להוליד תגים */
    night("2026-10-05", { "עדן גיל": { amount: 500, tipsGiven: 99 }, "קובי סעדה": -500 }),
  ],
};

describe("computeMonthlyBadges", () => {
  it("returns null without sessions", () => {
    expect(computeMonthlyBadges(null)).toBeNull();
    expect(computeMonthlyBadges({ sessions: [] })).toBeNull();
  });

  it("awards the right winner per category, computed only from that month", () => {
    const all = computeMonthlyBadges(db, { now: NOW });
    const kobi = (all.perPlayer["קובי סעדה"] || []).map((b) => b.id);
    expect(kobi).toContain("monthKing:2026-08"); // נטו אוגוסט: קובי +50, היחיד בחיובי
    expect(kobi).toContain("bestNight:2026-08"); // ‎+300 בערב אחד

    const edenAug = (all.perPlayer["עדן גיל"] || []).find((b) => b.id === "tipKing:2026-08");
    expect(edenAug).toBeTruthy(); // ‎50 ג' טיפ באוגוסט מול 5 של קובי
    expect(edenAug.label).toBe("מלך הטיפים · אוגוסט 2026");

    const natSep = (all.perPlayer["נתנאל כהן"] || []).map((b) => b.id);
    expect(natSep).toContain("monthKing:2026-09");
    expect(natSep).toContain("tipKing:2026-09");
    expect(natSep).toContain("bestNight:2026-09"); // ‎+150

    const edenSep = (all.perPlayer["עדן גיל"] || []).map((b) => b.id);
    expect(edenSep).toContain("mostNights:2026-09"); // 3 ערבים בספטמבר
    expect(edenSep).not.toContain("tipKing:2026-09"); // בספטמבר נתנאל נתן יותר
  });

  it("does not award badges for the current (unfinished) month", () => {
    const all = computeMonthlyBadges(db, { now: NOW });
    const ids = Object.values(all.perPlayer).flat().map((b) => b.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => !id.endsWith(":2026-10"))).toBe(true);
    expect(all.months.map((m) => m.label)).toEqual(["ספטמבר 2026", "אוגוסט 2026"]);
  });

  it("is retroactive: past months earn badges from history", () => {
    const eden = monthlyBadgesForPlayer(db, "עדן גיל", { now: NOW });
    expect(eden.some((b) => b.mo === 8)).toBe(true);
    expect(eden.some((b) => b.mo === 9)).toBe(true);
    /* מיון: החודש החדש קודם */
    expect(eden[0].mo).toBe(9);
  });

  it("at is the end of the winning month", () => {
    const eden = monthlyBadgesForPlayer(db, "עדן גיל", { now: NOW });
    expect(eden.find((b) => b.id === "tipKing:2026-08").at).toBe("2026-08-31");
    expect(eden.find((b) => b.id === "mostNights:2026-09").at).toBe("2026-09-30");
  });

  it("an empty month does not crash and yields no badges", () => {
    const onlyCurrent = {
      aliases: {},
      roster: [],
      yearly: [],
      sessions: [night("2026-10-05", { "עדן גיל": 100, "קובי סעדה": -100 })],
    };
    const all = computeMonthlyBadges(onlyCurrent, { now: NOW });
    expect(all).toEqual({ perPlayer: {}, earnedCount: 0, months: [] });
    expect(monthlyBadgesForPlayer(onlyCurrent, "עדן גיל", { now: NOW })).toEqual([]);
    expect(monthlyBadgesForPlayer(null, "עדן גיל")).toEqual([]);
  });

  it("a month where nobody is positive gets no monthKing or bestNight badge", () => {
    const negDb = {
      aliases: {},
      roster: [],
      yearly: [],
      sessions: [
        night("2026-08-03", { "עדן גיל": 0, "קובי סעדה": 0 }),
        night("2026-08-10", { "עדן גיל": 0, "קובי סעדה": 0 }),
      ],
    };
    const all = computeMonthlyBadges(negDb, { now: NOW });
    const kinds = Object.values(all.perPlayer).flat().map((b) => b.kind);
    expect(kinds).not.toContain("monthKing");
    expect(kinds).not.toContain("bestNight");
    expect(kinds).toContain("mostNights"); // נוכחות כן נחשבת
  });
});
