import { describe, it, expect } from "vitest";
import { paymentPlan } from "../lib/paymentTracking.js";
import { computePaymentSpeed, paymentSpeedForPlayer, formatPaymentDelay } from "../lib/poker/paymentSpeed.js";
import { computeRollingHeroes } from "../lib/poker/monthHeroes.js";
import { computeRecords } from "../lib/poker/computeRecords.js";
import { computeOpenDebts } from "../lib/poker/openDebts.js";
import { computeLivePace, averageNightMs, formatClock } from "../lib/poker/livePace.js";
import { computeBustRecords, formatSurvivalMs } from "../lib/poker/bustRecords.js";
import { computeNightHype } from "../lib/poker/nightHype.js";
import { computeAttendance, buildAttendanceSnapshot } from "../lib/poker/attendance.js";
import { playerOfNightTally, voteForPlayer, playerOfNightWins } from "../lib/poker/playerOfNight.js";
import { paymentReminderDue, buildPaymentReminderText, unpaidTransfers } from "../lib/paymentReminder.js";

const T0 = Date.parse("2026-09-10T20:00:00Z");
const isoHoursAfter = (base, hours) => new Date(base + hours * 3600000).toISOString();

/** ערב עם חלוקה אמיתית (מחושבת מהקוד) ואישור תשלום מתוזמן. */
function settledSession({ id, iso, endedAt, confirmAt, payer = "אבי", payee = "משה", amount = 100 }) {
  const base = {
    id,
    iso,
    d: Number(iso.slice(8, 10)),
    mo: Number(iso.slice(5, 7)),
    y: Number(iso.slice(0, 4)),
    endedAt,
    entries: [
      { name: payer, amount: -amount },
      { name: payee, amount },
    ],
  };
  const { fingerprint } = paymentPlan(base);
  return {
    ...base,
    payments: {
      plan: fingerprint,
      paid: confirmAt ? { 0: true } : {},
      received: {},
      confirmations: confirmAt
        ? [{ index: 0, action: "paid", by: payer, at: confirmAt }]
        : [],
    },
  };
}

describe("המשלם המהיר", () => {
  const db = {
    aliases: {},
    sessions: [
      settledSession({ id: "a", iso: "2026-09-10", endedAt: T0, confirmAt: isoHoursAfter(T0, 10) }),
      settledSession({ id: "b", iso: "2026-09-12", endedAt: T0 + 2 * 86400000, confirmAt: isoHoursAfter(T0 + 2 * 86400000, 30) }),
      settledSession({ id: "c", iso: "2026-09-14", endedAt: T0 + 4 * 86400000, confirmAt: null }),
    ],
  };

  it("מחשב חציון מזמן סיום הערב עד אישור התשלום", () => {
    const speed = computePaymentSpeed(db);
    expect(speed.fastest.name).toBe("אבי");
    expect(speed.fastest.medianHours).toBe(20);
    expect(speed.fastest.samples).toBe(2);
    expect(speed.nightsUsed).toBe(2);
  });

  it("מדלג על ערבים בלי זמן פרסום ובלי אישורים", () => {
    const noTime = { aliases: {}, sessions: [{ id: "x", iso: "2026-09-01", entries: db.sessions[0].entries }] };
    expect(computePaymentSpeed(noTime).totalSamples).toBe(0);
    expect(paymentSpeedForPlayer(db, "אבי").medianHours).toBe(20);
    expect(paymentSpeedForPlayer(db, "משה")).toBeNull();
  });

  it("מעדיף את זמן עדכון החלוקה הידנית כשיש", () => {
    const manual = settledSession({ id: "m", iso: "2026-09-10", endedAt: T0, confirmAt: isoHoursAfter(T0, 50) });
    manual.manualSettlement = { settlementUpdatedAt: isoHoursAfter(T0, 40) };
    // בלי manualSettlement אמיתי paymentPlan נופל לחישוב רגיל; זמן הפרסום מגיע מהשדה
    const speed = computePaymentSpeed({ aliases: {}, sessions: [manual, db.sessions[1]] });
    expect(speed.byName["אבי"].samples).toBeGreaterThan(0);
  });

  it("פורמט משך", () => {
    expect(formatPaymentDelay(0.5)).toBe("פחות משעה");
    expect(formatPaymentDelay(5)).toBe("5 שעות");
    expect(formatPaymentDelay(72)).toBe("3 ימים");
  });
});

