import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  paymentReminderDue,
  sessionsDueForPaymentReminder,
  buildPaymentReminderText,
  unpaidTransfers,
  isPaymentReminderWindow,
  PAYMENT_REMINDER_HOUR,
} from "../lib/paymentReminder";
import { paymentPlan } from "../lib/paymentTracking";

function session({ id = "s1", iso = "2026-09-14", d = 14, mo = 9, entries, payments } = {}) {
  return {
    id,
    iso,
    d,
    mo,
    y: 2026,
    cps: 1,
    entries: entries || [
      { name: "א", amount: -100 },
      { name: "ב", amount: 100 },
    ],
    payments,
  };
}

describe("addDaysIso", () => {
  it("adds across month boundary", () => {
    expect(addDaysIso("2026-09-30", 1)).toBe("2026-10-01");
  });
});

describe("paymentReminderDue", () => {
  it("due on morning after with unpaid transfers", () => {
    const s = session();
    const r = paymentReminderDue(s, "2026-09-15");
    expect(r.due).toBe(true);
    expect(r.unpaid.length).toBe(1);
  });

  it("skips other days", () => {
    expect(paymentReminderDue(session(), "2026-09-14").due).toBe(false);
    expect(paymentReminderDue(session(), "2026-09-16").due).toBe(false);
  });

  it("skips when already sent", () => {
    const s = session();
    expect(paymentReminderDue(s, "2026-09-15", { alreadySent: { s1: true } }).due).toBe(false);
  });

  it("skips when all paid", () => {
    const s = session();
    const plan = paymentPlan(s);
    const paid = {};
    plan.transfers.forEach((_, i) => {
      paid[i] = true;
    });
    const paidSession = { ...s, payments: { plan: plan.fingerprint, paid } };
    expect(paymentReminderDue(paidSession, "2026-09-15").reason).toBe("nothing open");
  });

  it("force ignores date but not empty unpaid", () => {
    expect(paymentReminderDue(session(), "2026-01-01", { force: true }).due).toBe(true);
  });
});

describe("sessionsDueForPaymentReminder", () => {
  it("picks matching sessions", () => {
    const list = sessionsDueForPaymentReminder(
      [session({ id: "a", iso: "2026-09-14" }), session({ id: "b", iso: "2026-09-10", d: 10 })],
      "2026-09-15"
    );
    expect(list.map((x) => x.session.id)).toEqual(["a"]);
  });
});

describe("buildPaymentReminderText", () => {
  it("includes app link and bot mark", () => {
    const s = session();
    const text = buildPaymentReminderText(s, unpaidTransfers(s), {
      siteUrl: "https://example.com",
      slug: "kupa",
    });
    expect(text.startsWith("🤖")).toBe(true);
    expect(text).toContain("https://example.com/g/kupa");
    expect(text).toContain("אישור העברות");
  });
});

describe("isPaymentReminderWindow", () => {
  it("defaults to 10:00 Israel", () => {
    expect(PAYMENT_REMINDER_HOUR).toBe(10);
  });

  it("force always opens the window", () => {
    expect(isPaymentReminderWindow(new Date("2026-01-01T00:00:00Z"), { force: true })).toBe(true);
  });
});
