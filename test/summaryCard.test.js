import { describe, expect, it } from "vitest";
import { summaryCardData } from "../lib/poker/summaryCard.js";

const S = (iso, entries) => ({
  iso,
  y: Number(iso.slice(0, 4)),
  mo: Number(iso.slice(5, 7)),
  d: Number(iso.slice(8, 10)),
  entries: entries.map(([name, amount]) => ({ name, amount })),
});

const db = () => ({
  aliases: {},
  roster: [],
  sessions: [
    S("2026-09-05", [["אבי", 500], ["משה", -300], ["דנה", -200]]),
    S("2026-09-19", [["משה", 700], ["אבי", -400], ["דנה", -300]]),
    S("2026-08-29", [["אבי", 999], ["משה", -999]]),
    S("2025-09-13", [["דנה", 123], ["אבי", -123]]),
  ],
});

describe("summaryCardData — חודשי", () => {
  const data = () => summaryCardData(db(), { kind: "month", y: 2026, mo: 9 });

  it("כותרת, ערבים ושחקנים של החודש בלבד", () => {
    const d = data();
    expect(d.title).toBe("סיכום חודש ספטמבר 2026");
    expect(d.nights).toBe(2);
    expect(d.players).toBe(3);
    // רק ספטמבר 2026: ערבי אוגוסט 2026 וספטמבר 2025 בחוץ
    expect(d.totalMoved).toBe(1200);
  });

  it("מלך ופודיום לפי נטו התקופה", () => {
    const d = data();
    expect(d.king).toEqual({ name: "משה", amount: 400 });
    expect(d.podium.map((p) => p.name)).toEqual(["משה", "אבי", "דנה"]);
    expect(d.podium[1]).toEqual({ name: "אבי", amount: 100 });
  });

  it("ערב השיא, הערב הסוער והנוכחות — בתוך החודש", () => {
    const d = data();
    expect(d.bestNight).toEqual({ name: "משה", amount: 700, date: "19.9.26" });
    expect(d.stormyNight.moved).toBe(700);
    expect(d.stormyNight.date).toBe("19.9.26");
    expect(d.mostNights).toEqual({ name: "אבי", nights: 2 });
  });
});

describe("summaryCardData — שנתי", () => {
  it("כולל את כל ערבי השנה, בלי שנים אחרות", () => {
    const d = summaryCardData(db(), { kind: "year", y: 2026 });
    expect(d.title).toBe("סיכום שנת 2026");
    expect(d.nights).toBe(3);
    expect(d.king).toEqual({ name: "אבי", amount: 1099 });
    expect(d.bestNight.amount).toBe(999);
  });
});

describe("summaryCardData — קצוות", () => {
  it("null כשאין ערבים בתקופה או ביקוש לא תקין", () => {
    expect(summaryCardData(db(), { kind: "month", y: 2024, mo: 1 })).toBeNull();
    expect(summaryCardData(db(), { kind: "week", y: 2026 })).toBeNull();
    expect(summaryCardData(null, { kind: "year", y: 2026 })).toBeNull();
  });
});
