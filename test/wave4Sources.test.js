/* גל 4א — מקורות־אמת (ממצאי ביקורת 12, 13, 14 + כניסת ברירת־מחדל):
   מפת כינויים אחת ורשימת מגדר אחת (names.js), שער ג'יטונים אחד
   (לייב ← הגדרות ← ברירת מחדל; שער פר־ערב בשיאים), קבוע 5% אחד
   ונוסחת קופה אחת, וכניסת ברירת־מחדל ממקור אחד.
   הדיפ מול הייצור (138 ערבים, 65 שמות) הורץ במלואו בזמן הבנייה:
   רזולוציית שמות — אפס שינויים מלבד 7 מפתחות החלוקה שהיו חסרים
   וצורות עדן לירז במגדר; סכומי קופה — אפס הבדלים; שיאי ג'יטונים —
   פלט זהה. הפיקסצ'ר שלמטה נועל את תוצאות הייצור האלה. */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NAME_ALIASES, FEMALE_NAMES, deriveAliases } from "../lib/poker/names.js";
import { DEFAULT_ALIASES, FEMALE, AL, canon, potForBuyin, POT_RATE, r2 } from "../lib/poker/helpers.js";
import { FEMALE as GENDER_FEMALE, SETTLE_ALIASES, canonName, isFemaleName, byGender } from "../lib/gender.js";
import { canonCoupleName, partnerOf } from "../lib/poker/coupleFills.js";
import { settle } from "../lib/settlement";
import { CPS, DEFAULT_BUYIN, resolveCps } from "../lib/report.js";
import { viewerCps } from "../lib/publicShare.js";
import { chipCashoutNights, computeChipRecords, sessionHasChips } from "../lib/poker/chipRecords.js";
import { potRecordedFor } from "../lib/nightShare.js";
import { parseCommands } from "../lib/wa/parse.js";
import { blank } from "../lib/wa/state.ts";
import { mergeLiveStates } from "../lib/liveMerge.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/* כינויי המשתמש כפי שהם בייצור (data.aliases של הקבוצה) */
const PROD_USER_ALIASES = { "דן ו": "דן ויסמן", "דן י": "דן ינקלויץ", "עדן ל": "עדן לירז" };
const PROD_AL = AL({ aliases: PROD_USER_ALIASES });

/* [שם, canonName(חלוקה), canonCoupleName, canon(AL ייצור), isFemaleName]
   — כל 65 השמות המובחנים של הייצור, כפי שנמדדו על נתוני הייצור. */
