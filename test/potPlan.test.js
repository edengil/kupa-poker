/* R3+R4: סכום הקופה בתוכנית הוא ה"בפועל" אם נערך; העברת הקופה אינה חלק
   מהתוכנית הקנונית (fingerprint/סימונים/ספירה) וחוזרת רק כ־potTransfer
   למנהל; נתוני צופה לא מכילים סכומי קופה כלל. */
import { describe, it, expect } from "vitest";
import {
  paymentPlan,
  markPotPaid,
  markTransfer,
  projectPaymentsForViewer,
} from "../lib/paymentTracking.js";
import { potOverview } from "../lib/paymentTracking.js";
import { snapshotForViewer } from "../lib/publicShare.js";
import { autoShortfallMapForPot, playersFromSession } from "../lib/nightShare.js";
import { settlementBasis } from "../lib/savedSettlement.js";

/* ערב קופה פשוט, cps=2: עדן −280, אורן +100, דן +180; קניות 500 → 5% = 25 */
const POT_NIGHT = {
  id: "live_pot_test",
  iso: "2026-10-24",
  cps: 2,
  savings5: true,
  savingsPot: 25,
  entries: [
    { name: "עדן גיל", buyin: 300, chips: 40 },
    { name: "אורן גיל", buyin: 100, chips: 400 },
    { name: "דן ינקלויץ", buyin: 100, chips: 560 },
  ],
};

describe("R3 — סכום הקופה בתוכנית", () => {
  it("בלי savingsPotActual — ההעברה לקופה היא הרשום", () => {
    const plan = paymentPlan(POT_NIGHT);
    expect(plan.potTransfer).toEqual(
      expect.objectContaining({ from: "עדן גיל", to: "קופת חיסכון", amount: 25, pot: true })
    );
    expect(plan.transfers.some((t) => t.pot || t.residual)).toBe(false);
    expect(plan.problems).toEqual([]);
  });

  it("עם savingsPotActual — ההעברה לקופה היא הבפועל, והפנקס לא משתנה", () => {
    const session = { ...POT_NIGHT, savingsPotActual: 18 };
    const plan = paymentPlan(session);
    expect(plan.potTransfer?.amount).toBe(18);
    expect(plan.problems).toEqual([]);
    const overview = potOverview({ sessions: [session], savingsWithdrawals: [] });
    expect(overview.totalRecorded).toBe(25);
    expect(overview.totalActual).toBe(18);
    expect(overview.balance).toBe(18);
  });
});

describe("הקפאת מפה בעריכת בפועל (ערב בלי חלוקה שמורה)", () => {
  it("המפה נכתבת מול הרשום: עריכת בפועל משנה רק את שורת הקופה, לא את סכומי השחקנים", () => {
    const recordedAuto = paymentPlan(POT_NIGHT);
    const withActual = { ...POT_NIGHT, savingsPotActual: 18 };
    const map = autoShortfallMapForPot(withActual, 25);
    expect(Object.values(map).reduce((s, v) => s + v, 0)).toBe(25);
    const frozen = {
      ...withActual,
      manualSettlement: {
        basis: settlementBasis(playersFromSession(withActual), 2),
        manualPayments: [],
        preferCreditors: [],
        shortfall: map,
        frozenActual: 18,
        settlementVersion: 2,
        settlementUpdatedAt: "2026-10-25T00:00:00.000Z",
      },
    };
    // מנהל על הערב הקפוא: אותם סכומי שחקנים כמו בחלוקה האוטומטית של הרשום,
    // ורק ההעברה לקופה היא הבפועל (18)
    expect(paymentPlan(frozen).transfers).toEqual(recordedAuto.transfers);
    expect(paymentPlan(frozen).potTransfer?.amount).toBe(18);
    // וצופה (בלי שדות קופה, רשום מחושב מ־5%) מקבל אותם סכומים ואותו fingerprint
    const viewer = { ...frozen, savingsPot: undefined, savingsPotActual: undefined };
    expect(paymentPlan(viewer).transfers).toEqual(recordedAuto.transfers);
    expect(paymentPlan(viewer).fingerprint).toBe(paymentPlan(frozen).fingerprint);
  });
});

