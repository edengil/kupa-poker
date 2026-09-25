import { describe, expect, it } from "vitest";
import { markReceipt, markTransfer } from "../lib/paymentTracking.js";
import {
  confirmationStatusText,
  confirmationsStartOpen,
  latestNightConfirmations,
  receiptConfirmPrompt,
  transferConfirmPrompt,
  unconfirmedOwnTransfers,
} from "../lib/nightConfirmations.js";
import { buildSeedDb } from "../lib/poker/seed.js";
import { matchViewerToPlayer } from "../lib/poker/personalHighlights.js";

const night = (id, iso, entries, extra = {}) => ({
  id,
  iso,
  d: Number(iso.slice(8, 10)),
  mo: Number(iso.slice(5, 7)),
  y: Number(iso.slice(0, 4)),
  entries,
  ...extra,
});

const older = night("old", "2026-07-01", [
  { name: "א", amount: 40 },
  { name: "ב", amount: -40 },
]);
const latest = night("new", "2026-07-02", [
  { name: "אופיר", amount: -30 },
  { name: "קובי", amount: 30 },
]);

describe("latest night confirmations", () => {
  it("lists confirmation status for the latest night only", () => {
    const paidOlder = markTransfer(older, 0, true);
    const view = latestNightConfirmations([paidOlder, latest]);
    expect(view.session.id).toBe("new");
    expect(view.rows).toEqual([
      expect.objectContaining({
        from: "אופיר",
        to: "קובי",
        amount: 30,
        confirmed: false,
      }),
    ]);
    expect(view.confirmedCount).toBe(0);
    expect(view.pendingCount).toBe(1);
    expect(view.rows.some((row) => row.from === "א")).toBe(false);
  });

  it("keeps a paid flag that already sits on the latest night", () => {
    const paid = markTransfer(latest, 0, true);
    const view = latestNightConfirmations([older, paid]);
    expect(view.rows[0].confirmed).toBe(true);
    expect(view.confirmedCount).toBe(1);
    expect(view.pendingCount).toBe(0);
  });

  it("prefers the night that ended later over an older date", () => {
    const endedLater = night("ended", "2026-06-01", [{ name: "א", amount: 10 }, { name: "ב", amount: -10 }], {
      endedAt: 9_000_000_000_000,
    });
    const view = latestNightConfirmations([latest, endedLater]);
    expect(view.session.id).toBe("ended");
  });
});

describe("transfer confirm popup", () => {
  it("prompts a returning player who has not confirmed their transfer", () => {
    const prompt = transferConfirmPrompt([older, latest], "אופיר סנה");
    expect(prompt.session.id).toBe("new");
    expect(prompt.rows.map((row) => row.from)).toEqual(["אופיר"]);
    expect(unconfirmedOwnTransfers(latest, "קובי")).toEqual([]);
  });

  it("stays quiet after that transfer is marked paid", () => {
    const paid = markTransfer(latest, 0, true);
    expect(transferConfirmPrompt([paid], "אופיר")).toBeNull();
  });

  it("includes the couple partner's unconfirmed transfer", () => {
    const coupleNight = night("couple", "2026-08-01", [
      { name: "אורן", amount: -20 },
      { name: "שגיא", amount: 20 },
    ]);
    const prompt = transferConfirmPrompt([coupleNight], "עדן גיל");
    expect(prompt.rows.map((row) => row.from)).toEqual(["אורן"]);
  });

  it("does not prompt the admin about other people's transfers", () => {
    expect(transferConfirmPrompt([latest], "עדן גיל")).toBeNull();
    expect(transferConfirmPrompt([latest], null)).toBeNull();
  });

  it("prompts יצחק תפילין for איציק's open transfer", () => {
    const owed = night("itzik", "2026-09-23", [
      { name: "איציק", amount: -100 },
      { name: "אופיר", amount: 100 },
    ]);
    const db = { aliases: {}, roster: ["איציק תפילין", "אופיר סנה"], yearly: [], sessions: [owed] };
    const viewer = matchViewerToPlayer(db, { full_name: "יצחק תפילין" });
    const prompt = transferConfirmPrompt(db.sessions, viewer);
    expect(viewer).toBe("איציק תפילין");
    expect(prompt).not.toBeNull();
    expect(prompt.rows).toHaveLength(1);
  });

  it("prompts a known player on the seeded latest night", () => {
    const db = buildSeedDb();
    const viewer = matchViewerToPlayer(db, { full_name: "אופיר" });
    expect(viewer).toBe("אופיר סנה");
    const prompt = transferConfirmPrompt(db.sessions, viewer);
    expect(prompt).not.toBeNull();
    expect(prompt.session.iso).toBe("2026-07-26");
    expect(prompt.rows.every((row) => row.confirmed === false)).toBe(true);
    expect(prompt.rows.every((row) => row.received === false)).toBe(true);
    const view = latestNightConfirmations(db.sessions);
    expect(view.session.iso).toBe("2026-07-26");
    expect(view.pendingCount).toBe(view.rows.length);
    expect(view.rows.length).toBeGreaterThan(0);
    expect(view.receivedCount).toBe(0);
    expect(view.rows.every((row) => row.received === false)).toBe(true);
  });
});

