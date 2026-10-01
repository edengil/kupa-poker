import { describe, expect, it } from "vitest";
import {
  computeSkillRatings,
  skillRatingFor,
  SKILL_START,
  SKILL_MIN_NIGHTS,
} from "../lib/poker/skillRating.js";

const night = (iso, entries) => ({
  iso,
  y: Number(iso.slice(0, 4)),
  mo: Number(iso.slice(5, 7)),
  d: Number(iso.slice(8, 10)),
  entries: entries.map(([name, amount]) => ({ name, amount })),
});

const duel = (n, winner = "אבי") =>
  Array.from({ length: n }, (_, i) =>
    night(`2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`, [
      [winner, 100],
      [winner === "אבי" ? "משה" : "אבי", -100],
    ])
  );

describe("computeSkillRatings", () => {
  it("מתחיל ב־1000 ומעדכן ניצחון ראשון ב־K/2", () => {
    const { rows } = computeSkillRatings({ sessions: [night("2026-09-05", [["אבי", 50], ["משה", -50]])] });
    const avi = rows.find((r) => r.name === "אבי");
    const moshe = rows.find((r) => r.name === "משה");
    expect(avi.rating).toBe(SKILL_START + 16);
    expect(moshe.rating).toBe(SKILL_START - 16);
    expect(avi.wins).toBe(1);
    expect(moshe.losses).toBe(1);
    expect(avi.ranked).toBe(false);
  });

  it("תיקו בין שווים לא מזיז את הדירוג", () => {
    const { rows } = computeSkillRatings({
      sessions: [night("2026-09-05", [["אבי", 10], ["משה", 10]])],
    });
    for (const r of rows) {
      expect(r.rating).toBe(SKILL_START);
      expect(r.draws).toBe(1);
    }
  });

  it("רצף ניצחונות מעלה את המנצח בעקביות ושומר אפס־סכום בדו־קרב", () => {
    const { ranked } = computeSkillRatings({ sessions: duel(5) });
    const avi = ranked.find((r) => r.name === "אבי");
    const moshe = ranked.find((r) => r.name === "משה");
    expect(avi.rating).toBeGreaterThan(SKILL_START + 5 * 10);
    expect(avi.rating + moshe.rating).toBeCloseTo(2 * SKILL_START, 6);
    expect(avi.rank).toBe(1);
    expect(moshe.rank).toBe(2);
  });

  it("נכנסים לטבלה רק אחרי 5 ערבים", () => {
    const four = computeSkillRatings({ sessions: duel(4) });
    expect(four.ranked).toHaveLength(0);
    expect(four.rows.every((r) => !r.ranked)).toBe(true);
    const five = computeSkillRatings({ sessions: duel(5) });
    expect(five.tableSize).toBe(2);
    expect(SKILL_MIN_NIGHTS).toBe(5);
  });

  it("סדר הערבים בקלט לא משנה — החישוב כרונולוגי", () => {
    const sessions = duel(6);
    const shuffled = [...sessions].reverse();
    const a = computeSkillRatings({ sessions });
    const b = computeSkillRatings({ sessions: shuffled });
    expect(b.rows).toEqual(a.rows);
  });

  it("ערב מרובה שחקנים: האמצעי נשאר באמצע", () => {
    const { rows } = computeSkillRatings({
      sessions: [night("2026-09-05", [["אבי", 100], ["דנה", 0], ["משה", -100]])],
    });
    const by = (n) => rows.find((r) => r.name === n);
    expect(by("אבי").rating).toBe(SKILL_START + 16);
    expect(by("דנה").rating).toBe(SKILL_START);
    expect(by("משה").rating).toBe(SKILL_START - 16);
    expect(by("דנה").wins).toBe(1);
    expect(by("דנה").losses).toBe(1);
  });

  it("ערב עם שחקן אחד לא נספר, ושחקן בודד בלי יריב לא מופיע", () => {
    const { rows } = computeSkillRatings({
      sessions: [night("2026-09-05", [["אבי", 100]])],
    });
    expect(rows).toEqual([]);
  });
});

describe("skillRatingFor", () => {
  it("מחזיר שורה לשחקן קיים ו־null לאחר", () => {
    const db = { sessions: duel(5) };
    const row = skillRatingFor(db, "אבי");
    expect(row.ranked).toBe(true);
    expect(row.tableSize).toBe(2);
    expect(skillRatingFor(db, "לא קיים")).toBeNull();
    expect(skillRatingFor(db, "")).toBeNull();
  });
});
