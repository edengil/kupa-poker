import { describe, it, expect, vi, afterEach } from "vitest";
import { parseCommands, applyCommands, BOT_MARK } from "../lib/whatsapp.js";
import { nextTipCompliment, formatTipCompliment, TIP_COMPLIMENTS } from "../lib/tipCompliments.js";
import { computeChipRecords, bestChipCashout } from "../components/poker/chipRecords.js";
import { applyCoupleFill, partnerOf, computeCoupleFillRecords, summarizeCoupleFills, formatFillBadge, DEFAULT_FILL_CHIPS, FILL_COUPLES } from "../components/poker/coupleFills.js";
import { computeTipRecords } from "../components/poker/tipRecords.js";
import {
  sessionDurationMs,
  timedSessions,
  computeDurationRecords,
} from "../components/poker/durationRecords.js";

describe("tip commands", () => {
  it("parses אופיר טיפ 10", () => {
    const cmds = parseCommands("אופיר טיפ 10", 50, true);
    expect(cmds[0]).toMatchObject({ kind: "tip", name: "אופיר", chips: 10 });
  });

  it("parses אופיר נתן טיפ 10", () => {
    const cmds = parseCommands("אופיר נתן טיפ 10", 50, true);
    expect(cmds[0]).toMatchObject({ kind: "tip", name: "אופיר", chips: 10 });
  });

  it("parses אופיר 10 טיפ", () => {
    const cmds = parseCommands("אופיר 10 טיפ", 50, true);
    expect(cmds[0]).toMatchObject({ kind: "tip", name: "אופיר", chips: 10 });
  });

  it("parses אופיר 10 טיפים", () => {
    const cmds = parseCommands("אופיר 10 טיפים", 50, true);
    expect(cmds[0]).toMatchObject({ kind: "tip", name: "אופיר", chips: 10 });
  });

  it("records tip on player and live.tips", () => {
    const start = applyCommands(null, [{ kind: "add", name: "אופיר", amount: 100 }], "m1").live;
    const { live, reply } = applyCommands(start, [{ kind: "tip", name: "אופיר", chips: 10 }], "m2");
    expect(live.players[0].tipsGiven).toBe(10);
    expect(live.tips).toHaveLength(1);
    expect(live.tips[0]).toMatchObject({ name: "אופיר", amount: 10 });
    expect(reply).toContain("טיפ 10");
    expect(reply.startsWith(BOT_MARK)).toBe(true);
    expect(reply).not.toContain("ביט");
    expect(reply).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("subtracts tip from cashout when already closed", () => {
    let live = applyCommands(null, [{ kind: "add", name: "אופיר", amount: 100 }], "m1").live;
    live = applyCommands(live, [{ kind: "cashout", name: "אופיר", chips: 250 }], "m2").live;
    live = applyCommands(live, [{ kind: "tip", name: "אופיר", chips: 10 }], "m3").live;
    expect(live.players[0].cashout).toBe("240");
    expect(live.players[0].tipsGiven).toBe(10);
  });

  it("lists non-tippers and shames winners on settle", () => {
    let live = {
      players: [
        { name: "אופיר", buyin: 50, cashout: "200", tipsGiven: 10 },
        { name: "דן", buyin: 50, cashout: "0" },
      ],
      tips: [{ name: "אופיר", amount: 10, at: 1 }],
    };
    // cps=2 → אופיר net = 200/2-50 = +50; דן = 0-50 = -50
    const { reply } = applyCommands(live, [{ kind: "settle" }], null, 2);
    expect(reply).toContain("בלי טיפ");
    expect(reply).toContain("דן");
    // דן הפסיד — לא אמור לקבל נזיפת מנצחים
    expect(reply).not.toMatch(/הרווחתם/);
    /* זוכים לפני חייבים; שורת בלי-טיפ כולה מודגשת */
    expect(reply.indexOf("אופיר מגיע")).toBeLessThan(reply.indexOf("דן חייב"));
    expect(reply).toMatch(/\*[^*]*בלי טיפ[^*]*\*/);
  });

  it("settleSummary: winners desc with medals, debtors least-first", () => {
    const live = {
      players: [
        { name: "א", buyin: 50, cashout: "500" }, // +200 @ cps=2
        { name: "ב", buyin: 50, cashout: "300" }, // +100
        { name: "ג", buyin: 50, cashout: "200" }, // +50
        { name: "ד", buyin: 100, cashout: "100" }, // -50
        { name: "ה", buyin: 200, cashout: "100" }, // -150
      ],
      tips: [],
    };
    const { reply } = applyCommands(live, [{ kind: "settle" }], null, 2);
    expect(reply).toMatch(/🥇 א מגיע/);
    expect(reply).toMatch(/🥈 ב מגיע/);
    expect(reply).toMatch(/🥉 ג מגיע/);
    expect(reply.indexOf("א מגיע")).toBeLessThan(reply.indexOf("ד חייב"));
    expect(reply.indexOf("ד חייב")).toBeLessThan(reply.indexOf("ה חייב"));
  });

  it("shames a winning non-tipper", () => {
    const live = {
      players: [
        { name: "מנצח", buyin: 50, cashout: "200" },
        { name: "מפסיד", buyin: 50, cashout: "0", tipsGiven: 5 },
      ],
      tips: [{ name: "מפסיד", amount: 5, at: 1 }],
    };
    const { reply } = applyCommands(live, [{ kind: "settle" }], null, 2);
    expect(reply).toContain("מנצח");
    expect(reply).toContain(BOT_MARK);
    expect(reply).toContain("💸 טיפים הערב");
    expect(reply).toMatch(/בלי טיפ|נעלמו בלי טיפ/);
  });
});

describe("tip compliment rotation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not repeat the same compliment until the bag is exhausted", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let live = {};
    const seen = [];
    for (let i = 0; i < TIP_COMPLIMENTS.length; i++) {
      const { template, bag, last, bagKey, lastKey } = nextTipCompliment(live, { female: false });
      seen.push(template);
      live = { ...live, [bagKey]: bag, [lastKey]: last };
    }
    expect(new Set(seen).size).toBe(TIP_COMPLIMENTS.length);
    const next = nextTipCompliment(live, { female: false });
    expect(TIP_COMPLIMENTS).toContain(next.template);
  });

  it("uses feminine templates for women (not תותח/גבר)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { template } = nextTipCompliment({}, { female: true });
    expect(template).toMatch(/תותחית|מלכה|אלופה|עלייך|נותנות|תותחית על|מלכת|אישה|מדהימה|נשמה|כבוד|אש|חבל|מגיע|פרגנה|סטנדרט|חותם/);
    expect(template).not.toMatch(/\{name\} גבר!/);
    expect(template).not.toMatch(/\{name\} תותח!/);
  });

  it("formats tip line with name and amount, without ג'", () => {
    const line = formatTipCompliment("{name} תותח! כל הכבוד על הטיפ {amount} 👏", "דן ינקלויץ", 10);
    expect(line).toBe("דן ינקלויץ תותח! כל הכבוד על הטיפ 10 👏");
    expect(line).not.toMatch(/ג'/);
  });
});

