/* גל 7, פריט 7.5 — קופת קבוצה נגזרת־בלבד + סגירות.

   (א) מונה db.savingsPot הקבוצתי כבר לא מתוחזק ידנית ולא נקרא:
   שלושת הכותבים לשעבר (סיום ערב בלייב, עריכת רשום בדשבורד,
   עריכת רשום בכרטיס החלוקה האחרונה) נוגעים רק בערב; היתרה תמיד
   נגזרת מ־potOverview. כאן: יתרות על פיקסצ'רת 24.10 ועל ערבי
   משיכות, ואי־תלות מוחלטת בערך המונה השמור (הוא נשאר בנתונים).
   (ב) InputTab.openSplit עובר דרך playersFromSession — כאן מאומת
   שהענף הנטו שלו נותן בדיוק את מה שהאינליין הישן נתן (buyin/cashout),
   וש־settle מחזיר אותן העברות על שני הקלטים. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { NIGHT_24_10 } from "./fixtures/night-2026-10-24.js";
import { potOverview } from "../lib/paymentTracking.js";
import { playersFromSession } from "../lib/nightShare.js";
import { settle } from "../lib/settlement.ts";
import { FEMALE_NAMES } from "../lib/poker/names.js";
import { FEMALE as FEMALE_HELPERS } from "../lib/poker/helpers.js";
import { FEMALE as FEMALE_GENDER } from "../lib/gender.js";

const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("wave7 7.5א — יתרות נגזרות בלבד", () => {
  it("פיקסצ'רת 24.10: רשום 163, בפועל 140 — גם עם מונה שמור רקוב", () => {
    const db = { sessions: [NIGHT_24_10], savingsWithdrawals: [], savingsPot: 999999 };
    const ov = potOverview(db);
    expect(ov.totalRecorded).toBe(93);
    expect(ov.totalActual).toBe(70);
    expect(ov.balance).toBe(70);
    expect(ov.balanceRecorded).toBe(93);
  });

  it("הזהב המלא של הפנקס: 24.10 + ערב 70 + משיכה 30 → רשום 163 / בפועל 140 / יתרה 110", () => {
    const other = {
      id: "w-night", iso: "2026-10-10", d: 10, mo: 10, y: 2026,
      entries: [{ name: "עדן גיל", amount: -70 }],
      savingsPot: 70, savingsPotActual: 70,
    };
    const db = {
      sessions: [NIGHT_24_10, other],
      savingsWithdrawals: [{ label: "מפת פוקר", amount: 30 }],
      savingsPot: 12345, // מונה שמור רקוב בכוונה — אסור שישפיע
    };
    const ov = potOverview(db);
    expect(ov.totalRecorded).toBe(163);
    expect(ov.totalActual).toBe(140);
    expect(ov.withdrawn).toBe(30);
    expect(ov.balance).toBe(110);
    expect(ov.balanceRecorded).toBe(133);
  });

  it("בלי שדה מונה בכלל — אותן יתרות בדיוק", () => {
    const other = {
      id: "w-night", iso: "2026-10-10", d: 10, mo: 10, y: 2026,
      entries: [{ name: "עדן גיל", amount: -70 }],
      savingsPot: 70, savingsPotActual: 70,
    };
    const db = { sessions: [NIGHT_24_10, other], savingsWithdrawals: [{ label: "מפת פוקר", amount: 30 }] };
    const ov = potOverview(db);
    expect(ov.balance).toBe(110);
    expect(ov.totalRecorded).toBe(163);
  });

  it("הכותבים כבר לא כותבים את מונה הקבוצה (סריקת מקור)", () => {
    for (const rel of [
      "../components/poker/LiveTab.jsx",
      "../components/poker/PotDashboard.jsx",
      "../components/poker/LastSettlementCard.jsx",
    ]) {
      const code = src(rel);
      expect(code, rel).not.toMatch(/savingsPot:\s*new(Total|Pot)/);
      expect(code, rel).not.toContain("Number(db.savingsPot)");
    }
  });
});

describe("wave7 7.5ב — InputTab על playersFromSession + FEMALE אחד", () => {
  it("ענף הנטו של playersFromSession זהה לאינליין הישן של InputTab", () => {
    const entries = [
      { name: "עדן גיל", amount: -530 },
      { name: "אורן גיל", amount: 320 },
      { name: "ירין מלאך", amount: 0 },
    ];
    const viaShared = playersFromSession({ entries });
    const viaOldInline = entries.map((e) => ({
      name: e.name,
      buyin: e.amount < 0 ? -e.amount : 0,
      cashout: String(Math.max(0, e.amount)),
    }));
    expect(viaShared.map(({ tipsGiven, ...rest }) => rest)).toEqual(viaOldInline);
    /* וההבדל היחיד הוא tipsGiven — ש־settle לא קורא: */
    const withTips = viaShared.map((p) => ({ ...p, tipsGiven: 999 }));
    expect(settle(withTips, 1).transfers).toEqual(settle(viaOldInline, 1).transfers);
    expect(settle(viaShared, 1).transfers).toEqual(settle(viaOldInline, 1).transfers);
  });

  it("InputTab מייבא את playersFromSession ולא משכפל את ענף הנפילה (סריקת מקור)", () => {
    const code = src("../components/poker/InputTab.jsx");
    expect(code).toContain("playersFromSession");
    expect(code).not.toContain("buyin: e.amount < 0 ? -e.amount : 0");
  });

  it("FEMALE: רשימה אחת ב־names.js, שני הצרכנים נגזרים ממנה", () => {
    expect([...FEMALE_HELPERS].sort()).toEqual([...FEMALE_NAMES].sort());
    expect([...FEMALE_GENDER].sort()).toEqual([...FEMALE_NAMES].sort());
    expect(FEMALE_NAMES).toEqual(["אורן גיל", "אורן", "ירדן תפילין", "ירדן"]);
    const namesSrc = src("../lib/poker/names.js");
    expect(namesSrc).toContain("FEMALE_NAMES");
    /* אין רשימה שנייה קשיחה בשום קובץ צרכן */
    for (const rel of ["../lib/poker/helpers.js", "../lib/gender.js"]) {
      expect(src(rel), rel).not.toContain('"ירדן תפילין"');
    }
  });
});
