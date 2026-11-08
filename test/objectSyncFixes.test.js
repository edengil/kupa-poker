/* תיקוני סנכרון־אובייקטים משחרור גלים 4+5 (ביקורות O1/O2/O3):
   1+2. mergeLiveStates נושא את savingsPot ואת שקיות המחמאות המגדריות
        (הנשיאה ב־pickLiveMeta מכוסה ב־botLiveFixture.test.js).
   3.   renameEverywhere של הבוט משכתב מילויי זוגות על הצורה האמיתית
        { couple: [a, b], from, to, chips, at }.
   5.   matchViewerToPlayer פותר מייל דרך db.emails כמקור־אמת.
   6.   פיקסצ'רת הצופה נושאת emails/phones כמו צורת הייצור. */
import { describe, it, expect } from "vitest";
import { mergeLiveStates } from "../lib/liveMerge.js";
import { renameEverywhere } from "../lib/wa/state";
import { matchViewerToPlayer } from "../lib/poker/personalHighlights.js";
import { buildViewerFixture } from "../components/PreviewViewerApp.jsx";

describe("mergeLiveStates — נשיאת קופה ושקיות מגדריות (O2)", () => {
  const base = { players: [], tips: [], applied: {}, startedAt: 1000 };

  it("ערך השרת קודם לקופה ולשקיות; האחרון־שנוגן מהשרת", () => {
    const local = {
      ...base,
      savingsPot: 5,
      tipComplimentBagM: [1],
      tipComplimentLastM: 1,
      tipComplimentBagF: [2],
      tipComplimentLastF: 2,
    };
    const remote = {
      ...base,
      savingsPot: 9,
      tipComplimentBagM: [7, 8],
      tipComplimentLastM: 7,
      tipComplimentBagF: [9],
      tipComplimentLastF: 9,
    };
    const merged = mergeLiveStates(local, remote);
    expect(merged.savingsPot).toBe(9);
    expect(merged.tipComplimentBagM).toEqual([7, 8]);
    expect(merged.tipComplimentLastM).toBe(7);
    expect(merged.tipComplimentBagF).toEqual([9]);
    expect(merged.tipComplimentLastF).toBe(9);
  });

  it("בלי ערך בשרת — הערכים המקומיים שורדים את המיזוג", () => {
    const local = { ...base, savingsPot: 5, tipComplimentBagM: [1], tipComplimentLastM: 1 };
    const remote = { ...base };
    const merged = mergeLiveStates(local, remote);
    expect(merged.savingsPot).toBe(5);
    expect(merged.tipComplimentBagM).toEqual([1]);
    expect(merged.tipComplimentLastM).toBe(1);
  });

  it("בלי אף ערך — savingsPot נשאר לא־מוגדר, לא 0 מומצא", () => {
    const merged = mergeLiveStates({ ...base }, { ...base });
    expect(merged.savingsPot).toBeUndefined();
  });
});

describe("renameEverywhere — מילויי זוגות בצורה האמיתית (O2)", () => {
  function stateWithFills() {
    return {
      players: [{ name: "עדן לירז" }, { name: "דור לירז" }],
      pending: null,
      pendingApprovals: [],
      approvedNames: [],
      tips: [],
      coupleFills: [
        { couple: ["דור לירז", "עדן לירז"], from: "עדן לירז", to: "דור לירז", chips: 100, at: 123 },
        { couple: ["אופיר סנה", "נתנאל כהן"], from: "אופיר סנה", to: "נתנאל כהן", chips: 50, at: 456 },
      ],
    };
  }

  it("משכתב את שני איברי couple ואת from/to, בלי לגעת ב־chips/at", () => {
    const state = stateWithFills();
    renameEverywhere(state, "עדן לירז", "עדן ל.");
    expect(state.coupleFills[0]).toEqual({
      couple: ["דור לירז", "עדן ל."],
      from: "עדן ל.",
      to: "דור לירז",
      chips: 100,
      at: 123,
    });
    /* מילוי של זוג אחר לא משתנה */
    expect(state.coupleFills[1]).toEqual({
      couple: ["אופיר סנה", "נתנאל כהן"],
      from: "אופיר סנה",
      to: "נתנאל כהן",
      chips: 50,
      at: 456,
    });
  });

  it("משכתב גם את צד ה־to, ולא מוסיף מפתחות name/a/b שלא קיימים בצורה", () => {
    const state = stateWithFills();
    renameEverywhere(state, "דור לירז", "דור ל.");
    expect(state.coupleFills[0].to).toBe("דור ל.");
    expect(state.coupleFills[0].couple).toEqual(["דור ל.", "עדן לירז"]);
    expect(Object.keys(state.coupleFills[0]).sort()).toEqual(
      ["at", "chips", "couple", "from", "to"].sort()
    );
  });
});

describe("matchViewerToPlayer — db.emails כמקור־אמת (O1)", () => {
  const dbBase = {
    aliases: {},
    roster: ["דור לירז", "עדן לירז", "שחקן חדש"],
    yearly: [],
    sessions: [],
  };

  it("מייל שהוסף ל־db.emails מזהה את הצופה כשחקן — בלי שינוי קוד", () => {
    const db = { ...dbBase, emails: { "שחקן חדש": "newplayer@example.com" } };
    const viewer = matchViewerToPlayer(db, {
      email: "  NewPlayer@Example.com ",
      full_name: "לגמרי אחר",
    });
    expect(viewer).toBe("שחקן חדש");
  });

  it("db.emails קודם למפה הקשיחה לאותה כתובת", () => {
    /* edengur2106@gmail.com קשיח ל"עדן לירז"; בפרופיל הוא של דור — הפרופיל מנצח */
    const db = { ...dbBase, emails: { "דור לירז": "edengur2106@gmail.com" } };
    const viewer = matchViewerToPlayer(db, { email: "edengur2106@gmail.com" });
    expect(viewer).toBe("דור לירז");
  });

  it("בלי רשומה ב־db.emails — נפילת־הגיבוי הקשיחה עדיין עובדת", () => {
    const db = { ...dbBase, emails: {} };
    const viewer = matchViewerToPlayer(db, { email: "edengur2106@gmail.com" });
    expect(viewer).toBe("עדן לירז");
  });

  it("שם ב־db.emails שאינו שחקן מוכר לא מזוהה דרך המייל", () => {
    const db = { ...dbBase, emails: { "זר מוחלט": "stranger@example.com" } };
    const viewer = matchViewerToPlayer(db, {
      email: "stranger@example.com",
      full_name: "אין כזה",
    });
    expect(viewer).toBeNull();
  });
});

describe("buildViewerFixture — צורת normalize אמיתית (O3)", () => {
  it("data נושאת emails/phones כמפות ריקות, לא undefined", () => {
    const fixture = buildViewerFixture();
    expect(fixture.data.emails).toEqual({});
    expect(fixture.data.phones).toEqual({});
  });
});
