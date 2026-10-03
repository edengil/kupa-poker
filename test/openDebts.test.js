import { describe, it, expect } from "vitest";
import { computeOpenDebts } from "../lib/poker/openDebts.js";
import { paymentPlan } from "../lib/paymentTracking.js";

/* ערב עם העברה פתוחה (לא שולמה ולא התקבלה) — כמו ב-wave4.test.js. */
function openSession({ id, iso, payer = "אבי", payee = "משה", amount = 100 }) {
  const base = {
    id,
    iso,
    d: Number(iso.slice(8, 10)),
    mo: Number(iso.slice(5, 7)),
    y: Number(iso.slice(0, 4)),
    entries: [
      { name: payer, amount: -amount },
      { name: payee, amount },
    ],
  };
  const { fingerprint } = paymentPlan(base);
  return {
    ...base,
    payments: { plan: fingerprint, paid: {}, received: {}, confirmations: [] },
  };
}

describe("computeOpenDebts", () => {
  it("מחזיר לכל חייב שורות פירוט (lines) — החוזה ש-GapsBoard מצפה לו", () => {
    const db = {
      aliases: {},
      sessions: [
        openSession({ id: "s1", iso: "2026-10-01", payer: "אבי", payee: "משה", amount: 100 }),
        openSession({ id: "s2", iso: "2026-10-02", payer: "אבי", payee: "דוד", amount: 50 }),
      ],
    };
    const { debtors } = computeOpenDebts(db, { now: Date.parse("2026-10-03T12:00:00Z") });
    expect(debtors).toHaveLength(1);
    const d = debtors[0];
    expect(d.name).toBe("אבי");
    expect(d.total).toBe(150);
    expect(Array.isArray(d.lines)).toBe(true);
    expect(d.lines).toHaveLength(2);
    expect(d.lines[0]).toMatchObject({ from: "אבי", to: "משה", amount: 100, iso: "2026-10-01" });
    expect(d.lines[1]).toMatchObject({ from: "אבי", to: "דוד", amount: 50, iso: "2026-10-02" });
    // הרינדור של GapsBoard על השורות — לא זורק
    expect(() =>
      d.lines.map((l) => `${l.from} ← ${l.to} · ${l.amount} · ערב ${l.iso}`).join(" · ")
    ).not.toThrow();
  });

  it("בלי חובות פתוחים מחזיר מערך ריק", () => {
    const { debtors } = computeOpenDebts({ aliases: {}, sessions: [] });
    expect(debtors).toEqual([]);
  });
});