describe("אלוף 30 הימים המתגלגלים", () => {
  it("מסכם רק את החלון ומוצא מוביל ונופל", () => {
    const mk = (iso, a, b) => ({
      id: iso, iso, d: 1, mo: 9, y: 2026,
      entries: [{ name: "אבי", amount: a }, { name: "משה", amount: b }],
    });
    const db = { aliases: {}, sessions: [mk("2026-08-01", 500, -500), mk("2026-09-20", 100, -100), mk("2026-09-25", 50, -50)] };
    const rolling = computeRollingHeroes(db);
    expect(rolling.nights).toBe(2);
    expect(rolling.hero).toEqual({ name: "אבי", amount: 150 });
    expect(rolling.flop).toEqual({ name: "משה", amount: -150 });
  });
});

describe("תנודתיות מתגלגלת", () => {
  it("מחשבת סטיית תקן רק על 30 הימים האחרונים ודורשת 3 ערבים", () => {
    const mk = (iso, amt) => ({
      id: iso, iso, d: 1, mo: 9, y: 2026,
      entries: [{ name: "אבי", amount: amt }, { name: "משה", amount: -amt }],
    });
    const db = {
      aliases: {},
      sessions: [
        mk("2026-06-01", 1000), mk("2026-06-02", -1000), mk("2026-06-03", 1000), mk("2026-06-04", -1000), mk("2026-06-05", 1000),
        mk("2026-09-20", 100), mk("2026-09-22", -100), mk("2026-09-24", 300),
      ],
    };
    const recs = computeRecords(db);
    expect(recs.rollingRoller).not.toBeNull();
    expect(recs.rollingRoller.windowDays).toBe(30);
    expect(recs.rollingRoller.nights).toBe(3);
    expect(recs.rollingRoller.sd).toBeGreaterThan(0);
    expect(recs.rollingRoller.sd).toBeLessThan(recs.roller.sd);
  });
});

describe("חובות פתוחים חוצה־ערבים", () => {
  it("מאגד לפי חייב עם גיל חוב", () => {
    const open = settledSession({ id: "a", iso: "2026-09-01", endedAt: T0, confirmAt: null });
    const closed = settledSession({ id: "b", iso: "2026-09-05", endedAt: T0, confirmAt: isoHoursAfter(T0, 5) });
    const debts = computeOpenDebts({ aliases: {}, sessions: [open, closed] }, { now: Date.parse("2026-09-11T12:00:00Z") });
    expect(debts.debtors).toHaveLength(1);
    expect(debts.debtors[0].name).toBe("אבי");
    expect(debts.debtors[0].total).toBe(100);
    expect(debts.debtors[0].ageDays).toBe(10);
    expect(debts.nights).toHaveLength(1);
  });
});

describe("קצב הערב", () => {
  it("פעולות לשעה וסיום משוער ממשך ממוצע", () => {
    const start = Date.parse("2026-09-10T18:00:00Z");
    const pace = computeLivePace({ startedAt: start, actionCount: 30, now: start + 2 * 3600000, avgNightMs: 5 * 3600000 });
    expect(pace.actionsPerHour).toBe(15);
    expect(formatClock(pace.projectedEnd)).toBeTruthy();
    expect(computeLivePace({ startedAt: null, actionCount: 3 })).toBeNull();
  });

  it("משך ממוצע רק מערבים עם התחלה וסיום", () => {
    expect(averageNightMs([{ startedAt: 0, endedAt: 5 }, { startedAt: 100, endedAt: 100 }])).toBeNull();
    expect(averageNightMs([{ startedAt: 1000, endedAt: 1000 + 7200000 }])).toBe(7200000);
  });
});

describe("שיאי יציאה מערבי לייב", () => {
  const H = 3600000;
  const db = {
    aliases: {},
    sessions: [
      {
        id: "live1", iso: "2026-09-10",
        entries: [{ name: "אבי", amount: 0 }, { name: "משה", amount: 0 }],
        actionLog: [
          { t: "seat", name: "אבי", at: T0 },
          { t: "seat", name: "משה", at: T0 },
          { t: "cashout", name: "אבי", chips: "0", at: T0 + 0.5 * H },
          { t: "cashout", name: "משה", chips: "200", at: T0 + 4 * H },
        ],
      },
      {
        id: "live2", iso: "2026-09-12",
        entries: [{ name: "משה", amount: 0 }],
        actionLog: [
          { t: "seat", name: "משה", at: T0 },
          { t: "cashout", name: "משה", chips: "100", at: T0 + 5 * H },
        ],
      },
      // ערב בלי יומן פעולות — לא נכנס, לא ממציאים זמני יציאה
      { id: "old", iso: "2026-08-01", entries: [{ name: "אבי", amount: 10 }] },
    ],
  };

  it("יציאה הכי מהירה ואיש הברזל רק מערבי לייב", () => {
    const recs = computeBustRecords(db);
    expect(recs.liveNights).toBe(2);
    expect(recs.fastestExit.name).toBe("אבי");
    expect(recs.fastestExit.survivalMs).toBe(0.5 * H);
    expect(recs.ironMan.name).toBe("משה");
    expect(recs.ironMan.nights).toBe(2);
    expect(formatSurvivalMs(0.5 * H)).toBe("30 דק׳");
  });

  it("אין יומני לייב — אין שיאים", () => {
    expect(computeBustRecords({ sessions: [{ id: "x", entries: [] }] })).toBeNull();
  });
});

