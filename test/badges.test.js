import { describe, it, expect } from "vitest";
import { computeBadges, badgesForPlayer, BADGE_DEFS } from "../lib/poker/badges.js";

function night(iso, entries, extra = {}) {
  const [y, mo, d] = iso.split("-").map(Number);
  return {
    id: iso,
    iso,
    d,
    mo,
    y,
    entries: Object.entries(entries).map(([name, amount]) =>
      typeof amount === "object" ? { name, ...amount } : { name, amount }
    ),
    ...extra,
  };
}

describe("computeBadges", () => {
  it("returns null without sessions", () => {
    expect(computeBadges(null)).toBeNull();
    expect(computeBadges({ sessions: [] })).toBeNull();
  });

  it("awards streak5 and hero accumulation", () => {
    const nights = [];
    for (let i = 1; i <= 6; i++) {
      nights.push(night(`2026-01-0${i}`, { "עדן גיל": 100, "קובי סעדה": -100 }));
    }
    const db = { aliases: {}, roster: [], yearly: [], sessions: nights };
    const ids = badgesForPlayer(db, "עדן גיל").map((b) => b.id);
    expect(ids).toContain("streak5");
    expect(ids).toContain("crown1"); // מלך ינואר — היחיד בחיובי
    expect(ids).not.toContain("hero10"); // רק 6 ערבי שיא
  });

  it("awards monthly crown to the month's top player", () => {
    const db = {
      aliases: {},
      roster: [],
      yearly: [],
      sessions: [
        night("2026-01-05", { "עדן גיל": 200, "קובי סעדה": -200 }),
        night("2026-02-05", { "עדן גיל": -50, "קובי סעדה": 50 }),
      ],
    };
    expect(badgesForPlayer(db, "עדן גיל").map((b) => b.id)).toContain("crown1");
    expect(badgesForPlayer(db, "קובי סעדה").map((b) => b.id)).toContain("crown1");
  });

  it("awards first tip from tipsGiven", () => {
    const db = {
      aliases: {},
      roster: [],
      yearly: [],
      sessions: [
        night("2026-01-05", {
          "עדן גיל": { amount: 100, tipsGiven: 20 },
          "קובי סעדה": { amount: -100 },
        }),
      ],
    };
    const eden = badgesForPlayer(db, "עדן גיל");
    expect(eden.map((b) => b.id)).toContain("tip1");
    expect(badgesForPlayer(db, "קובי סעדה")).toEqual([]);
  });

  it("awards 50 nights with the reaching date", () => {
    const nights = [];
    for (let i = 0; i < 50; i++) {
      const d = new Date(2025, 0, 1 + i);
      const iso = d.toISOString().slice(0, 10);
      nights.push(night(iso, { "עדן גיל": 10, "קובי סעדה": -10 }));
    }
    const db = { aliases: {}, roster: [], yearly: [], sessions: nights };
    const badge = badgesForPlayer(db, "עדן גיל").find((b) => b.id === "nights50");
    expect(badge).toBeTruthy();
    expect(badge.at).toBe(nights[49].iso);
  });

  it("hero10 needs ten top-of-night finishes", () => {
    const nights = [];
    for (let i = 1; i <= 10; i++) {
      nights.push(
        night(`2026-03-${String(i).padStart(2, "0")}`, {
          "עדן גיל": 100,
          "קובי סעדה": 50,
          "דור לירז": -150,
        })
      );
    }
    const db = { aliases: {}, roster: [], yearly: [], sessions: nights };
    expect(badgesForPlayer(db, "עדן גיל").map((b) => b.id)).toContain("hero10");
    expect(badgesForPlayer(db, "קובי סעדה").map((b) => b.id)).not.toContain("hero10");
  });

  it("every earned badge has a definition", () => {
    const defIds = new Set(BADGE_DEFS.map((d) => d.id));
    const db = {
      aliases: {},
      roster: [],
      yearly: [],
      sessions: [night("2026-01-05", { "עדן גיל": 200, "קובי סעדה": -200 })],
    };
    const all = computeBadges(db);
    for (const badges of Object.values(all.perPlayer)) {
      for (const b of badges) expect(defIds.has(b.id)).toBe(true);
    }
  });
});
