import { describe, expect, it } from "vitest";
import { markReceipt, markTransfer } from "../lib/paymentTracking.js";
import {
  NOTICE_EMAIL_AFTER,
  collectNotices,
  linkedEmail,
  noticesForViewer,
  planNoticeEmails,
} from "../lib/notifications.js";

const night = (id, iso, entries, extra = {}) => ({
  id,
  iso,
  d: Number(iso.slice(8, 10)),
  mo: Number(iso.slice(5, 7)),
  y: Number(iso.slice(0, 4)),
  entries,
  ...extra,
});

function db(sessions, extra = {}) {
  return { roster: [], aliases: {}, yearly: [], sessions, ...extra };
}

describe("in-app notices", () => {
  const open = db([
    night("new", "2026-09-23", [
      { name: "אופיר", amount: -30 },
      { name: "קובי", amount: 30 },
    ]),
  ], { roster: ["אופיר סנה", "קובי סעדה"] });

  it("tells the payer and the receiver to act while the transfer is open", () => {
    const items = collectNotices(open, new Date(2026, 8, 25, 12));
    const payer = noticesForViewer(items, "אופיר סנה");
    const receiver = noticesForViewer(items, "קובי סעדה");
    expect(payer.map((item) => item.action)).toEqual(["paid"]);
    expect(payer[0].actorRole).toBe("מעביר");
    expect(payer[0].actionLabel).toBe("שולם");
    expect(receiver.map((item) => item.action)).toEqual(["received"]);
    expect(receiver[0].actorRole).toBe("מקבל");
    expect(receiver[0].actionLabel).toBe("התקבל");
    expect(noticesForViewer(items, "שגיא גיל")).toEqual([]);
  });

  it("drops both sides after one confirmation", () => {
    const session = open.sessions[0];
    const paid = db([markTransfer(session, 0, true, "אופיר סנה")], { roster: open.roster });
    expect(collectNotices(paid, new Date(2026, 8, 25, 12)).some((item) => item.kind === "transfer")).toBe(false);
    const received = db([markReceipt(session, 0, true, "קובי סעדה")], { roster: open.roster });
    expect(collectNotices(received, new Date(2026, 8, 25, 12)).some((item) => item.kind === "transfer")).toBe(false);
  });

  it("lets a couple partner see the side they can mark", () => {
    const couple = db([
      night("c", "2026-08-02", [
        { name: "אורן גיל", amount: -20 },
        { name: "שגיא גיל", amount: 20 },
      ]),
    ]);
    const items = collectNotices(couple, new Date(2026, 7, 3, 12));
    const eden = noticesForViewer(items, "עדן גיל");
    expect(eden.some((item) => item.action === "paid" && item.actorName === "אורן גיל")).toBe(true);
    expect(eden.some((item) => item.action === "received")).toBe(false);
  });

  it("shows an admin every open transfer and who should act", () => {
    const items = noticesForViewer(collectNotices(open, new Date(2026, 8, 25, 12)), null, { isAdmin: true });
    expect(items.filter((item) => item.kind === "transfer").map((item) => item.actorRole)).toEqual(["מעביר", "מקבל"]);
  });

  it("builds monthly, quarterly, half-year and yearly summaries for a player", () => {
    const data = db([
      night("dec", "2025-12-15", [
        { name: "קובי סעדה", amount: 40 },
        { name: "אופיר סנה", amount: -40 },
      ]),
    ]);
    const items = noticesForViewer(collectNotices(data, new Date(2026, 0, 15, 12)), "קובי סעדה");
    const titles = items.filter((item) => item.kind === "summary").map((item) => item.title);
    expect(titles).toContain("סיכום דצמבר 2025");
    expect(titles).toContain("סיכום רבעון 4 · 2025");
    expect(titles).toContain("סיכום חצי שנה · יולי–דצמבר 2025");
    expect(titles).toContain("סיכום שנת 2025");
    expect(items.find((item) => item.title === "סיכום דצמבר 2025").body).toContain("+40");
  });

  it("reports a broken record, a win streak, and an upcoming night", () => {
    const sessions = [];
    for (let i = 1; i <= 5; i++) {
      sessions.push(night(`o${i}`, `2026-07-${String(i).padStart(2, "0")}`, [
        { name: "א", amount: 10 },
        { name: "ב", amount: -10 },
      ]));
    }
    sessions.push(night("big", "2026-07-10", [
      { name: "א", amount: 80 },
      { name: "ב", amount: -80 },
    ]));
    const data = db(sessions, { plan: { iso: "2026-07-20", time: "21:00", location: "אצלי" } });
    const items = noticesForViewer(collectNotices(data, new Date(2026, 6, 12, 12)), "א");
    expect(items.some((item) => item.kind === "record" && item.body.includes("א"))).toBe(true);
    expect(items.some((item) => item.kind === "streak" && item.title === "רצף נצחונות")).toBe(true);
    expect(items.some((item) => item.kind === "plan" && item.body.includes("21:00"))).toBe(true);
    expect(noticesForViewer(items, "ב").some((item) => item.title === "רצף נצחונות")).toBe(false);
  });
});