describe("chip records", () => {
  const db = {
    aliases: {},
    sessions: [
      {
        iso: "2026-08-01",
        d: 1,
        mo: 8,
        y: 2026,
        entries: [
          { name: "א", amount: 100, chips: 400 },
          { name: "ב", amount: -100, chips: 0 },
        ],
      },
      {
        iso: "2026-08-10",
        d: 10,
        mo: 8,
        y: 2026,
        entries: [
          { name: "א", amount: 50, chips: 300 },
          { name: "ב", amount: 80, chips: 500 },
        ],
      },
      {
        iso: "2026-03-05",
        d: 5,
        mo: 3,
        y: 2026,
        entries: [
          { name: "ג", amount: 120, chips: 450 },
        ],
      },
      // ערב ישן בלי chips — לא נספר בשיאי ג'יטונים
      {
        iso: "2025-01-01",
        d: 1,
        mo: 1,
        y: 2025,
        entries: [{ name: "א", amount: 999 }],
      },
    ],
    yearly: [],
  };

  it("finds single-night chip high", () => {
    const high = bestChipCashout(db.sessions, {});
    expect(high).toMatchObject({ name: "ב", chips: 500 });
  });

  it("builds month/year/all-time peak cashouts from chip sessions only", () => {
    const recs = computeChipRecords(db);
    expect(recs.monthLabel).toBe("אוגוסט 2026");
    expect(recs.yearLabel).toBe("2026");
    // אוגוסט: ב 500 > א 400 > א 300
    expect(recs.bestMonth).toMatchObject({ name: "ב", chips: 500 });
    expect(recs.bestMonth2).toMatchObject({ name: "א", chips: 400 });
    expect(recs.bestMonth3).toMatchObject({ name: "א", chips: 300 });
    // שנה: ב 500 > ג 450 > א 400
    expect(recs.bestYear).toMatchObject({ name: "ב", chips: 500 });
    expect(recs.bestYear2).toMatchObject({ name: "ג", chips: 450 });
    expect(recs.bestCashout).toMatchObject({ name: "ב", chips: 500 });
    expect(recs.podium).toBeUndefined();
    expect(recs.allKing).toBeUndefined();
    expect(recs.nightsWithChips).toBe(3);
  });
});

