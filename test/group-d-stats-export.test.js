import { describe, it, expect } from "vitest";
import {
  computeExtraRecords,
  computePartnerEdges,
  formatNightClock,
  nightMinutes,
} from "../components/poker/extraRecords.js";
import {
  computePersonalStats,
  personalStatRows,
} from "../components/poker/personalStats.js";
import { sessionsToCsv, playersToCsv } from "../components/poker/csvExport.js";

function dbOf(sessions, aliases = {}) {
  return { aliases, roster: [], yearly: [], sessions };
}

describe("D12 arrival / avg first entry", () => {
  it("ranks latest average first buy-in and surfaces in personal rows", () => {
    const tLate = Date.parse("2026-08-01T23:30:00+03:00");
    const tEarly = Date.parse("2026-08-01T20:00:00+03:00");
    const nightsMap = {
      "עדן גיל": {
        "2026-08-01": { n: 1, t: [tLate], a: [50] },
        "2026-08-08": { n: 1, t: [tLate + 7 * 86400000], a: [50] },
        "2026-08-15": { n: 1, t: [tLate + 14 * 86400000], a: [50] },
        "2026-08-22": { n: 1, t: [tLate + 21 * 86400000], a: [50] },
        "2026-08-29": { n: 1, t: [tLate + 28 * 86400000], a: [50] },
      },
      "קובי סעדה": {
        "2026-08-01": { n: 1, t: [tEarly], a: [50] },
        "2026-08-08": { n: 1, t: [tEarly + 7 * 86400000], a: [50] },
        "2026-08-15": { n: 1, t: [tEarly + 14 * 86400000], a: [50] },
        "2026-08-22": { n: 1, t: [tEarly + 21 * 86400000], a: [50] },
        "2026-08-29": { n: 1, t: [tEarly + 28 * 86400000], a: [50] },
      },
    };
    const sessions = ["01", "08", "15", "22", "29"].map((d) => ({
      iso: `2026-08-${d}`,
      d: +d,
      mo: 8,
      y: 2026,
      entries: [
        { name: "עדן", amount: 10, buyin: 50 },
        { name: "קובי", amount: -10, buyin: 50 },
      ],
    }));
    const extra = computeExtraRecords(dbOf(sessions), {
      nightsMap,
      spans: {},
      hostsMap: {},
    });
    expect(extra.latest.name).toBe("עדן גיל");
    expect(formatNightClock(extra.latest.avgFirstMins)).toBe("23:30");
    expect(extra.earliest.name).toBe("קובי סעדה");

    const personal = computePersonalStats(dbOf(sessions), "עדן", {
      chatNights: nightsMap["עדן גיל"],
    });
    expect(personal.avgFirstMins).toBeCloseTo(nightMinutes(tLate));
    const rows = personalStatRows(personal, { compact: true });
    expect(rows.some((r) => r.title === "שעת כניסה ראשונה ממוצעת")).toBe(true);
  });
});

describe("D13 record pot", () => {
  it("picks night with max total buyins", () => {
    const sessions = [
      {
        iso: "2026-08-01",
        d: 1,
        mo: 8,
        y: 2026,
        entries: [
          { name: "א", amount: 10, buyin: 100 },
          { name: "ב", amount: -5, buyin: 100 },
          { name: "ג", amount: -5, buyin: 100 },
        ],
      },
      {
        iso: "2026-08-08",
        d: 8,
        mo: 8,
        y: 2026,
        entries: [
          { name: "א", amount: 20, buyin: 200 },
          { name: "ב", amount: -10, buyin: 200 },
          { name: "ג", amount: -10, buyin: 150 },
        ],
      },
    ];
    const extra = computeExtraRecords(dbOf(sessions), {
      nightsMap: {},
      spans: {},
      hostsMap: {},
    });
    expect(extra.pot.iso).toBe("2026-08-08");
    expect(extra.pot.buyin).toBe(550);
    expect(extra.pot.players).toBe(3);
  });
});