describe("receiver confirmation", () => {
  it("shows payer and receiver flags independently on the latest night", () => {
    const paidOnly = markTransfer(latest, 0, true);
    const both = markReceipt(paidOnly, 0, true);
    const view = latestNightConfirmations([both]);
    expect(view.rows[0]).toEqual(
      expect.objectContaining({
        from: "אופיר",
        to: "קובי",
        confirmed: true,
        received: true,
      })
    );
    expect(view.confirmedCount).toBe(1);
    expect(view.receivedCount).toBe(1);
    const payerOnly = latestNightConfirmations([paidOnly]);
    expect(payerOnly.rows[0].confirmed).toBe(true);
    expect(payerOnly.rows[0].received).toBe(false);
    expect(payerOnly.receivedCount).toBe(0);
  });

  it("prompts the receiver until someone confirms, and not the payer", () => {
    const prompt = receiptConfirmPrompt([latest], "קובי");
    expect(prompt.session.id).toBe("new");
    expect(prompt.rows.map((row) => row.to)).toEqual(["קובי"]);
    expect(receiptConfirmPrompt([latest], "אופיר")).toBeNull();
    const received = markReceipt(latest, 0, true);
    expect(receiptConfirmPrompt([received], "קובי")).toBeNull();
  });

  it("closes the transfer when either side confirms", () => {
    const paidOnly = markTransfer(latest, 0, true);
    const paidView = latestNightConfirmations([paidOnly]);
    expect(paidView.rows[0].closed).toBe(true);
    expect(paidView.rows[0].received).toBe(false);
    expect(paidView.pendingCount).toBe(0);
    expect(paidView.closedCount).toBe(1);
    expect(transferConfirmPrompt([paidOnly], "אופיר")).toBeNull();
    expect(receiptConfirmPrompt([paidOnly], "קובי")).toBeNull();

    const gotOnly = markReceipt(latest, 0, true);
    const gotView = latestNightConfirmations([gotOnly]);
    expect(gotView.rows[0].closed).toBe(true);
    expect(gotView.rows[0].confirmed).toBe(false);
    expect(gotView.pendingCount).toBe(0);
    expect(transferConfirmPrompt([gotOnly], "אופיר")).toBeNull();
    expect(receiptConfirmPrompt([gotOnly], "קובי")).toBeNull();

    expect(transferConfirmPrompt([latest], "אופיר")).not.toBeNull();
    expect(receiptConfirmPrompt([latest], "קובי")).not.toBeNull();
  });

  it("shows one closed state and who confirmed, without inventing a name for an older mark", () => {
    const paid = markTransfer(latest, 0, true, "אופיר סנה");
    const view = latestNightConfirmations([paid]);
    expect(view.rows[0].action).toBe("paid");
    expect(view.rows[0].by).toBe("אופיר סנה");
    expect(confirmationStatusText(view.rows[0])).toBe("שולם · אופיר סנה");
    const got = markReceipt(latest, 0, true, "קובי סעדה");
    expect(confirmationStatusText(latestNightConfirmations([got]).rows[0])).toBe("התקבל · קובי סעדה");
    const legacy = latestNightConfirmations([markTransfer(latest, 0, true)]);
    expect(legacy.rows[0].closed).toBe(true);
    expect(legacy.rows[0].by).toBeNull();
    expect(confirmationStatusText(legacy.rows[0])).toBe("נסגר");
    expect(confirmationsStartOpen(legacy)).toBe(false);
    expect(confirmationsStartOpen(view)).toBe(false);
    expect(confirmationsStartOpen(latestNightConfirmations([latest]))).toBe(true);
  });

  it("lets a couple partner confirm receipt", () => {
    const coupleNight = night("couple-in", "2026-08-02", [
      { name: "שגיא", amount: -20 },
      { name: "אורן", amount: 20 },
    ]);
    const prompt = receiptConfirmPrompt([coupleNight], "עדן גיל");
    expect(prompt.rows.map((row) => row.to)).toEqual(["אורן"]);
  });

  it("does not prompt the admin about other people's receipts", () => {
    expect(receiptConfirmPrompt([latest], "עדן גיל")).toBeNull();
  });
});