const PROD_NAMES = [
  ["אברהם", "אברהם", "אברהם", "אברהם חבבו", false],
  ["אופיר", "אופיר סנה", "אופיר סנה", "אופיר סנה", false],
  ["אופיר סנה", "אופיר סנה", "אופיר סנה", "אופיר סנה", false],
  ["אור", "אור", "אור", "אור", false],
  ["אוראל", "אוראל", "אוראל", "אוראל", false],
  ["אורן", "אורן גיל", "אורן גיל", "אורן גיל", true],
  ["אורן גיל", "אורן גיל", "אורן גיל", "אורן גיל", true],
  ["איציק", "איציק תפילין", "איציק תפילין", "איציק תפילין", false],
  ["איציק וירדן", "איציק וירדן", "איציק וירדן", "ירדן תפילין", false],
  ["איציק תפילין", "איציק תפילין", "איציק תפילין", "איציק תפילין", false],
  ["איתו", "איתו", "איתו", "איתן אלרועי", false],
  ["איתיק", "איתיק", "איתיק", "איציק תפילין", false],
  ["איתן", "איתן", "איתן", "איתן אלרועי", false],
  ["אסולין", "אסולין", "אסולין", "אסולין", false],
  ["ארתור", "ארתור", "ארתור", "ארתור", false],
  ["בן", "בן", "בן", "בן אפללו", false],
  ["בני", "דוד בני גיל", "דוד בני גיל", "דוד בני גיל", false],
  ["גל", "גל", "גל", "גל", false],
  ["דו", "דו", "דו", "דן ינקלויץ", false],
  ["דוד בני", "דוד בני גיל", "דוד בני גיל", "דוד בני גיל", false],
  ["דוד בני גיל", "דוד בני גיל", "דוד בני גיל", "דוד בני גיל", false],
  ["דולב", "דולב", "דולב", "דולב", false],
  ["דור", "דור לירז", "דור לירז", "דור לירז", false],
  ["דור לירז", "דור לירז", "דור לירז", "דור לירז", false],
  ["דן", "דן", "דן", "דן ינקלויץ", false],
  ["דן הספר", "דן הספר", "דן הספר", "דן ויסמן", false],
  ["דן ויסמן", "דן ויסמן", "דן ויסמן", "דן ויסמן", false],
  ["דן ינקלויץ", "דן ינקלויץ", "דן ינקלויץ", "דן ינקלויץ", false],
  ["דני", "דני", "דני", "דני גוטניק", false],
  ["הדר", "הדר", "הדר", "הדר", false],
  ["טוני", "טוני", "טוני", "טוני", false],
  ["יובל", "יובל", "יובל", "יובל ניסים", false],
  ["ירדן", "ירדן תפילין", "ירדן תפילין", "ירדן תפילין", true],
  ["ירין", "ירין", "ירין", "ירין מלאך", false],
  ["ירין מלאך", "ירין מלאך", "ירין מלאך", "ירין מלאך", false],
  ["לאון", "לאון", "לאון", "לאון", false],
  ["לאופיר", "לאופיר", "לאופיר", "אופיר סנה", false],
  ["מייק", "מייק", "מייק", "מייקי", false],
  ["מייקי", "מייקי", "מייקי", "מייקי", false],
  ["משה", "משה", "משה", "משה", false],
  ["נועם", "נועם", "נועם", "נועם", false],
  ["ניצן", "ניצן", "ניצן", "ניצן ניסים", false],
  ["נתנאל", "נתנאל כהן", "נתנאל כהן", "נתנאל כהן", false],
  ["נתנאל כהן", "נתנאל כהן", "נתנאל כהן", "נתנאל כהן", false],
  ["עדן", "עדן גיל", "עדן גיל", "עדן גיל", false],
  ["עדן גורשומוב", "עדן לירז", "עדן לירז", "עדן לירז", false],
  ["עדן גושמרוב", "עדן לירז", "עדן לירז", "עדן לירז", false],
  ["עדן גיל", "עדן גיל", "עדן גיל", "עדן גיל", false],
  ["עדן לירז", "עדן לירז", "עדן לירז", "עדן לירז", false],
  ["עדן של דור", "עדן לירז", "עדן לירז", "עדן לירז", false],
  ["עומר", "עומר", "עומר", "עומר", false],
  ["עידן", "עידן", "עידן", "עידן", false],
  ["עמית", "עמית", "עמית", "עמית שלום", false],
  ["פריצי", "פריצי", "פריצי", "פריצי", false],
  ["קובי", "קובי", "קובי", "קובי סעדה", false],
  ["קובי סעדה", "קובי סעדה", "קובי סעדה", "קובי סעדה", false],
  ["רוי", "רוי", "רוי", "רוי סנדרוביץ", false],
  ["רועי", "רועי", "רועי", "רוי סנדרוביץ", false],
  ["רנדומלי", "רנדומלי", "רנדומלי", "רנדומלי", false],
  ["שגיא", "שגיא גיל", "שגיא גיל", "שגיא גיל", false],
  ["שגיא גיל", "שגיא גיל", "שגיא גיל", "שגיא גיל", false],
  ["שי", "שי", "שי", "שי יעקובי", false],
  ["שי יעקובי", "שי יעקובי", "שי יעקובי", "שי יעקובי", false],
  ["שמואל", "שמואל", "שמואל", "שמואל למפך", false],
  ["שפאק", "שפאק", "שפאק", "עדן שפאק", false],
];