describe("סימון הקופה (potPaid) — מנהל בלבד, נפרד מסימוני השחקנים", () => {
  it("markPotPaid שומר סימון + אישור, ולא נוגע בסימוני העברות", () => {
    const markedTransfer = markTransfer(POT_NIGHT, 0, true, "עדן גיל");
    const withPot = markPotPaid(markedTransfer, true, "עדן גיל");
    const plan = paymentPlan(withPot);
    expect(plan.potPaid).toBe(true);
    expect(plan.paid[0]).toBe(true);
    expect(withPot.payments.potPaid).toBe(true);
    expect(withPot.payments.confirmations.some((e) => e.pot && e.by === "עדן גיל")).toBe(true);
    // ביטול הסימון לא מוחק סימוני שחקנים
    const undone = paymentPlan(markPotPaid(withPot, false));
    expect(undone.potPaid).toBe(false);
    expect(undone.paid[0]).toBe(true);
  });

  it("סימון שחקן לא מוחק potPaid שמור", () => {
    const withPot = markPotPaid(POT_NIGHT, true, "עדן גיל");
    const plan = paymentPlan(markTransfer(withPot, 0, true, "עדן גיל"));
    expect(plan.potPaid).toBe(true);
  });

  it("ערב בלי קופה — markPotPaid הוא no-op", () => {
    const plain = { iso: "2026-07-26", entries: [{ name: "א", amount: 25 }, { name: "ב", amount: -25 }] };
    expect(markPotPaid(plain, true, "עדן גיל")).toBe(plain);
  });

  it("סימון קופה מתוכנית ישנה (הקופה ברשימת ההעברות) משוחזר כ־potPaid", () => {
    const plan = paymentPlan(POT_NIGHT);
    const legacyPlan = JSON.stringify([
      ...plan.transfers,
      { from: "עדן גיל", to: "קופת חיסכון", amount: 25, pot: true },
    ]);
    const legacy = {
      ...POT_NIGHT,
      payments: {
        plan: legacyPlan,
        paid: { [plan.transfers.length]: true },
        received: {},
        confirmations: [],
      },
    };
    expect(paymentPlan(legacy).potPaid).toBe(true);
  });
});

describe("R4 — הקרנת נתונים לצופה", () => {
  it("projectPaymentsForViewer מוציא את הקופה מהתוכנית השמורה וממפה סימונים", () => {
    const plan = paymentPlan(POT_NIGHT);
    const legacyPlan = JSON.stringify([
      { from: "עדן גיל", to: "קופת חיסכון", amount: 25, pot: true },
      ...plan.transfers,
    ]);
    const projected = projectPaymentsForViewer({
      plan: legacyPlan,
      paid: { 1: true },
      received: {},
      confirmations: [{ index: 1, action: "paid", by: "עדן גיל", at: "2026-10-25T00:00:00.000Z" }],
      potPaid: true,
    });
    expect(projected.plan).not.toContain("קופת חיסכון");
    expect(projected.plan).toBe(plan.fingerprint);
    expect(projected.paid).toEqual({ 0: true });
    expect(projected.confirmations).toEqual([
      { index: 0, action: "paid", by: "עדן גיל", at: "2026-10-25T00:00:00.000Z" },
    ]);
    expect("potPaid" in projected).toBe(false);
  });

  it("snapshotForViewer לא משאיר שום סכום קופה בנתוני הצופה", () => {
    const session = {
      ...POT_NIGHT,
      savingsPotActual: 18,
      payments: {
        plan: JSON.stringify([
          ...paymentPlan(POT_NIGHT).transfers,
          { from: "עדן גיל", to: "קופת חיסכון", amount: 25, pot: true },
        ]),
        paid: {},
        received: {},
        confirmations: [],
        potPaid: true,
      },
    };
    const snap = {
      id: "g1",
      data: { sessions: [session], savingsPot: 25, savingsWithdrawals: [], aliases: {}, plan: null },
      config: { shareHistory: true },
    };
    const out = snapshotForViewer(snap);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("קופת חיסכון");
    expect(serialized).not.toContain("savingsPot");
    expect(out.data.sessions[0].savingsPotActual).toBeUndefined();
    expect(out.data.savingsPot).toBeUndefined();
  });
});
