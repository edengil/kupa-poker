/* פריט 9 (גל C, חלופה A) — מודול תביעת הריצה היומית + סימולציית זמן.
   המודול טהור: מפתח תביעה = תאריך ירושלים, תביעה פר־רץ, בלי שינוי קלט.
   הסימולציה בסוף הקובץ היא שער ההגדרה של הפריט: 730 ימים × שני זמני
   הירי היומיים (05:00/06:00 UTC) מול לוגיקת התביעה בשעון נשלט —
   בדיוק 730 ימים נתבעים, 0 שליחות כפולות, 0 ימים אבודים, כולל מעברי
   שעון קיץ/חורף ב־Asia/Jerusalem, ירי כפול וקריסה+ניסיון חוזר. */
import { describe, expect, it } from "vitest";
import {
  CRON_DAILY_RUNNERS,
  cronDailyClaimKey,
  cronDailyJerusalemHour,
  planCronDailyRun,
  markRunnerClaimed,
  claimedRunnersFor,
} from "../lib/cronDailyClaim.js";
import { jerusalemYmd, jerusalemHour } from "../lib/paymentReminder.js";

describe("cronDailyClaim — מפתח ושעה", () => {
  it("המפתח הוא תאריך ירושלים, לא UTC: 22:30 UTC בחורף הוא כבר מחר בישראל", () => {
    const d = new Date("2026-01-15T22:30:00.000Z"); // 00:30 ישראל למחרת
    expect(cronDailyClaimKey(d)).toBe("2026-01-16");
  });

  it("שני זמני הירי של אותו בוקר חולקים מפתח אחד, ורק אחד מהם בשעה 8", () => {
    // קיץ (UTC+3): 05:00 UTC = 08:00, ‏06:00 UTC = 09:00
    const summerA = new Date("2026-07-10T05:00:00.000Z");
    const summerB = new Date("2026-07-10T06:00:00.000Z");
    expect(cronDailyJerusalemHour(summerA)).toBe(8);
    expect(cronDailyJerusalemHour(summerB)).toBe(9);
    expect(cronDailyClaimKey(summerA)).toBe(cronDailyClaimKey(summerB));
    // חורף (UTC+2): 05:00 UTC = 07:00, ‏06:00 UTC = 08:00
    const winterA = new Date("2026-01-10T05:00:00.000Z");
    const winterB = new Date("2026-01-10T06:00:00.000Z");
    expect(cronDailyJerusalemHour(winterA)).toBe(7);
    expect(cronDailyJerusalemHour(winterB)).toBe(8);
    expect(cronDailyClaimKey(winterA)).toBe(cronDailyClaimKey(winterB));
  });

  it("זהה ל־jerusalemYmd/jerusalemHour הקנוניים על דגימות כולל ימי מעבר שעון", () => {
    const samples = [
      "2026-03-26T22:00:00.000Z", // ערב מעבר לקיץ
      "2026-03-27T00:30:00.000Z", // בתוך המעבר (02:00→03:00)
      "2026-03-27T05:00:00.000Z",
      "2026-10-24T21:30:00.000Z", // ערב מעבר לחורף
      "2026-10-25T06:00:00.000Z",
      "2026-07-01T21:00:00.000Z",
      "2026-12-31T22:30:00.000Z",
    ];
    for (const iso of samples) {
      const d = new Date(iso);
      expect(cronDailyClaimKey(d)).toBe(jerusalemYmd(d));
      expect(cronDailyJerusalemHour(d)).toBe(jerusalemHour(d));
    }
  });
});

describe("cronDailyClaim — תכנון וסימון", () => {
  const at = new Date("2026-11-26T06:00:00.000Z"); // 08:00 חורף
  const KEY = "2026-11-26";

  it("מצב ריק: כל הרצים ממתינים, אף אחד לא נתבע", () => {
    const plan = planCronDailyRun({}, at);
    expect(plan.key).toBe(KEY);
    expect(plan.claimed).toEqual([]);
    expect(plan.pending).toEqual(CRON_DAILY_RUNNERS);
  });

  it("סימון לא משנה את הקלט (בידוד מצב בין ריצות) ומצטבר פר־רץ", () => {
    const before = {};
    const after1 = markRunnerClaimed(before, KEY, "reports", at.toISOString());
    expect(before).toEqual({});
    expect(claimedRunnersFor(after1, KEY)).toEqual(["reports"]);
    const after2 = markRunnerClaimed(after1, KEY, "payments", at.toISOString());
    expect(claimedRunnersFor(after1, KEY)).toEqual(["reports"]);
    expect(claimedRunnersFor(after2, KEY)).toEqual(["reports", "payments"]);
    const plan = planCronDailyRun(after2, at);
    expect(plan.pending).toEqual(["notices", "pushes", "backups"]);
  });

  it("קלט חריג (null/מחרוזת/יום שבור) מתנהג כמצב ריק, לא זורק", () => {
    expect(planCronDailyRun(null, at).pending).toEqual(CRON_DAILY_RUNNERS);
    expect(planCronDailyRun("junk", at).claimed).toEqual([]);
    expect(claimedRunnersFor({ [KEY]: 42 }, KEY)).toEqual([]);
    expect(markRunnerClaimed(null, KEY, "reports", at.toISOString())[KEY].reports).toBe(at.toISOString());
  });

  it("גיזום: נשמרים רק שבעת המפתחות האחרונים", () => {
    let claims = {};
    for (let d = 1; d <= 10; d++) {
      const key = `2026-11-${String(d).padStart(2, "0")}`;
      claims = markRunnerClaimed(claims, key, "reports", at.toISOString());
    }
    expect(Object.keys(claims).sort()).toEqual([
      "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07",
      "2026-11-08", "2026-11-09", "2026-11-10",
    ]);
  });
});