describe("wave4 finding 12 — one alias map, one gender list", () => {
  it("DEFAULT_ALIASES is the single NAME_ALIASES object", () => {
    expect(DEFAULT_ALIASES).toBe(NAME_ALIASES);
    expect(Object.keys(NAME_ALIASES)).toHaveLength(44);
  });

  it("derived maps take every value from the single map", () => {
    for (const [k, v] of Object.entries(SETTLE_ALIASES)) {
      expect(NAME_ALIASES[k]).toBe(v);
    }
    expect(() => deriveAliases(["שם שלא קיים"])).toThrow(/missing/);
    expect(deriveAliases(["אופיר"])).toEqual({ "אופיר": "אופיר סנה" });
  });

  it("one gender list behind both representations", () => {
    expect(GENDER_FEMALE).toBe(FEMALE_NAMES);
    expect([...FEMALE].sort()).toEqual([...FEMALE_NAMES].sort());
    expect(FEMALE_NAMES).toEqual(["אורן גיל", "אורן", "ירדן תפילין", "ירדן"]);
  });

  it("the 7 previously-missing short names resolve in the settlement map", () => {
    expect(canonName("שגיא")).toBe("שגיא גיל");
    expect(canonName("דוד בני")).toBe("דוד בני גיל");
    expect(canonName("בני גיל")).toBe("דוד בני גיל");
    expect(canonName("בני")).toBe("דוד בני גיל");
    expect(canonName("אופיר")).toBe("אופיר סנה");
    expect(canonName("איציק")).toBe("איציק תפילין");
    expect(canonName("ירדן")).toBe("ירדן תפילין");
  });

  it("every couple is identified from short names in settlement (3 of 5 failed before)", () => {
    // זוג שגיא↔דוד בני: שניהם חייבים, אחד מכסה בשם קצר
    const r1 = settle(
      [
        { name: "שגיא", buyin: 100, cashout: "0" },
        { name: "דוד בני", buyin: 0, cashout: "100" },
        { name: "קובי סעדה", buyin: 0, cashout: "0" },
      ],
      1,
    );
    expect(r1.transfers.some((t) => t.pair && t.amount === 100)).toBe(true);
    // זוג איציק↔ירדן בשמות קצרים
    const r2x = settle(
      [
        { name: "איציק", buyin: 60, cashout: "0" },
        { name: "ירדן", buyin: 0, cashout: "60" },
        { name: "קובי סעדה", buyin: 0, cashout: "0" },
      ],
      1,
    );
    expect(r2x.transfers.some((t) => t.pair && t.amount === 60)).toBe(true);
    expect(partnerOf("אופיר")).toBe("נתנאל כהן");
    expect(partnerOf("בני")).toBe("שגיא גיל");
  });

  it("gender conflict resolved: Eden Liraz is male in every path", () => {
    for (const n of ["עדן לירז", "עדן גורשומוב", "עדן גושמרוב", "עדן ל", "עדן של דור"]) {
      expect(isFemaleName(n)).toBe(false);
      expect(FEMALE.has(canon(n, PROD_AL))).toBe(false);
    }
    expect(byGender("עדן לירז", "מעביר", "מעבירה")).toBe("מעביר");
    for (const n of ["אורן", "אורן גיל", "ירדן", "ירדן תפילין"]) {
      expect(isFemaleName(n)).toBe(true);
      expect(FEMALE.has(canon(n, PROD_AL))).toBe(true);
    }
  });

  it("production names snapshot: resolution + gender unchanged (65 names)", () => {
    expect(PROD_NAMES).toHaveLength(65);
    for (const [name, settleCanon, coupleCanon, alCanon, female] of PROD_NAMES) {
      expect(canonName(name), `canonName ${name}`).toBe(settleCanon);
      expect(canonCoupleName(name), `canonCoupleName ${name}`).toBe(coupleCanon);
      expect(canon(name, PROD_AL), `canon/AL ${name}`).toBe(alCanon);
      expect(isFemaleName(name), `isFemaleName ${name}`).toBe(female);
    }
  });
});

describe("wave4 finding 13 — one cps source", () => {
  it("resolveCps: live ← config ← default, invalid values fall through", () => {
    expect(resolveCps({ cps: 4 }, { chipsPerShekel: 2 })).toBe(4);
    expect(resolveCps({ cps: 2 }, { chipsPerShekel: 4 })).toBe(2);
    expect(resolveCps({}, { chipsPerShekel: 4 })).toBe(4);
    expect(resolveCps(null, { chipsPerShekel: 4 })).toBe(4);
    expect(resolveCps(null, null)).toBe(CPS);
    expect(resolveCps({ cps: 0 }, { chipsPerShekel: 4 })).toBe(4);
    expect(resolveCps({ cps: "4" }, null)).toBe(4);
    expect(resolveCps({ cps: -1 }, {})).toBe(CPS);
    expect(CPS).toBe(2);
  });

  it("viewerCps delegates to the same resolution", () => {
    expect(viewerCps({ config: { chipsPerShekel: 4 } }, null)).toBe(4);
    expect(viewerCps({ config: { chipsPerShekel: 2 } }, { cps: 3 })).toBe(3);
    expect(viewerCps(null, null)).toBe(2);
  });

  it("whatsapp route resolves cps through resolveCps (source lock)", () => {
    const src = readSrc("app/api/whatsapp/route.js");
    expect(src).toContain("resolveCps(attemptLive, attemptRow.config)");
    expect(src).not.toContain("applyCommands(attemptLive, cmds, msg.id, undefined");
  });

  it("chipRecords: per-night gate from session.cps; the never-written db field is ignored", () => {
    const s4 = { iso: "2026-10-05", d: 5, mo: 10, y: 2026, cps: 4, entries: [{ name: "קובי", buyin: 100, amount: 50 }] };
    const sDef = { iso: "2026-10-12", d: 12, mo: 10, y: 2026, entries: [{ name: "קובי", buyin: 100, amount: 50 }] };
    // (100+50)×4 = 600 מול (100+50)×2 = 300
    const nights = chipCashoutNights([s4, sDef], {});
    expect(nights.map((n) => n.chips)).toEqual([600, 300]);
    const recs = computeChipRecords({ sessions: [s4, sDef], aliases: {}, chipsPerShekel: 4 });
    expect(recs.bestCashout.chips).toBe(600);
    /* הערב בלי cps נשאר 300 למרות chipsPerShekel=4 על ה־db —
       לפני גל 4 השדה המת הזה היה קובע את כל הערבים ל־600. */
    expect(recs.bestCashout2.chips).toBe(300);
    expect(recs.nightsWithChips).toBe(2);
    // cps מפורש של הקורא עדיין גובר על שער הערב
    expect(chipCashoutNights([sDef], {}, 4)[0].chips).toBe(600);
    expect(sessionHasChips(s4, {})).toBe(true);
  });
});

