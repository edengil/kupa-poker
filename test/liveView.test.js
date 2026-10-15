import { describe, it, expect } from "vitest";
import { playerChips, buildPlayersView } from "../lib/liveView";

describe("playerChips", () => {
  it("בלי תרומת קופה: חוב × ג'יטונים לשקל", () => {
    expect(playerChips({ name: "א", buyin: 100, buyinEvents: [{ amount: 100 }] }, 2)).toBe(200);
  });
  it("עם תרומת 5%: הג'יטונים מופחתים, החוב לא", () => {
    expect(
      playerChips({ name: "א", buyin: 100, buyinEvents: [{ amount: 100, pot: 5 }] }, 2)
    ).toBe(190);
  });
  it("כמה קניות מצטברות", () => {
    expect(
      playerChips(
        { name: "א", buyin: 150, buyinEvents: [{ amount: 100, pot: 5 }, { amount: 50, pot: 2.5 }] },
        2
      )
    ).toBe(285);
  });
});

describe("buildPlayersView", () => {
  const P = (name, buyin, cashout = "") => ({ name, buyin, cashout });
  it("במשחק: כולם בקבוצת play לפי פעילות אחרונה", () => {
    const players = [P("אבי", 50), P("בני", 50), P("גדי", 50)];
    const view = buildPlayersView(players, {
      recent: { בני: 300, אבי: 100 },
      allc: {},
      aliases: [],
      anyCash: false,
      cps: 2,
    });
    expect(view.map((v) => v.p.name)).toEqual(["בני", "אבי", "גדי"]);
    expect(view.every((v) => v.group === "play")).toBe(true);
    expect(view.map((v) => v.index)).toEqual([1, 0, 2]);
  });
  it("בסגירה: זוכים, אחר כך חייבים, פתוחים בסוף", () => {
    const players = [
      P("מפסיד", 100, 100), // יצא עם 100 ג'יטונים = 50₪ → הפסיד 50
      P("זוכה", 100, 400), // 400 ג'יטונים = 200₪ → הרוויח 100
      P("פתוח", 100, ""),
    ];
    const view = buildPlayersView(players, { anyCash: true, cps: 2, aliases: [] });
    expect(view.map((v) => v.group)).toEqual(["win", "lose", "open"]);
    expect(view[0].p.name).toBe("זוכה");
    expect(view[2].p.name).toBe("פתוח");
  });
});
