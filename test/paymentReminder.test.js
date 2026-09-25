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

  it("skips the night itself and sends on a later morning", () => {
    expect(paymentReminderDue(session(), "2026-09-14").reason).toBe("not morning after");
    const later = paymentReminderDue(session(), "2026-09-16");
    expect(later.due).toBe(true);
    expect(later.unpaid.length).toBe(1);
  });

  it("skips a successful send from this morning and sends again the next morning", () => {
    const s = session();
    expect(paymentReminderDue(s, "2026-09-15", { alreadySent: { s1: "2026-09-15" } }).reason).toBe(
      "already sent"
    );
    expect(paymentReminderDue(s, "2026-09-16", { alreadySent: { s1: "2026-09-15" } }).due).toBe(true);
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
  it("picks the latest night on the morning after", () => {
    const list = sessionsDueForPaymentReminder(
      [session({ id: "a", iso: "2026-09-14" }), session({ id: "b", iso: "2026-09-10", d: 10 })],
      "2026-09-15"
    );
    expect(list.map((x) => x.session.id)).toEqual(["a"]);
  });

  it("keeps reminding the latest night on a later morning while transfers are open", () => {
    const list = sessionsDueForPaymentReminder(
      [session({ id: "a", iso: "2026-09-14" }), session({ id: "b", iso: "2026-09-10", d: 10 })],
      "2026-09-20"
    );
    expect(list.map((x) => x.session.id)).toEqual(["a"]);
  });

  it("does not send once the latest night is fully paid", () => {
    const s = session();
    const plan = paymentPlan(s);
    const paid = {};
    plan.transfers.forEach((_, i) => {
      paid[i] = true;
    });
    const list = sessionsDueForPaymentReminder(
      [{ ...s, payments: { plan: plan.fingerprint, paid } }],
      "2026-09-16"
    );
    expect(list).toEqual([]);
  });

  it("does not send again the same morning after a successful send", () => {
    const list = sessionsDueForPaymentReminder([session()], "2026-09-16", {
      alreadySent: { s1: "2026-09-16" },
    });
    expect(list).toEqual([]);
  });

  it("continues an older night that already started reminders until it is paid", () => {
    const list = sessionsDueForPaymentReminder(
      [session({ id: "a", iso: "2026-09-14" }), session({ id: "b", iso: "2026-09-10", d: 10 })],
      "2026-09-20",
      { alreadySent: { b: "2026-09-19" } }
    );
    expect(list.map((x) => x.session.id).sort()).toEqual(["a", "b"]);
  });
});

describe("buildPaymentReminderText", () => {
  it("includes app link and open count without transfer lines", () => {
    const s = session();
    const text = buildPaymentReminderText(s, unpaidTransfers(s), {
      siteUrl: "https://example.com",
      slug: "kupa",
    });
    expect(text.startsWith("🤖")).toBe(true);
    expect(text).toContain("https://example.com/g/kupa/n/s1");
    expect(text).toContain("לא כולם עדיין העבירו");
    expect(text).toContain("נא לאשר בלינק");
    expect(text).not.toMatch(/→/);
  });
});

describe("isPaymentReminderWindow", () => {
  it("defaults to 8:00 Israel", () => {
    expect(PAYMENT_REMINDER_HOUR).toBe(8);
  });

  it("force always opens the window", () => {
    expect(isPaymentReminderWindow(new Date("2026-01-01T00:00:00Z"), { force: true })).toBe(true);
  });

  it("is only 08:00 Israel in summer and winter", () => {
    expect(isPaymentReminderWindow(new Date("2026-07-15T05:00:00Z"))).toBe(true);
    expect(isPaymentReminderWindow(new Date("2026-01-15T06:00:00Z"))).toBe(true);
    expect(isPaymentReminderWindow(new Date("2026-01-15T05:00:00Z"))).toBe(false);
    expect(isPaymentReminderWindow(new Date("2026-07-15T06:00:00Z"))).toBe(false);
  });
});