/* ==========================================================================
   סימולציית זמן — 730 ימים × שני ירי UTC, שעון נשלט.
   מודל נאמן לנתיב: שער שעה 8 (ירושלים) → תכנון תביעה → הרצת הממתינים
   וסימונם. "שליחה" = הרצת רץ; שליחה כפולה = אותו רץ רץ פעמיים לאותו יום.
   ========================================================================== */
describe("סימולציית זמן — 730 ימים", () => {
  const START = Date.UTC(2025, 2, 1); // 2025-03-01
  const DAYS = 730;

  function simulate({ duplicateEvery = 0, crashDays = new Set() } = {}) {
    let claims = {};
    const sends = new Map(); // `${key}|${runner}` -> count
    const claimedDays = new Set();
    let duplicateSends = 0;

    const fire = (when, { crashAfterFirst = false } = {}) => {
      if (cronDailyJerusalemHour(when) !== 8) return "hour-skip";
      const plan = planCronDailyRun(claims, when);
      let ran = 0;
      for (const name of plan.pending) {
        const id = `${plan.key}|${name}`;
        sends.set(id, (sends.get(id) || 0) + 1);
        if (sends.get(id) > 1) duplicateSends++;
        claims = markRunnerClaimed(claims, plan.key, name, when.toISOString());
        ran++;
        if (crashAfterFirst && ran === 1) return "crashed";
      }
      if (plan.pending.length && ran === plan.pending.length) claimedDays.add(plan.key);
      if (!plan.pending.length) claimedDays.add(plan.key);
      return ran ? "ran" : "noop";
    };

    for (let i = 0; i < DAYS; i++) {
      const day = START + i * 86_400_000;
      const key = cronDailyClaimKey(new Date(day + 12 * 3_600_000));
      const crash = crashDays.has(key);
      for (const hourUtc of [5, 6]) {
        const when = new Date(day + hourUtc * 3_600_000);
        const res = fire(when, { crashAfterFirst: crash });
        if (res === "crashed") {
          /* ניסיון חוזר באותו חלון: הרץ שהושלם נתבע — לא יישלח שוב */
          fire(when);
        }
      }
      if (duplicateEvery && i % duplicateEvery === 0) {
        /* ירי כפול מלא של אותו בוקר (שעת הירי האפקטיבית שוב) */
        for (const hourUtc of [5, 6]) fire(new Date(day + hourUtc * 3_600_000));
      }
    }
    return { claims, sends, claimedDays, duplicateSends };
  }

  it("730 ימים × 2 ירי: בדיוק 730 ימים נתבעים, 0 כפולות, 0 אבודים", () => {
    const { sends, claimedDays, duplicateSends } = simulate();
    expect(claimedDays.size).toBe(DAYS);
    expect(duplicateSends).toBe(0);
    /* כל רץ נשלח בדיוק פעם אחת בכל יום */
    expect(sends.size).toBe(DAYS * CRON_DAILY_RUNNERS.length);
    for (const count of sends.values()) expect(count).toBe(1);
  });

  it("ירי כפול כל 7 ימים: עדיין 0 שליחות כפולות ו־730 ימים", () => {
    const { claimedDays, duplicateSends } = simulate({ duplicateEvery: 7 });
    expect(claimedDays.size).toBe(DAYS);
    expect(duplicateSends).toBe(0);
  });

  it("קריסה באמצע ריצה בימי מעבר שעון + ניסיון חוזר: אין כפולה ואין יום אבוד", () => {
    const crashDays = new Set([
      "2025-03-28", "2025-10-26", // מעברי 2025 (קיץ/חורף)
      "2026-03-27", "2026-10-25", // מעברי 2026
      "2026-11-26",
    ]);
    const { sends, claimedDays, duplicateSends } = simulate({ crashDays });
    expect(claimedDays.size).toBe(DAYS);
    expect(duplicateSends).toBe(0);
    for (const count of sends.values()) expect(count).toBe(1);
  });

  it("בכל אחד מ־730 הימים בדיוק אחד משני היריים נוחת ב־08:00 ירושלים (גם בימי DST)", () => {
    for (let i = 0; i < DAYS; i++) {
      const day = START + i * 86_400_000;
      const hits = [5, 6].filter(
        (h) => cronDailyJerusalemHour(new Date(day + h * 3_600_000)) === 8
      );
      expect(hits).toHaveLength(1);
    }
  });
});
