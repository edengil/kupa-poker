import { describe, expect, it } from "vitest";
import { markTransfer } from "../lib/paymentTracking.js";
import { collectNotices, noticesForViewer, planNoticeEmails } from "../lib/notifications.js";

/* ============================================================================
   גל 5, פריט 5.1 (D9) — בדיקת שני־הערבים (תנאי עצירה של הגל):
   חוב פתוח מערב א' חייב להישאר במגירת ההתראות ובתוכנית המייל/פוש גם
   אחרי שנשמר ערב ב' חדש יותר. כפילות התראה על אותו חוב = כשל.
   הרגרסיה ההיסטורית: ערב 24.10 הפסיק להופיע כשהגיע ערב חדש.
   ============================================================================ */

const night = (id, iso, entries, extra = {}) => ({
  id,
  iso,
  d: Number(iso.slice(8, 10)),
  mo: Number(iso.slice(5, 7)),
  y: Number(iso.slice(0, 4)),
  entries,
  ...extra,
});

const tracked = { payments: { plan: null, paid: [], received: [], confirmations: [] } };

function twoNightsDb() {
  return {
    roster: ["אופיר סנה", "קובי סעדה", "דן לוי", "ירין מלאך"],
    aliases: {},
    yearly: [],
    sessions: [
      night("night-a", "2026-10-24", [
        { name: "אופיר", amount: -30 },
        { name: "קובי", amount: 30 },
      ], tracked),
      night("night-b", "2026-10-31", [
        { name: "דן", amount: -50 },
        { name: "ירין", amount: 50 },
      ], tracked),
    ],
  };
}

describe("5.1 — התראות העברה מכל הערבים הפתוחים", () => {
  it("חוב מערב א' נשאר במגירה אחרי שנשמר ערב ב' — בלי כפילויות", () => {
    const items = collectNotices(twoNightsDb(), new Date(2026, 10, 1, 12));
    const transfers = items.filter((i) => i.kind === "transfer");
    const ids = transfers.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length); // אין כפילות על אותו חוב
    expect(ids).toContain("transfer:night-a:0:paid");
    expect(ids).toContain("transfer:night-a:0:received");
    expect(ids).toContain("transfer:night-b:0:paid");
    expect(ids).toContain("transfer:night-b:0:received");
    /* כל פריט נושא את ה־sessionId של הערב שלו */
    expect(transfers.find((i) => i.id === "transfer:night-a:0:paid").sessionId).toBe("night-a");
    expect(transfers.find((i) => i.id === "transfer:night-b:0:paid").sessionId).toBe("night-b");
    /* גוף ההתראה של ערב א' נושא את תאריך הערב שלו */
    expect(transfers.find((i) => i.id === "transfer:night-a:0:paid").body).toContain("24.10.2026");
  });

  it("המשלם של ערב א' רואה את ההתראה שלו גם כשערב ב' הוא האחרון", () => {
    const items = collectNotices(twoNightsDb(), new Date(2026, 10, 1, 12));
    const payer = noticesForViewer(items, "אופיר סנה");
    expect(payer.map((i) => i.id)).toContain("transfer:night-a:0:paid");
    const receiver = noticesForViewer(items, "קובי סעדה");
    expect(receiver.map((i) => i.id)).toContain("transfer:night-a:0:received");
  });

  it("ערב א' שנסגר יוצא מהמגירה; ערב ב' נשאר", () => {
    const data = twoNightsDb();
    const closedA = markTransfer(data.sessions[0], 0, true, "אופיר סנה");
    const items = collectNotices({ ...data, sessions: [closedA, data.sessions[1]] }, new Date(2026, 10, 1, 12));
    const ids = items.filter((i) => i.kind === "transfer").map((i) => i.id);
    expect(ids.some((id) => id.startsWith("transfer:night-a:"))).toBe(false);
    expect(ids).toContain("transfer:night-b:0:paid");
  });

  it("ערב ישן בלי מעקב תשלומים לא מציף את המגירה", () => {
    const data = twoNightsDb();
    const ancient = night("ancient", "2026-08-01", [
      { name: "אופיר", amount: -99 },
      { name: "קובי", amount: 99 },
    ]); // בלי payments — לא במעקב
    const items = collectNotices({ ...data, sessions: [ancient, ...data.sessions] }, new Date(2026, 10, 1, 12));
    const ids = items.filter((i) => i.kind === "transfer").map((i) => i.id);
    expect(ids.some((id) => id.startsWith("transfer:ancient:"))).toBe(false);
  });
});

describe("5.1 — מעקב המייל (firstSeen) של פריט העברה", () => {
  const view = (day, hour) => ({
    name: "אופיר",
    email: "ofir@example.com",
    at: `2026-11-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`,
  });
  const keyA = "transfer:night-a:0:paid|אופיר סנה";

  it("פריט של ערב א' מגיע לתוכנית המייל גם אחרי שערב ב' נשמר", () => {
    const data = twoNightsDb();
    const items = collectNotices(data, new Date(2026, 10, 1, 12));
    const plan = planNoticeEmails({
      db: data,
      items,
      views: [view(1, 8), view(1, 9), view(2, 8)],
      firstSeen: { [keyA]: "2026-11-01T05:00:00.000Z" },
      now: new Date("2026-11-02T05:00:00.000Z"),
    });
    expect(plan.due.map((j) => j.key)).toContain(keyA);
  });

  it("firstSeen של העברה פתוחה לא נמחק גם אם הפריט חסר ברשימת הריצה; נסגר — נמחק", () => {
    const data = twoNightsDb();
    /* ריצה שבה הפריט של ערב א' לא הגיע לרשימה (התנהגות הישנה) —
       ההעברה עדיין פתוחה ב־db, ולכן המעקב נשמר. */
    const kept = planNoticeEmails({
      db: data,
      items: [],
      views: [],
      firstSeen: { [keyA]: "2026-11-01T05:00:00.000Z" },
      now: new Date("2026-11-02T05:00:00.000Z"),
    });
    expect(kept.firstSeen[keyA]).toBe("2026-11-01T05:00:00.000Z");

    /* אחרי שההעברה נסגרה — הפריט יוצא מהמעקב */
    const closedA = markTransfer(data.sessions[0], 0, true, "אופיר סנה");
    const dropped = planNoticeEmails({
      db: { ...data, sessions: [closedA, data.sessions[1]] },
      items: [],
      views: [],
      firstSeen: { [keyA]: "2026-11-01T05:00:00.000Z" },
      now: new Date("2026-11-02T05:00:00.000Z"),
    });
    expect(dropped.firstSeen[keyA]).toBeUndefined();
  });
});