describe("couple fills", () => {
  it("resolves Gil, Liraz, and new fill partners", () => {
    expect(partnerOf("עדן גיל")).toBe("אורן גיל");
    expect(partnerOf("דור")).toBe("עדן לירז");
    expect(partnerOf("שגיא")).toBe("דוד בני גיל");
    expect(partnerOf("דוד בני")).toBe("שגיא גיל");
    expect(partnerOf("בני גיל")).toBe("שגיא גיל");
    expect(partnerOf("אופיר")).toBe("נתנאל כהן");
    expect(partnerOf("נתנאל כהן")).toBe("אופיר סנה");
    expect(partnerOf("איציק")).toBe("ירדן תפילין");
    expect(partnerOf("ירדן")).toBe("איציק תפילין");
  });

  it("lists all discreet fill couples", () => {
    expect(FILL_COUPLES).toEqual([
      ["עדן גיל", "אורן גיל"],
      ["דור לירז", "עדן לירז"],
      ["שגיא גיל", "דוד בני גיל"],
      ["אופיר סנה", "נתנאל כהן"],
      ["איציק תפילין", "ירדן תפילין"],
    ]);
  });

  it("moves chips between seated partners", () => {
    const players = [
      { name: "עדן גיל", buyin: 100, cashout: "200" },
      { name: "אורן גיל", buyin: 50, cashout: "100" },
    ];
    const res = applyCoupleFill(players, "עדן גיל", 30);
    expect(res.ok).toBe(true);
    expect(res.players[0].cashout).toBe("170");
    expect(res.players[1].cashout).toBe("130");
    expect(res.event).toMatchObject({ from: "עדן גיל", to: "אורן גיל", chips: 30 });
  });

  it("computes monthly מילוי זוגי record", () => {
    const db = {
      sessions: [
        {
          iso: "2026-08-15",
          d: 15,
          mo: 8,
          y: 2026,
          entries: [],
          coupleFills: [
            { couple: ["אורן גיל", "עדן גיל"], from: "עדן גיל", to: "אורן גיל", chips: 30, at: 1 },
            { couple: ["אורן גיל", "עדן גיל"], from: "עדן גיל", to: "אורן גיל", chips: 30, at: 2 },
          ],
        },
      ],
    };
    const recs = computeCoupleFillRecords(db);
    expect(recs.monthTop.count).toBe(2);
    expect(recs.monthTop.chips).toBe(60);
    expect(recs.monthTop.label).toContain("→");
  });

  it("summarizes direction and 30-chip fills for Live UI", () => {
    const fills = [
      { from: "עדן גיל", to: "אורן גיל", chips: DEFAULT_FILL_CHIPS, at: 1000 },
      { from: "עדן גיל", to: "אורן גיל", chips: DEFAULT_FILL_CHIPS, at: 2000 },
      { from: "אורן גיל", to: "עדן גיל", chips: DEFAULT_FILL_CHIPS, at: 3000 },
    ];
    const rows = summarizeCoupleFills(fills, "עדן גיל");
    expect(rows).toHaveLength(2);
    const edenToOren = rows.find((r) => r.from === "עדן גיל");
    expect(edenToOren.count).toBe(2);
    expect(edenToOren.total).toBe(60);
    expect(formatFillBadge(edenToOren)).toMatch(/→/);
    expect(formatFillBadge(edenToOren)).toMatch(/30×2/);
  });
});

