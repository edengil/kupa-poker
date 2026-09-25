import { describe, expect, it } from "vitest";
import { collectNotices, planNoticePushes } from "../lib/notifications.js";
import { nextPushPrompt } from "../lib/pushPrompt.js";

describe("outside-app permission prompt", () => {
  it("asks once on the next open, and stays quiet after that", () => {
    const first = nextPushPrompt(null, { visitId: "open-1", permission: "default", support: "supported" });
    expect(first.show).toBe(false);
    expect(first.visits).toBe(1);

    const refresh = nextPushPrompt(first, { visitId: "open-1", permission: "default", support: "supported" });
    expect(refresh.show).toBe(false);
    expect(refresh.visits).toBe(1);

    const next = nextPushPrompt(first, { visitId: "open-2", permission: "default", support: "supported" });
    expect(next.show).toBe(true);
    expect(next.mode).toBe("allow");

    const later = nextPushPrompt(next, { visitId: "open-3", permission: "default", support: "supported" });
    expect(later.show).toBe(false);
  });

  it("does not ask again after a denial", () => {
    const denied = nextPushPrompt(
      { visits: 2, asked: true, choice: "denied", lastVisitId: "open-2" },
      { visitId: "open-3", permission: "denied", support: "supported" }
    );
    expect(denied.show).toBe(false);
    expect(denied.choice).toBe("denied");
  });

  it("explains the home-screen step once on iPhone, then asks when the app itself opens", () => {
    const first = nextPushPrompt(null, { visitId: "tab-1", support: "needs-install" });
    const hint = nextPushPrompt(first, { visitId: "tab-2", support: "needs-install" });
    expect(hint.show).toBe(true);
    expect(hint.mode).toBe("install");
    expect(hint.asked).toBe(false);
    const repeat = nextPushPrompt(hint, { visitId: "tab-3", support: "needs-install" });
    expect(repeat.show).toBe(false);
    const installed = nextPushPrompt(repeat, { visitId: "home-1", support: "supported" });
    expect(installed.show).toBe(true);
    expect(installed.mode).toBe("allow");
  });
});

describe("which notices send a push", () => {
  const db = { roster: ["אופיר סנה", "קובי סעדה"], aliases: {}, yearly: [], sessions: [] };
  const sub = (name, player) => ({
    id: player,
    endpoint: `https://push.example/${player}`,
    p256dh: "key",
    auth: "auth",
    name,
    player_name: player,
  });

  it("sends a record, summary, transfer, streak and planned night only to the linked player", () => {
    const items = [
      { id: "record:1", kind: "record", title: "שיא חדש", body: "ערב שיא", audience: ["אופיר סנה"] },
      { id: "summary:m:2026-09", kind: "summary", title: "סיכום ספטמבר 2026", body: "הנטו שלך: +10₪", audience: ["אופיר סנה"] },
      { id: "transfer:1:0:paid", kind: "transfer", title: "העברה ממתינה", body: "אופיר אל קובי", actorRole: "מעביר", audience: ["אופיר סנה"] },
      { id: "streak:אופיר סנה:win:2026-09-23", kind: "streak", title: "רצף נצחונות", body: "3 ערבים ברצף", audience: ["אופיר סנה"] },
      { id: "plan:2026-10-01", kind: "plan", title: "ערב מתוכנן", body: "מחר", audience: ["אופיר סנה"] },
      { id: "chat:1", kind: "chat", title: "לא פוש", body: "צ׳אט", audience: ["אופיר סנה"] },
    ];
    const plan = planNoticePushes({
      db,
      items,
      subscriptions: [sub("אופיר", "אופיר סנה"), sub("קובי", "קובי סעדה")],
    });
    expect(plan.due.map((job) => job.kind).sort()).toEqual(["plan", "record", "streak", "summary", "transfer"]);
    expect(plan.due.every((job) => job.player === "אופיר סנה")).toBe(true);
    expect(plan.due.every((job) => job.targets.length === 1 && job.targets[0].player_name === "אופיר סנה")).toBe(true);
    expect(plan.due.find((job) => job.kind === "transfer").body).toContain("מעביר");

    const sent = Object.fromEntries(plan.due.map((job) => [job.key, "done"]));
    expect(planNoticePushes({ db, items, subscriptions: [sub("אופיר", "אופיר סנה")], sent }).due).toEqual([]);
    expect(planNoticePushes({ db, items, subscriptions: [] }).due).toEqual([]);
  });

  it("pushes an open transfer to the payer and the receiver on their own subscriptions", () => {
    const data = {
      ...db,
      sessions: [{
        id: "night",
        iso: "2026-09-23",
        d: 23,
        mo: 9,
        y: 2026,
        entries: [
          { name: "אופיר", amount: -30 },
          { name: "קובי", amount: 30 },
        ],
      }],
    };
    const items = collectNotices(data, new Date(2026, 8, 25, 12));
    const plan = planNoticePushes({
      db: data,
      items,
      subscriptions: [sub("אופיר", "אופיר סנה"), sub("קובי", "קובי סעדה")],
    });
    const transfers = plan.due.filter((job) => job.kind === "transfer");
    expect(transfers.map((job) => job.player).sort()).toEqual(["אופיר סנה", "קובי סעדה"]);
    expect(transfers.find((job) => job.player === "אופיר סנה").body).toContain("מעביר");
    expect(transfers.find((job) => job.player === "קובי סעדה").body).toContain("מקבל");
  });
});
