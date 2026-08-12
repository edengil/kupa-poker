import { describe, it, expect } from "vitest";
import {
  r2,
  AL,
  balance,
  canon,
  DEFAULT_ALIASES,
  FEMALE,
  toWhatsApp,
  hhmm,
  dur,
  durWords,
} from "../components/poker/helpers.js";
import { fmt, MONTHS } from "../components/poker/format.js";
import {
  aggregate,
  yearTotals,
  monthTotals,
  allTimeTotals,
} from "../components/poker/totals.js";
import { parseEntries, parseDate } from "../components/poker/parse.js";
import { normalize } from "../components/poker/db.js";

describe("helpers — numeric", () => {
  it("r2 rounds to 2 decimals", () => {
    expect(r2(1.239)).toBe(1.24);
    expect(r2(1.231)).toBe(1.23);
  });

  it("balance computes pos/neg/gap", () => {
    expect(balance([{ amount: 100 }, { amount: -40 }])).toEqual({
      pos: 100,
      neg: 40,
      gap: 60,
    });
    expect(balance([{ amount: 50 }, { amount: -50 }]).gap).toBe(0);
  });

  it("fmt signs amounts", () => {
    expect(fmt(12)).toBe("+12");
    expect(fmt(-3)).toBe("−3");
    expect(fmt(0)).toBe("0");
  });
});

describe("helpers — aliases", () => {
  it("DEFAULT_ALIASES covers core nicknames", () => {
    expect(DEFAULT_ALIASES["דן"]).toBe("דן ינקלויץ");
    expect(DEFAULT_ALIASES["עדן"]).toBe("עדן גיל");
    expect(Object.keys(DEFAULT_ALIASES).length).toBeGreaterThanOrEqual(30);
  });

  it("AL prefers defaults over user overrides of the same key", () => {
    expect(AL({ aliases: { עדן: "X" } })["עדן"]).toBe("עדן גיל");
  });

  it("AL keeps user-added aliases", () => {
    expect(AL({ aliases: { זמיר: "זמיר כהן" } })["זמיר"]).toBe("זמיר כהן");
  });

  it("canon resolves through aliases", () => {
    expect(canon("דן", DEFAULT_ALIASES)).toBe("דן ינקלויץ");
    expect(canon("מישהו", DEFAULT_ALIASES)).toBe("מישהו");
  });

  it("FEMALE set drives gendered WhatsApp wording", () => {
    expect(FEMALE.has("אורן גיל")).toBe(true);
    expect(FEMALE.has("עדן גיל")).toBe(false);
  });
});

describe("helpers — toWhatsApp", () => {
  it("groups debtors, zeros, creditors with gendered verbs", () => {
    const text = toWhatsApp(
      [
        { name: "עדן גיל", amount: 50 },
        { name: "אורן גיל", amount: -50 },
        { name: "דן ינקלויץ", amount: 0 },
      ],
      { d: 1, mo: 8 },
      null,
      {},
      true
    );
    expect(text.startsWith("סיכום פוקר 1.8")).toBe(true);
    expect(text).toContain("אורן גיל חייבת 50");
    expect(text).toContain("דן ינקלויץ סגר באפס");
    expect(text).toContain("עדן גיל מגיע 50");
  });

  it("appends duration when startedAt/endedAt exist", () => {
    const sa = Date.parse("2026-08-01T18:00:00");
    const ea = Date.parse("2026-08-01T21:30:00");
    const text = toWhatsApp(
      [{ name: "עדן גיל", amount: 0 }],
      { d: 1, mo: 8, startedAt: sa, endedAt: ea },
      null,
      {},
      true
    );
    expect(text).toContain("🕐");
    expect(text).toContain(durWords(ea - sa));
  });
});

describe("helpers — time", () => {
  it("hhmm / dur / durWords return strings", () => {
    expect(hhmm(Date.UTC(2026, 0, 1, 20, 5))).toMatch(/^\d{2}:\d{2}$/);
    expect(dur(65000)).toMatch(/:/);
    expect(durWords(90 * 60000)).toContain("שעות");
  });
});

describe("format — MONTHS", () => {
  it("has 12 Hebrew month names", () => {
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS[0]).toBe("ינואר");
    expect(MONTHS[11]).toBe("דצמבר");
  });
});

describe("totals — period aggregation", () => {
  const db = {
    aliases: {},
    sessions: [
      {
        id: "1",
        iso: "2026-01-10",
        y: 2026,
        mo: 1,
        d: 10,
        entries: [
          { name: "עדן", amount: 100 },
          { name: "דן", amount: -100 },
        ],
      },
      {
        id: "2",
        iso: "2026-02-10",
        y: 2026,
        mo: 2,
        d: 10,
        entries: [
          { name: "עדן", amount: 50 },
          { name: "דן", amount: -50 },
        ],
      },
    ],
    yearly: [],
  };

  it("monthTotals sums one month with aliases", () => {
    const t = monthTotals(db, 2026, 1);
    expect(t.find((x) => x.name === "עדן גיל").amount).toBe(100);
    expect(t.find((x) => x.name === "דן ינקלויץ").amount).toBe(-100);
  });

  it("yearTotals aggregates sessions when no official yearly", () => {
    const { totals, official } = yearTotals(db, 2026);
    expect(official).toBe(false);
    expect(totals.find((x) => x.name === "עדן גיל").amount).toBe(150);
  });

  it("yearTotals prefers official yearly row", () => {
    const withOfficial = {
      ...db,
      yearly: [
        {
          id: "y",
          y: 2026,
          official: true,
          entries: [
            { name: "עדן גיל", amount: 999 },
            { name: "דן ינקלויץ", amount: -999 },
          ],
        },
      ],
    };
    const { totals, official } = yearTotals(withOfficial, 2026);
    expect(official).toBe(true);
    expect(totals[0]).toMatchObject({ name: "עדן גיל", amount: 999 });
  });

  it("allTimeTotals sums across years", () => {
    const t = allTimeTotals(db);
    expect(t.find((x) => x.name === "עדן גיל").amount).toBe(150);
  });

  it("aggregate sorts by amount desc", () => {
    const t = aggregate(db.sessions, AL({ aliases: {} }));
    expect(t[0].amount).toBeGreaterThanOrEqual(t[t.length - 1].amount);
  });
});

describe("parse — input text", () => {
  it("parseEntries reads creditors and debtors", () => {
    const entries = parseEntries("סיכום פוקר 1.8\nעדן מגיע 125\nאורן חייבת 50\nדן חייב 75");
    expect(entries).toEqual([
      { name: "עדן", amount: 125, combined: false },
      { name: "אורן", amount: -50, combined: false },
      { name: "דן", amount: -75, combined: false },
    ]);
  });

  it("parseEntries skips noise lines", () => {
    expect(parseEntries("כניסות 20\nבנתיים 10")).toEqual([]);
  });

  it("parseDate reads d.mo and optional year", () => {
    expect(parseDate("סיכום פוקר 1.8", 2026)).toMatchObject({
      d: 1,
      mo: 8,
      y: 2026,
      iso: "2026-08-01",
    });
    expect(parseDate("סיכום 12/3/25", 2026)).toMatchObject({
      d: 12,
      mo: 3,
      y: 2025,
      iso: "2025-03-12",
    });
  });
});

describe("db — normalize", () => {
  it("fills missing collections", () => {
    expect(normalize({ sessions: [{ id: 1 }] })).toMatchObject({
      sessions: [{ id: 1 }],
      yearly: [],
      monthly: [],
      aliases: {},
      roster: [],
    });
  });
});
