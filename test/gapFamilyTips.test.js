/* ממצא 2 מביקורת משפחת־הפער (19.11.2026): סך הטיפים של אותו ערב
   הוצג אחרת בכל משטח — או/או גלובלי בדוח התקופתי ובשיאים (30),
   כלל פר־שחקן רביעי בסטטיסטיקת השחקן (80), ו־max פר־שחקן בטבלת
   הוואטסאפ (130). הבדיקות מעגנות את הכלל הקנוני האחד, שהוא גם
   סמנטיקת מסלולי הכתיבה (כל טיפ נכתב גם ליומן וגם ל־tipsGiven):
   פר־שחקן max(סכום אירועי היומן, tipsGiven) — על דוגמת הביקורת:
   שחקן א' עם אירוע יומן 30 ו־tipsGiven מצטבר 80, שחקן ב' עם
   tipsGiven‏ 50 בלי יומן ⇒ א'=80, ב'=50, סך ערב 130 בכל משטח. */
import { describe, it, expect } from "vitest";
import { tipTotalsByName } from "../lib/nightShare.js";
import { sessionTips, computeTipRecords } from "../lib/poker/tipRecords.js";
import { buildPeriodReport } from "../lib/summary.js";
import { computePersonalStats } from "../lib/poker/personalStats";

const divergentNight = {
  iso: "2026-08-01",
  d: 1,
  mo: 8,
  y: 2026,
  entries: [
    { name: "א", amount: 100, tipsGiven: 80 },
    { name: "ב", amount: -100, tipsGiven: 50 },
  ],
  tips: [{ name: "א", amount: 30, at: 1 }],
};

describe("הכלל הקנוני — tipTotalsByName", () => {
  it("פר־שחקן max(יומן, tipsGiven): א'=80, ב'=50", () => {
    expect(tipTotalsByName(divergentNight)).toEqual({ "א": 80, "ב": 50 });
  });
});

describe("sessionTips — נגזר מהמקור הקנוני", () => {
  it("שורה אחת לכל שחקן עם הסכום הקנוני", () => {
    const rows = sessionTips(divergentNight);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ name: "א", amount: 80, at: null });
    expect(rows).toContainEqual({ name: "ב", amount: 50, at: null });
  });

  it("ערב עם יומן בלבד — סכומי היומן כמו קודם", () => {
    const rows = sessionTips({
      entries: [{ name: "א", amount: 0 }],
      tips: [
        { name: "א", amount: 20, at: 1 },
        { name: "א", amount: 5, at: 2 },
      ],
    });
    expect(rows).toEqual([{ name: "א", amount: 25, at: null }]);
  });
});

describe("שיאי טיפים — סכומים קנוניים, שיאי אירוע מהיומן", () => {
  it("סך הערב 130 ומלך הטיפים הוא א' עם 80", () => {
    const recs = computeTipRecords({ aliases: {}, sessions: [divergentNight] });
    expect(recs.allKing).toMatchObject({ name: "א", chips: 80 });
    expect(recs.lastTipsNight.chips).toBe(130);
  });

  it("הטיפ הבודד הגדול וכמות האירועים עדיין מהיומן (30, אירוע אחד)", () => {
    const recs = computeTipRecords({ aliases: {}, sessions: [divergentNight] });
    expect(recs.biggestTip).toMatchObject({ name: "א", amount: 30 });
    expect(recs.lastTipsNight.count).toBe(1);
  });
});

describe("דוח תקופתי — אותם מספרים", () => {
  it("ערב הטיפים 130 וטיפר התקופה א' עם 80", () => {
    const text = buildPeriodReport(
      { sessions: [divergentNight] },
      { kind: "m", y: 2026, mo: 8, key: "m:2026-08" }
    );
    expect(text).toContain("🎁 ערב הטיפים: 130 ג'");
    expect(text).toContain("💸 טיפר התקופה: א · 80 ג'יטונים");
  });
});

describe("סטטיסטיקת שחקן — אותו כלל פר־שחקן", () => {
  it("סך הטיפים של א' הוא 80, לא 30", () => {
    const db = { aliases: {}, sessions: [divergentNight] };
    const s = computePersonalStats(db, "א", { chat: false });
    expect(s.totalTips).toBe(80);
  });

  it("סך הטיפים של ב' (בלי יומן) הוא 50", () => {
    const db = { aliases: {}, sessions: [divergentNight] };
    const s = computePersonalStats(db, "ב", { chat: false });
    expect(s.totalTips).toBe(50);
  });
});