describe("email fallback", () => {
  const data = db([], { roster: ["אופיר סנה"] });
  const item = {
    id: "plan:2026-10-01",
    title: "ערב מתוכנן",
    body: "חמישי",
    audience: ["אופיר סנה"],
  };
  const view = (day, hour, email = "snehofir@gmail.com") => ({
    name: "אופיר",
    email,
    at: `2026-09-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`,
  });

  it("waits until three visits after the notice existed, then sends once", () => {
    const first = planNoticeEmails({
      db: data,
      items: [item],
      views: [view(25, 9), view(25, 10), view(25, 11)],
      now: new Date("2026-09-25T05:00:00.000Z"),
    });
    expect(first.due).toEqual([]);
    const key = "plan:2026-10-01|אופיר סנה";
    expect(first.firstSeen[key]).toBe("2026-09-25T05:00:00.000Z");

    const early = planNoticeEmails({
      db: data,
      items: [item],
      views: [view(20, 9), view(25, 8), view(25, 9)],
      firstSeen: first.firstSeen,
      now: new Date("2026-09-26T05:00:00.000Z"),
    });
    expect(early.due).toEqual([]);

    const ready = planNoticeEmails({
      db: data,
      items: [item],
      views: [view(25, 8), view(25, 9), view(26, 8)],
      firstSeen: first.firstSeen,
      now: new Date("2026-09-26T05:00:00.000Z"),
    });
    expect(ready.due).toHaveLength(1);
    expect(ready.due[0].email).toBe("snehofir@gmail.com");
    expect(NOTICE_EMAIL_AFTER).toBe(3);

    const again = planNoticeEmails({
      db: data,
      items: [item],
      views: [view(25, 8), view(25, 9), view(26, 8), view(27, 8)],
      firstSeen: first.firstSeen,
      sent: { [key]: "2026-09-26" },
      now: new Date("2026-09-27T05:00:00.000Z"),
    });
    expect(again.due).toEqual([]);
  });

  it("skips email when the player has no linked address", () => {
    const plan = planNoticeEmails({
      db: data,
      items: [item],
      views: [view(25, 8, ""), view(25, 9, null), view(26, 8, "  ")],
      firstSeen: { "plan:2026-10-01|אופיר סנה": "2026-09-25T05:00:00.000Z" },
      now: new Date("2026-09-26T05:00:00.000Z"),
    });
    expect(plan.due).toEqual([]);
    expect(linkedEmail(data, "אופיר סנה", [{ name: "אופיר", email: "snehofir@gmail.com", at: "2026-09-01T00:00:00.000Z" }])).toBe("snehofir@gmail.com");
  });
});
