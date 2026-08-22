import { describe, it, expect } from "vitest";
import {
  matchViewerToPlayer,
  computePersonalHighlights,
  knownPlayerNames,
} from "../components/poker/personalHighlights.js";
import { computeRecords } from "../components/poker/computeRecords.js";

function miniDb(extra = {}) {
  return {
    aliases: {},
    roster: ["עדן גיל", "אורן גיל", "דן ינקלויץ", "אופיר סנה"],
    yearly: [],
    sessions: [
      {
        iso: "2026-08-01",
        d: 1,
        mo: 8,
        y: 2026,
        entries: [
          { name: "עדן", amount: 400 },
          { name: "אורן", amount: 200 },
          { name: "דן", amount: -300 },
          { name: "אופיר", amount: -300 },
        ],
      },
      {
        iso: "2026-08-08",
        d: 8,
        mo: 8,
        y: 2026,
        entries: [
          { name: "עדן גיל", amount: 150 },
          { name: "דן ינקלויץ", amount: 50 },
          { name: "אופיר סנה", amount: -200 },
        ],
      },
    ],
    ...extra,
  };
}

describe("matchViewerToPlayer", () => {
  const db = miniDb();

  it("matches Hebrew full name", () => {
    expect(matchViewerToPlayer(db, { full_name: "עדן גיל" })).toBe("עדן גיל");
  });

  it("matches Latin Eden Gil → עדן גיל", () => {
    expect(matchViewerToPlayer(db, { full_name: "Eden Gil" })).toBe("עדן גיל");
    expect(matchViewerToPlayer(db, { name: "Eden Haim Gil" })).toBe("עדן גיל");
  });

  it("matches alias short Hebrew when unique", () => {
    expect(matchViewerToPlayer(db, { full_name: "אופיר" })).toBe("אופיר סנה");
  });

  it("refuses ambiguous עדן when multiple עדן* in table", () => {
    const crowded = miniDb({
      roster: ["עדן גיל", "עדן לירז", "אופיר סנה"],
      sessions: [
        {
          iso: "2026-08-01",
          d: 1,
          mo: 8,
          y: 2026,
          entries: [
            { name: "עדן גיל", amount: 10 },
            { name: "עדן לירז", amount: -10 },
          ],
        },
      ],
    });
    expect(matchViewerToPlayer(crowded, { full_name: "עדן" })).toBeNull();
    expect(matchViewerToPlayer(crowded, { full_name: "Eden" })).toBeNull();
    expect(matchViewerToPlayer(crowded, { full_name: "Eden Gil" })).toBe("עדן גיל");
  });

  it("returns null for unknown guest", () => {
    expect(matchViewerToPlayer(db, { full_name: "Random Guest" })).toBeNull();
    expect(matchViewerToPlayer(db, {})).toBeNull();
  });

  it("lists known players via aliases", () => {
    const names = knownPlayerNames(db);
    expect(names).toContain("עדן גיל");
    expect(names).toContain("דן ינקלויץ");
  });
});

describe("computePersonalHighlights", () => {
  it("returns podium items sorted 1st then 2nd then 3rd", () => {
    const db = miniDb();
    const items = computePersonalHighlights(db, "עדן גיל");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.place >= 1 && i.place <= 3)).toBe(true);
    for (let i = 1; i < items.length; i++) {
      expect(items[i].place).toBeGreaterThanOrEqual(items[i - 1].place);
    }
    expect(items.some((i) => /נטו|ערב השיא|רצף|כל הזמנים/.test(i.title))).toBe(true);
  });

  it("returns empty for unmatched / missing player", () => {
    expect(computePersonalHighlights(miniDb(), "מישהו")).toEqual([]);
    expect(computePersonalHighlights(miniDb(), null)).toEqual([]);
  });

  it("limits to at most 10", () => {
    const items = computePersonalHighlights(miniDb(), "עדן גיל");
    expect(items.length).toBeLessThanOrEqual(10);
  });
});

describe("computeRecords shared", () => {
  it("builds month kings from sessions", () => {
    const recs = computeRecords(miniDb());
    expect(recs.monthKing.name).toBe("עדן גיל");
    expect(recs.totalNights).toBe(2);
  });
});
