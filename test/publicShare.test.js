import { describe, expect, it } from "vitest";
import { snapshotForViewer, viewerCps } from "../lib/publicShare.js";
import { paymentPlan } from "../lib/paymentTracking.js";
import { NIGHT_24_10 } from "./fixtures/night-2026-10-24.js";

describe("publicShare", () => {
  it("keeps history when shareHistory is on or unset", () => {
    const snap = {
      config: {},
      data: { sessions: [{ id: "1" }], yearly: [{ y: 2026 }], monthly: [] },
    };
    expect(snapshotForViewer(snap).data.sessions).toHaveLength(1);
  });

  it("keeps only the latest session when shareHistory is false", () => {
    const snap = {
      config: { shareHistory: false },
      data: {
        sessions: [
          { id: "old", iso: "2026-08-01", d: 1, mo: 8, y: 2026, entries: [] },
          { id: "new", iso: "2026-09-10", d: 10, mo: 9, y: 2026, endedAt: 2000, entries: [] },
        ],
        yearly: [{ y: 2026 }],
        monthly: [{ mo: 1 }],
        plan: { iso: "2026-09-10" },
        roster: ["דן"],
        aliases: { דן: "דן ינקלויץ" },
      },
    };
    const out = snapshotForViewer(snap);
    expect(out.data.sessions).toHaveLength(1);
    expect(out.data.sessions[0].id).toBe("new");
    expect(out.data.yearly).toEqual([]);
    expect(out.data.monthly).toEqual([]);
    expect(out.data.plan).toEqual({ iso: "2026-09-10" });
    expect(out.data.roster).toEqual([]);
    expect(out.data.aliases).toEqual({ דן: "דן ינקלויץ" });
  });

  it("reads chips-per-shekel from config for viewers", () => {
    expect(viewerCps({ config: { chipsPerShekel: 4 } }, null)).toBe(4);
    expect(viewerCps({ config: { chipsPerShekel: 2 } }, { cps: 3 })).toBe(3);
  });

  it("F4: frozenActual לא דולף לצופה — מפת החוסר הקפואה כן נשארת", () => {
    const frozen = {
      ...NIGHT_24_10,
      manualSettlement: { ...NIGHT_24_10.manualSettlement, frozenActual: 70 },
    };
    const snap = { id: "g1", config: { shareHistory: true }, data: { sessions: [frozen] } };
    const out = snapshotForViewer(snap);
    expect(JSON.stringify(out)).not.toContain("frozenActual");
    const viewerSession = out.data.sessions[0];
    expect("frozenActual" in (viewerSession.manualSettlement || {})).toBe(false);
    // בלי frozenActual ה־manualSettlement של הצופה זהה לזה של המנהל
    const { frozenActual, ...expectedMs } = frozen.manualSettlement;
    expect(viewerSession.manualSettlement).toEqual(expectedMs);
    // וסכומי השחקנים שהצופה מחשב זהים לאלה של המנהל
    expect(paymentPlan(viewerSession).transfers).toEqual(paymentPlan(frozen).transfers);
  });

  it("גל 1: גם הלייב מוקרן — שדות קופה ו־coupleFills יוצאים, שחקנים ו־cps נשארים", () => {
    const snap = {
      config: { shareHistory: true },
      data: { sessions: [] },
      live: {
        players: [{ name: "עדן גיל", buyin: 200 }],
        cps: 4,
        savingsPot: 25,
        savingsPotActual: 20,
        potDraft: { amount: 93 },
        coupleFills: [{ from: "עדן גיל", to: "אורן גיל", amount: 100 }],
      },
    };
    const out = snapshotForViewer(snap);
    expect(out.live.players).toHaveLength(1);
    expect(out.live.cps).toBe(4);
    const s = JSON.stringify(out.live);
    for (const token of ["savingsPot", "savingsPotActual", "potDraft", "coupleFills"]) {
      expect(s).not.toContain(token);
    }
    // אידמפוטנטי: הקרנה כפולה לא משנה כלום
    expect(snapshotForViewer(out)).toEqual(out);
  });

  it("גל 2ב: מזהה החותמת הפנימי (sid) של הבוט לא דולף לצופה — לא מהלייב ולא מערב שמור", () => {
    const ev = { amount: 50, at: 1700000000000, total: 50, pot: 2.5, sid: "wamid.123:0" };
    const snap = {
      config: { shareHistory: true },
      data: {
        sessions: [
          { id: "s1", iso: "2026-10-30", endedAt: 5, entries: [{ name: "עדן גיל", buyin: 50, buyinEvents: [ev] }] },
        ],
      },
      live: { players: [{ name: "עדן גיל", buyin: 50, buyinEvents: [ev] }], cps: 2 },
    };
    const out = snapshotForViewer(snap);
    expect(JSON.stringify(out)).not.toContain('"sid"');
    expect(JSON.stringify(out)).not.toContain("wamid");
    // שאר שדות האירוע — שכבר חשופים לצופה היום — נשארים כמו שהם
    const kept = { amount: 50, at: 1700000000000, total: 50, pot: 2.5 };
    expect(out.live.players[0].buyinEvents).toEqual([kept]);
    expect(out.data.sessions[0].entries[0].buyinEvents).toEqual([kept]);
    // אידמפוטנטי
    expect(snapshotForViewer(out)).toEqual(out);
  });

  it("גל 2ב סבב 5: applied של הבוט (יומן ביטולים עם צילומי ev ו־sid) לא מגיע לצופה כלל", () => {
    const ev = { amount: 50, at: 1700000000000, total: 50, pot: 2.5, sid: "wamid.123:0" };
    const snap = {
      config: { shareHistory: true },
      data: { sessions: [] },
      live: {
        players: [{ name: "עדן גיל", buyin: 50, buyinEvents: [ev] }],
        cps: 2,
        applied: {
          "wamid.123": [{ t: "add", name: "עדן גיל", delta: 50, created: true, ev }],
          "wamid.456": [{ t: "approve", name: "עדן גיל", ev: { ...ev, sid: "wamid.456:0" } }],
        },
      },
    };
    const out = snapshotForViewer(snap);
    // applied כולו בחוץ — לצופה אין בו שום שימוש, ובתוכו יושבים מזהי הודעות
    expect("applied" in out.live).toBe(false);
    const s = JSON.stringify(out.live);
    expect(s).not.toContain('"sid"');
    expect(s).not.toContain("wamid");
    // שאר הלייב נשאר: שחקנים, cps, ושדות האירוע החשופים
    expect(out.live.cps).toBe(2);
    expect(out.live.players[0].buyinEvents).toEqual([{ amount: 50, at: 1700000000000, total: 50, pot: 2.5 }]);
    // האובייקט המקורי לא נגעו בו — הבוט ממשיך לקרוא applied מהלייב הגולמי
    expect(snap.live.applied["wamid.123"][0].ev.sid).toBe("wamid.123:0");
    // אידמפוטנטי
    expect(snapshotForViewer(out)).toEqual(out);
  });

  it("גל 1: coupleFills של ערב שמור לא מגיע לצופה, בשני מצבי השיתוף", () => {
    const session = {
      id: "s1", iso: "2026-10-24", endedAt: 5, entries: [],
      coupleFills: [{ from: "א", to: "ב", amount: 10 }],
    };
    for (const cfg of [{ shareHistory: true }, { shareHistory: false }]) {
      const out = snapshotForViewer({ config: cfg, data: { sessions: [session] } });
      expect(JSON.stringify(out)).not.toContain("coupleFills");
      expect(out.data.sessions[0].id).toBe("s1");
    }
  });

  it("גל 1: snapshot בלי live לא ממציא מפתח live", () => {
    const out = snapshotForViewer({ config: {}, data: { sessions: [] } });
    expect("live" in out).toBe(false);
  });

  it("F4: ערך הבפועל עצמו לא מופיע בשום מקום בסריאליזציית הצופה", () => {
    const session = {
      ...NIGHT_24_10,
      savingsPotActual: 17.25,
      manualSettlement: { ...NIGHT_24_10.manualSettlement, frozenActual: 17.25 },
    };
    const snap = { id: "g1", config: { shareHistory: true }, data: { sessions: [session] } };
    const serialized = JSON.stringify(snapshotForViewer(snap));
    expect(serialized).not.toContain("frozenActual");
    expect(serialized).not.toContain("17.25");
    expect(serialized).not.toContain("savingsPotActual");
  });
});