describe("כרטיס הייפ לפני ערב", () => {
  it("בונה שורת הייפ מהטופס החם", () => {
    const mk = (iso, amt) => ({
      id: iso, iso, d: 1, mo: 9, y: 2026,
      entries: [{ name: "אבי", amount: amt }, { name: "משה", amount: -amt }],
    });
    const db = { aliases: {}, sessions: [mk("2026-09-01", 100), mk("2026-09-03", 120), mk("2026-09-05", 90), mk("2026-09-07", 110), mk("2026-09-09", 80)] };
    const hype = computeNightHype(db);
    expect(hype).not.toBeNull();
    expect(hype.text).toContain("אבי");
    expect(computeNightHype({ sessions: [] })).toBeNull();
  });
});

describe("מדד אמינות הגעה", () => {
  it("בלי צילומים — אין מספיק נתונים", () => {
    const res = computeAttendance({ aliases: {}, sessions: [{ id: "a", entries: [] }] });
    expect(res.nights).toBe(0);
    expect(res.enough).toBe(false);
  });

  it("מחשב אמינות מצילומים שנשמרו", () => {
    const mk = (id, yes, actual) => ({
      id,
      entries: actual.map((name) => ({ name, amount: 0 })),
      attendance: { rsvp: { yes, maybe: [], no: [] }, actual },
    });
    const db = { aliases: {}, sessions: [mk("a", ["אבי", "משה"], ["אבי", "משה"]), mk("b", ["אבי", "משה"], ["אבי"])] };
    const res = computeAttendance(db);
    expect(res.enough).toBe(true);
    expect(res.mostReliable.name).toBe("אבי");
    expect(res.mostReliable.reliability).toBe(100);
    expect(res.biggestNoShow.name).toBe("משה");
  });

  it("בונה צילום משורות אישורי הגעה", () => {
    const snap = buildAttendanceSnapshot({
      rsvpRows: [{ status: "yes", playerName: "אבי" }, { status: "no", playerName: "משה" }, { status: "yes", name: "אבי" }],
      actualNames: ["אבי"],
    });
    expect(snap.rsvp.yes).toEqual(["אבי"]);
    expect(snap.rsvp.no).toEqual(["משה"]);
    expect(snap.actual).toEqual(["אבי"]);
  });
});

describe("הצבעת שחקן הערב", () => {
  const session = {
    id: "s1",
    entries: [{ name: "אבי", amount: 50 }, { name: "משה", amount: -50 }],
  };

  it("סופר קולות ומוצא זוכה", () => {
    let s = voteForPlayer(session, "משה", "אבי");
    s = voteForPlayer(s, "אבי", "אבי");
    s = voteForPlayer(s, "גדי", "משה");
    const tally = playerOfNightTally(s);
    expect(tally.winner).toEqual({ name: "אבי", count: 2 });
    expect(playerOfNightWins({ aliases: {}, sessions: [s] })).toEqual({ "אבי": 1 });
  });

  it("דוחה מועמד שלא ישב בערב", () => {
    expect(voteForPlayer(session, "אבי", "גדי")).toBe(session);
  });
});

describe("תזכורת תשלום אישית", () => {
  const session = settledSession({ id: "a", iso: "2026-09-10", endedAt: T0, confirmAt: null });

  it("חייב מהיר היסטורית — ימי חסד לפני תזכורת", () => {
    const stats = { "אבי": { medianHours: 5, samples: 4 } };
    expect(paymentReminderDue(session, "2026-09-11", { paymentStats: stats }).due).toBe(false);
    expect(paymentReminderDue(session, "2026-09-14", { paymentStats: stats }).due).toBe(true);
  });

  it("חייב איטי — תזכורת מהבוקר הראשון עם שורה אישית", () => {
    const stats = { "אבי": { medianHours: 90, samples: 3 } };
    expect(paymentReminderDue(session, "2026-09-11", { paymentStats: stats }).due).toBe(true);
    const text = buildPaymentReminderText(session, unpaidTransfers(session), { siteUrl: "https://x", slug: "g", paymentStats: stats });
    expect(text).toContain("אבי");
    expect(text).toContain("להזכיר מוקדם");
  });

  it("בלי נתוני מהירות — ההתנהגות הישנה בדיוק", () => {
    expect(paymentReminderDue(session, "2026-09-11").due).toBe(true);
  });
});
