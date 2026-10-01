import { describe, expect, it } from "vitest";
import { compareSeries, COMPARE_MAX } from "../lib/poker/compareChart.js";

const db = () => ({
  aliases: {},
  sessions: [
    {
      iso: "2026-09-05",
      y: 2026, mo: 9, d: 5,
      entries: [
        { name: "אבי", amount: 100 },
        { name: "משה", amount: -100 },
      ],
    },
    {
      iso: "2026-09-12",
      y: 2026, mo: 9, d: 12,
      entries: [
        { name: "אבי", amount: -50 },
        { name: "דנה", amount: 50 },
      ],
    },
    {
      iso: "2025-12-20",
      y: 2025, mo: 12, d: 20,
      entries: [
        { name: "אבי", amount: 30 },
        { name: "משה", amount: -30 },
      ],
    },
    {
      iso: "2026-09-19",
      y: 2026, mo: 9, d: 19,
      entries: [
        { name: "משה", amount: 200 },
        { name: "דנה", amount: -200 },
      ],
    },
  ],
});

describe("compareSeries", () => {
  it("בונה מצטבר על ציר ערבים משותף, ממוין לפי תאריך, עם שמירה בערב חסר", () => {
    const { nights, series } = compareSeries(db(), ["אבי", "משה"]);
    expect(nights.map((n) => n.iso)).toEqual([
      "2025-12-20",
      "2026-09-05",
      "2026-09-12",
      "2026-09-19",
    ]);
    const avi = series.find((s) => s.name === "אבי");
    const moshe = series.find((s) => s.name === "משה");
    expect(avi.points).toEqual([30, 130, 80, 80]);
    expect(avi.final).toBe(80);
    expect(avi.nightsPlayed).toBe(3);
    expect(moshe.points).toEqual([-30, -130, -130, 70]);
    expect(moshe.nightsPlayed).toBe(3);
  });

  it("מסנן לפי שנה", () => {
    const { nights, series } = compareSeries(db(), ["אבי", "דנה"], { year: 2026 });
    expect(nights).toHaveLength(3);
    const dana = series.find((s) => s.name === "דנה");
    expect(dana.points).toEqual([0, 50, -150]);
    expect(dana.nightsPlayed).toBe(2);
  });

  it("שחקן בלי ערבים בתקופה לא נכנס לסדרה", () => {
    const { series } = compareSeries(db(), ["אבי", "דנה"], { year: 2025 });
    expect(series.map((s) => s.name)).toEqual(["אבי"]);
  });

  it("מגביל ל־4 שחקנים ומאחד כפולים וכינויים", () => {
    const base = db();
    base.aliases = { אב: "אבי" };
    const { series } = compareSeries(base, ["אב", "אבי", "משה", "דנה", "רוני", "יוסי"]);
    expect(series.length).toBeLessThanOrEqual(COMPARE_MAX);
    expect(series.filter((s) => s.name === "אבי")).toHaveLength(1);
  });

  it("מחזיר ריק כשאין ערבים או שמות", () => {
    expect(compareSeries(db(), []).series).toEqual([]);
    expect(compareSeries({ sessions: [] }, ["אבי"]).nights).toEqual([]);
    expect(compareSeries(null, ["אבי"]).series).toEqual([]);
  });
});
