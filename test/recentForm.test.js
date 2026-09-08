import { describe, it, expect } from "vitest";
import { playerRecentForm, groupHotForm } from "../components/poker/recentForm.js";
import { computePersonalStats, personalStatRows } from "../components/poker/personalStats.js";

function dbForm() {
  return {
    aliases: { עדן: "עדן גיל", קובי: "קובי סעדה", דן: "דן ינקלויץ" },
    roster: ["עדן גיל", "קובי סעדה", "דן ינקלויץ"],
    yearly: [],
    sessions: [
      {
        id: "1",
        iso: "2026-08-01",
        y: 2026,
        mo: 8,
        d: 1,
        entries: [
          { name: "עדן", amount: 100 },
          { name: "קובי", amount: -40 },
          { name: "דן", amount: -60 },
        ],
      },
      {
        id: "2",
        iso: "2026-08-08",
        y: 2026,
        mo: 8,
        d: 8,
        entries: [
          { name: "עדן", amount: -50 },
          { name: "קובי", amount: 80 },
          { name: "דן", amount: -30 },
        ],
      },
      {
        id: "3",
        iso: "2026-08-15",
        y: 2026,
        mo: 8,
        d: 15,
        entries: [
          { name: "עדן", amount: 70 },
          { name: "קובי", amount: -20 },
          { name: "דן", amount: -50 },
        ],
      },
      {
        id: "4",
        iso: "2026-08-22",
        y: 2026,
        mo: 8,
        d: 22,
        entries: [
          { name: "עדן", amount: 40 },
          { name: "קובי", amount: -10 },
          { name: "דן", amount: -30 },
        ],
      },
      {
        id: "5",
        iso: "2026-08-29",
        y: 2026,
        mo: 8,
        d: 29,
        entries: [
          { name: "עדן", amount: 20 },
          { name: "קובי", amount: 30 },
          { name: "דן", amount: -50 },
        ],
      },
    ],
  };
}

describe("recentForm", () => {
  const db = dbForm();

  it("builds personal form oldest→newest with active streak", () => {
    const form = playerRecentForm(db, "עדן", { limit: 5 });
    expect(form.nights).toHaveLength(5);
    expect(form.nights.map((n) => n.amount)).toEqual([100, -50, 70, 40, 20]);
    expect(form.streakType).toBe("win");
    expect(form.streak).toBe(3);
    expect(form.net).toBe(180);
    expect(form.formText).toBe("נ ה נ נ נ");
  });

  it("ranks group hot players over last nights", () => {
    const hot = groupHotForm(db, { nights: 3, top: 2 });
    expect(hot.windowN).toBe(3);
    expect(hot.hot[0].name).toBe("עדן גיל");
    expect(hot.hot[0].amount).toBe(130); // 70+40+20
    expect(hot.hot[1].name).toBe("קובי סעדה");
  });
});

describe("personalStats compact form rows", () => {
  it("exposes recent form and active streak in compact rows", () => {
    const db = dbForm();
    const stats = computePersonalStats(db, "עדן", { chat: false });
    expect(stats.recentForm).toHaveLength(5);
    expect(stats.currentWinStreak).toBe(3);
    const rows = personalStatRows(stats, { compact: true });
    const titles = rows.map((r) => r.title);
    expect(titles).toContain("רצף ניצחונות פעיל");
    expect(titles).toContain("טופס 5 אחרונים");
  });
});
