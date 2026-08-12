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