describe("wave4 finding 14 — one 5% constant, one pot formula", () => {
  it("potForBuyin is the single formula over POT_RATE", () => {
    expect(POT_RATE).toBe(0.05);
    expect(potForBuyin(50)).toBe(2.5);
    expect(potForBuyin(100)).toBe(5);
    expect(potForBuyin(30)).toBe(1.5);
    expect(potForBuyin(1750)).toBe(87.5);
    expect(potForBuyin(0)).toBe(0);
    expect(potForBuyin("")).toBe(0);
  });

  it("per-entry sum == total formula for integer buyins (production shape)", () => {
    const amounts = [50, 100, 150, 200, 30, 70, 90, 10, 250, 500, 1000];
    const total = amounts.reduce((s, x) => s + x, 0);
    const perEntry = r2(amounts.reduce((s, x) => s + potForBuyin(x), 0));
    expect(perEntry).toBe(r2(total * POT_RATE));
  });

  it("potRecordedFor fallback uses the one formula — 1,750 → 87.5, not 88", () => {
    const s = {
      iso: "2026-10-20",
      savings5: true,
      entries: [
        { name: "א", buyin: 1000, chips: 1 },
        { name: "ב", buyin: 750, chips: 1 },
      ],
    };
    expect(potRecordedFor(s)).toBe(87.5);
    const recorded = { ...s, savingsPot: 93 };
    expect(potRecordedFor(recorded)).toBe(93);
  });

  it("no hardcoded 0.05/0.95 left in the pot paths (source lock)", () => {
    for (const p of ["lib/wa/state.ts", "lib/nightShare.js", "components/poker/LiveTab.jsx", "components/poker/live/LiveBuyinControls.jsx"]) {
      const src = readSrc(p);
      expect(src, p).not.toMatch(/\*\s*0\.05|0\.95\s*\*/);
      expect(src, p).toContain("potForBuyin");
    }
  });
});

describe("wave4 — one default-buyin source", () => {
  it("DEFAULT_BUYIN is 50 and parse defaults flow from it", () => {
    expect(DEFAULT_BUYIN).toBe(50);
    const cmds = parseCommands("קובי נכנס", undefined, false);
    expect(cmds[0]).toMatchObject({ kind: "add", amount: 50 });
    const cmds100 = parseCommands("קובי נכנס", 100, false);
    expect(cmds100[0]).toMatchObject({ kind: "add", amount: 100 });
  });

  it("bot blank() and live merge fall back to DEFAULT_BUYIN", () => {
    expect(blank(null).addAmt).toBe(50);
    expect(blank({ addAmt: 100 }).addAmt).toBe(100);
    const merged = mergeLiveStates({ players: [] }, { players: [] });
    expect(merged.addAmt).toBe(50);
  });

  it("route resolves the parse default via live ← config.defaultBuyin ← DEFAULT_BUYIN (source lock)", () => {
    const src = readSrc("app/api/whatsapp/route.js");
    expect(src).toContain("live?.addAmt || row.config?.defaultBuyin || DEFAULT_BUYIN");
  });
});
