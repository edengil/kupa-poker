import { describe, it, expect } from "vitest";
import {
  detectLiveRecords,
  liveRecordBaselines,
  liveRecordAnnouncement,
  liveRecordKey,
} from "../lib/poker/liveRecords.js";

/* חמישה ערבי היסטוריה: שיא יציאה 680 ג' (דן), קנייה מרבית 300₪ (דן),
   ריבאיים מרביים 2 (עדן). */
function historyDb() {
  const night = (iso, entries) => ({ iso, entries });
  return {
    aliases: {},
    sessions: [
      night("2026-08-01", [
        { name: "עדן גיל", buyin: 50, chips: 500, amount: 200, buyinEvents: [{ amount: 50 }, { amount: 50 }, { amount: 50 }] },
        { name: "דן ינקלויץ", buyin: 300, chips: 680, amount: 40 },
      ]),
      night("2026-08-08", [
        { name: "קובי סעדה", buyin: 100, chips: 400, amount: 100, buyinEvents: [{ amount: 50 }, { amount: 50 }] },
        { name: "עדן גיל", buyin: 150, chips: 100, amount: -100 },
      ]),
      night("2026-08-15", [{ name: "אופיר סנה", buyin: 100, chips: 300, amount: 50 }]),
      night("2026-08-22", [{ name: "נתנאל כהן", buyin: 200, chips: 0, amount: -200 }]),
      night("2026-08-29", [{ name: "דור לירז", buyin: 175, chips: 100, amount: -125 }]),
    ],
  };
}

describe("liveRecordBaselines", () => {
  it("derives cashout, buyin and rebuys baselines from history", () => {
    const b = liveRecordBaselines(historyDb());
    expect(b.nights).toBe(5);
    expect(b.bestCashout).toEqual({ name: "דן ינקלויץ", chips: 680 });
    expect(b.maxBuyin).toEqual({ name: "דן ינקלויץ", buyin: 300 });
    expect(b.maxRebuys).toEqual({ name: "עדן גיל", rebuys: 2 });
  });

  it("no invented baselines when history lacks the data", () => {
    const db = { sessions: [{ iso: "2026-01-01", entries: [{ name: "עדן גיל", amount: 10 }] }] };
    const b = liveRecordBaselines(db);
    expect(b.bestCashout).toBeNull();
    expect(b.maxBuyin).toBeNull();
    expect(b.maxRebuys).toBeNull();
  });
});

describe("detectLiveRecords", () => {
  it("flags a mid-night cashout above the historical best", () => {
    const out = detectLiveRecords({
      db: historyDb(),
      players: [{ name: "קובי סעדה", buyin: 100, cashout: "900" }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("cashout");
    expect(out[0].name).toBe("קובי סעדה");
    expect(out[0].value).toBe(900);
    expect(out[0].prev).toEqual({ name: "דן ינקלויץ", value: 680 });
    expect(out[0].key).toBe(liveRecordKey("cashout", "קובי סעדה"));
    expect(out[0].line).toContain("900");
  });

  it("flags the biggest single-night buyin and most rebuys", () => {
    const out = detectLiveRecords({
      db: historyDb(),
      players: [
        {
          name: "אופיר סנה",
          buyin: 350,
          buyinEvents: [{ amount: 50 }, { amount: 100 }, { amount: 100 }, { amount: 100 }],
        },
      ],
    });
    const kinds = out.map((r) => r.kind).sort();
    expect(kinds).toEqual(["buyin", "rebuys"]);
    expect(out.find((r) => r.kind === "rebuys").value).toBe(3);
  });

  it("a single rebuy never announces (needs to beat history and be ≥2)", () => {
    const out = detectLiveRecords({
      db: historyDb(),
      players: [{ name: "אופיר סנה", buyin: 100, buyinEvents: [{ amount: 50 }, { amount: 50 }] }],
    });
    expect(out).toEqual([]);
  });

  it("equal to the record does not announce — only beating it", () => {
    const out = detectLiveRecords({
      db: historyDb(),
      players: [{ name: "קובי סעדה", buyin: 300, cashout: "680" }],
    });
    expect(out).toEqual([]);
  });

  it("dedupes kinds already announced this night", () => {
    const player = { name: "קובי סעדה", buyin: 400, cashout: "900" };
    const announced = [liveRecordKey("cashout", "קובי סעדה"), liveRecordKey("buyin", "קובי סעדה")];
    const out = detectLiveRecords({ db: historyDb(), players: [player], announced });
    expect(out).toEqual([]);
  });

  it("dedupes within a single call for the same player+kind", () => {
    const out = detectLiveRecords({
      db: historyDb(),
      players: [
        { name: "קובי סעדה", buyin: 100, cashout: "900" },
        { name: "קובי סעדה", buyin: 100, cashout: "950" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(900);
  });

  it("stays silent with too little history (<5 nights)", () => {
    const db = historyDb();
    db.sessions = db.sessions.slice(0, 4);
    const out = detectLiveRecords({
      db,
      players: [{ name: "קובי סעדה", buyin: 9999, cashout: "99999" }],
    });
    expect(out).toEqual([]);
  });

  it("stays silent when there is no historical baseline", () => {
    const db = {
      sessions: Array.from({ length: 6 }, (_, i) => ({
        iso: `2026-0${i + 1}-01`,
        entries: [{ name: "פלוני אלמוני", amount: 10 }],
      })),
    };
    const out = detectLiveRecords({
      db,
      players: [{ name: "קובי סעדה", buyin: 9999, cashout: "99999" }],
    });
    expect(out).toEqual([]);
  });

  it("unfinished players (no cashout yet) do not trigger the cashout record", () => {
    const out = detectLiveRecords({
      db: historyDb(),
      players: [{ name: "קובי סעדה", buyin: 100, cashout: "" }],
    });
    expect(out).toEqual([]);
  });

  it("canonicalizes live names through aliases", () => {
    const db = historyDb();
    db.aliases = { "עדן": "עדן גיל" };
    const out = detectLiveRecords({
      db,
      players: [{ name: "עדן", buyin: 100, cashout: "900" }],
    });
    expect(out[0].name).toBe("עדן גיל");
  });
});

describe("liveRecordAnnouncement", () => {
  it("wraps lines with the bot header", () => {
    const text = liveRecordAnnouncement([{ line: "שורה אחת" }, { line: "שורה שנייה" }]);
    expect(text).toBe("🤖 שיא חדש! 🏆\n\nשורה אחת\nשורה שנייה");
  });

  it("returns null for empty input", () => {
    expect(liveRecordAnnouncement([])).toBeNull();
    expect(liveRecordAnnouncement(null)).toBeNull();
    expect(liveRecordAnnouncement([{ line: "  " }])).toBeNull();
  });
});