describe("tip records", () => {
  it("aggregates tip leaders from session tips", () => {
    const db = {
      aliases: {},
      sessions: [
        {
          iso: "2026-08-01",
          d: 1,
          mo: 8,
          y: 2026,
          entries: [{ name: "אופיר", amount: 10 }],
          tips: [
            { name: "אופיר", amount: 20, at: 1 },
            { name: "אופיר", amount: 5, at: 2 },
          ],
        },
      ],
    };
    const recs = computeTipRecords(db);
    expect(recs.biggestTip.amount).toBe(20);
    expect(recs.mostTipsNight.count).toBe(2);
    expect(recs.allKing.chips).toBe(25);
  });
});

describe("duration records", () => {
  const longStart = Date.parse("2026-08-01T20:00:00+03:00");
  const longEnd = Date.parse("2026-08-02T01:00:00+03:00"); // 5h
  const shortStart = Date.parse("2026-08-10T21:00:00+03:00");
  const shortEnd = Date.parse("2026-08-10T22:30:00+03:00"); // 1.5h
  const midStart = Date.parse("2026-08-15T20:40:00+03:00");
  const midEnd = Date.parse("2026-08-16T00:52:00+03:00"); // ~4h12m

  const db = {
    sessions: [
      {
        iso: "2026-08-01",
        d: 1,
        mo: 8,
        y: 2026,
        startedAt: longStart,
        endedAt: longEnd,
        entries: [{ name: "א", amount: 0 }],
      },
      {
        iso: "2026-08-10",
        d: 10,
        mo: 8,
        y: 2026,
        startedAt: shortStart,
        endedAt: shortEnd,
        entries: [{ name: "ב", amount: 0 }],
      },
      {
        iso: "2026-08-15",
        d: 15,
        mo: 8,
        y: 2026,
        startedAt: midStart,
        endedAt: midEnd,
        entries: [{ name: "ג", amount: 0 }],
      },
      // בלי זמנים — מדלגים
      {
        iso: "2026-08-20",
        d: 20,
        mo: 8,
        y: 2026,
        entries: [{ name: "ד", amount: 0 }],
      },
      // endedAt לפני startedAt — מדלגים
      {
        iso: "2026-08-21",
        d: 21,
        mo: 8,
        y: 2026,
        startedAt: longEnd,
        endedAt: longStart,
        entries: [{ name: "ה", amount: 0 }],
      },
    ],
  };

  it("returns null ms when times are missing or invalid", () => {
    expect(sessionDurationMs({})).toBeNull();
    expect(sessionDurationMs({ startedAt: 1 })).toBeNull();
    expect(sessionDurationMs({ startedAt: 100, endedAt: 50 })).toBeNull();
    expect(sessionDurationMs({ startedAt: longStart, endedAt: longEnd })).toBe(longEnd - longStart);
  });

  it("picks longest and shortest sessions by duration", () => {
    const timed = timedSessions(db.sessions);
    expect(timed).toHaveLength(3);
    expect(timed[0].d).toBe(1);
    expect(timed[0].ms).toBe(5 * 60 * 60 * 1000);

    const recs = computeDurationRecords(db);
    expect(recs.nightsWithTimes).toBe(3);
    expect(recs.longest).toMatchObject({ d: 1, mo: 8, y: 2026, ms: 5 * 60 * 60 * 1000 });
    expect(recs.longest.label).toContain("שעות");
    expect(recs.shortest).toMatchObject({ d: 10, mo: 8, y: 2026, ms: 90 * 60 * 1000 });
    expect(recs.shortest2.d).toBe(15);
    expect(recs.longest2.d).toBe(15);
  });

  it("returns null when no session has usable times", () => {
    expect(computeDurationRecords({ sessions: [{ iso: "2026-01-01", d: 1, mo: 1, y: 2026, entries: [] }] })).toBeNull();
  });
});