describe("D15 partner edges", () => {
  it("finds who you profit with at the same table", () => {
    const sessions = [];
    for (let i = 1; i <= 4; i++) {
      sessions.push({
        iso: `2026-08-0${i}`,
        d: i,
        mo: 8,
        y: 2026,
        entries: [
          { name: "עדן", amount: 100, buyin: 50 },
          { name: "קובי", amount: -50, buyin: 50 },
          { name: "נתנאל", amount: -50, buyin: 50 },
        ],
      });
    }
    for (let i = 5; i <= 8; i++) {
      sessions.push({
        iso: `2026-08-0${i}`,
        d: i,
        mo: 8,
        y: 2026,
        entries: [
          { name: "עדן", amount: -80, buyin: 50 },
          { name: "אופיר", amount: 40, buyin: 50 },
          { name: "נתנאל", amount: 40, buyin: 50 },
        ],
      });
    }
    const edges = computePartnerEdges(dbOf(sessions), "עדן", { minTogether: 4 });
    expect(edges.best.name).toBe("קובי סעדה");
    expect(edges.best.avg).toBe(100);
    expect(edges.worst.name).toMatch(/אופיר/);

    const rows = personalStatRows(computePersonalStats(dbOf(sessions), "עדן"));
    const partner = rows.find((r) => /עם מי מרוויחים/.test(r.title));
    expect(partner).toBeTruthy();
    expect(partner.detail).toMatch(/קובי/);
  });
});

describe("D18 CSV export", () => {
  it("builds Hebrew-header session and player CSVs", () => {
    const db = dbOf(
      [
        {
          iso: "2026-08-01",
          d: 1,
          mo: 8,
          y: 2026,
          location: "אצל עדן",
          entries: [
            { name: "עדן", amount: 40, buyin: 100, tipsGiven: 5 },
            { name: "קובי", amount: -40, buyin: 50 },
          ],
        },
      ],
      {}
    );
    const sessions = sessionsToCsv(db);
    expect(sessions.startsWith("\uFEFF")).toBe(true);
    expect(sessions).toMatch(/תאריך,שחקן,נטו,קנייה/);
    expect(sessions).toMatch(/2026-08-01,עדן גיל,40,100/);
    expect(sessions).toMatch(/אצל עדן/);

    const players = playersToCsv(db);
    expect(players).toMatch(/שחקן,ערבים,נטו כולל/);
    expect(players).toMatch(/עדן גיל,1,40/);
  });
});

describe("D14 hosted net", () => {
  it("surfaces נטו כשמארחים אצלך in personal rows (incl. compact)", () => {
    const sessions = [
      {
        iso: "2026-08-01",
        d: 1,
        mo: 8,
        y: 2026,
        location: "אצל עדן",
        entries: [
          { name: "עדן", amount: 80, buyin: 50 },
          { name: "קובי", amount: -80, buyin: 50 },
        ],
      },
      {
        iso: "2026-08-08",
        d: 8,
        mo: 8,
        y: 2026,
        location: "אצל עדן",
        entries: [
          { name: "עדן", amount: -30, buyin: 50 },
          { name: "קובי", amount: 30, buyin: 50 },
        ],
      },
      {
        iso: "2026-08-15",
        d: 15,
        mo: 8,
        y: 2026,
        location: "אצל אופיר",
        entries: [
          { name: "עדן", amount: 10, buyin: 50 },
          { name: "קובי", amount: -10, buyin: 50 },
        ],
      },
    ];
    const withHosts = computePersonalStats(dbOf(sessions), "עדן");
    expect(withHosts.hostedCount).toBe(2);
    expect(withHosts.hostedNet).toBe(50);

    const full = personalStatRows(withHosts);
    const compact = personalStatRows(withHosts, { compact: true });
    const row = full.find((r) => r.title === "נטו כשמארחים אצלך");
    expect(row).toBeTruthy();
    expect(row.detail).toMatch(/2 פעמים/);
    expect(compact.some((r) => r.title === "נטו כשמארחים אצלך")).toBe(true);
  });
});
