/* גל 2א (כסף — צד אפליקציה): שחזורי הביקורת המחמירה של 30.10.
   ממצא 2 — עורך החלוקה וה־resolver נתנו חלוקות שונות לאותו ערב
   (₪32 עברו בין זוכים), וה־expected של המסלול השמור היה גולמי.
   ממצא 3 — catch ריק זרק בשקט את כל התשלומים הידניים ומפת החוסר.
   ממצא 7 — קיזוז חוסר־הג'יטונים נכתב רק ל־amount, בלי תקרה, ובמימוש
   חלוקה יחסית שונה מזה של settle.
   ממצא 23 (דוח מאמתים) — נפילת־הגיבוי של ה־5% עיגלה לשקל שלם. */
import { describe, it, expect } from "vitest";
import {
  savedSettlement,
  settlementBasis,
  recordManualPayments,
} from "../lib/savedSettlement.js";
import {
  editorBalancesWithPot,
  applyManualPayment,
  settleFromBalances,
  applyManualShortfall,
  openingBalances,
  maxPayable,
  POT_SINK_NAME,
} from "../lib/manualSettlement.js";
import { resolveSettlement, potRecordedFor } from "../lib/nightShare.js";
import { paymentPlan, potOverview } from "../lib/paymentTracking.js";
import { proportionalCuts } from "../lib/settlement";
import { deductChipsShortage } from "../lib/poker/nightBalance.js";

const receivedByName = (transfers) => {
  const got = {};
  for (const t of transfers || []) {
    if (t.to) got[t.to] = (got[t.to] || 0) + t.amount;
  }
  return got;
};

/* שחזור הביקורת המדויק (אומת צולב): W1 +300, W2 +100, D1 −250, D2 −60,
   קופה 10, תשלום ידני D1→W1 של 225. העורך נתן W1 225 / W2 75;
   ה־resolver הישן נתן W1 257 / W2 43. */
const AUDIT_PLAYERS = [
  { name: "W1", buyin: 0, cashout: "300" },
  { name: "W2", buyin: 0, cashout: "100" },
  { name: "D1", buyin: 250, cashout: "0" },
  { name: "D2", buyin: 60, cashout: "0" },
];
const AUDIT_MANUAL = [{ from: "D1", to: "W1", amount: 225 }];

describe("ממצא 2 — נקודת התחלה אחת לעורך ול־resolver", () => {
  it("שחזור הביקורת: העורך וה־resolver נותנים אותה חלוקה (W1 225 / W2 75)", () => {
    // צד העורך
    const ed = editorBalancesWithPot(AUDIT_PLAYERS, 1, 10, POT_SINK_NAME, {});
    const afterManual = applyManualPayment(ed.balances, AUDIT_MANUAL[0]);
    const remaining = settleFromBalances(afterManual, 1, {
      preferCreditors: [POT_SINK_NAME],
    });
    const editorReceived = receivedByName([...AUDIT_MANUAL, ...remaining.transfers]);
    expect(editorReceived.W1).toBe(225);
    expect(editorReceived.W2).toBe(75);

    // צד ה־resolver
    const res = savedSettlement(
      AUDIT_PLAYERS,
      1,
      {
        basis: settlementBasis(AUDIT_PLAYERS, 1),
        manualPayments: AUDIT_MANUAL,
        preferCreditors: [],
      },
      { potAmount: 10, potSinkName: POT_SINK_NAME }
    );
    expect(res.manualError).toBeUndefined();
    const resolverReceived = receivedByName(res.transfers);
    expect(resolverReceived.W1).toBe(225);
    expect(resolverReceived.W2).toBe(75);
    expect(resolverReceived[POT_SINK_NAME]).toBe(10);
  });

  it("בלי תשלומים ידניים: המסלול השמור זהה למסלול האוטומטי (from/to/amount)", () => {
    const res = savedSettlement(
      AUDIT_PLAYERS,
      1,
      { basis: settlementBasis(AUDIT_PLAYERS, 1), manualPayments: [], preferCreditors: [] },
      { potAmount: 10, potSinkName: POT_SINK_NAME }
    );
    const key = (t) => `${t.from}|${t.to}|${t.amount}`;
    const auto = resolveSettlement({
      iso: "2026-10-24",
      cps: 1,
      savings5: true,
      savingsPot: 10,
      entries: [
        { name: "W1", amount: 300 },
        { name: "W2", amount: 100 },
        { name: "D1", amount: -250 },
        { name: "D2", amount: -60 },
      ],
    });
    expect(res.transfers.map(key).sort()).toEqual(auto.transfers.map(key).sort());
  });

  it("expected אחיד: אין באנר בעיות כוזב, ו־edenWon הוא מה שמתקבל בפועל", () => {
    const edenPlayers = [
      { name: "עדן גיל", buyin: 0, cashout: "300" },
      { name: "W2", buyin: 0, cashout: "100" },
      { name: "D1", buyin: 250, cashout: "0" },
      { name: "D2", buyin: 60, cashout: "0" },
    ];
    const session = {
      id: "wave2_f2",
      iso: "2026-10-24",
      d: 24,
      mo: 10,
      y: 2026,
      cps: 1,
      savings5: true,
      savingsPot: 10,
      entries: [
        { name: "עדן גיל", amount: 300 },
        { name: "W2", amount: 100 },
        { name: "D1", amount: -250 },
        { name: "D2", amount: -60 },
      ],
      manualSettlement: {
        basis: settlementBasis(edenPlayers, 1),
        manualPayments: [{ from: "D1", to: "עדן גיל", amount: 225 }],
        preferCreditors: [],
      },
    };
    // עם ה־expected הגולמי הישן הוולידטור צעק "אמור לקבל 300 אבל מקבל 225"
    expect(paymentPlan(session).problems).toEqual([]);
    const evening = potOverview({ sessions: [session] }).evenings[0];
    expect(evening.edenWon).toBe(225);
    expect(evening.edenGross).toBe(300);
  });
});

describe("ממצא 3 — כשל בתשלום ידני הוא דגל מפורש, לא זריקה שקטה", () => {
  it("מסלול קופה: תשלום מעבר לזכאות הנטו (אך בתוך הגולמית) מסומן, והמפה נשארת", () => {
    // D1→W2 של 95: חוקי מול הגולמי של W2 (100), לא חוקי מול הנטו
    // שאחרי מפת החוסר השמורה (90) — ה־resolver הישן היה מקבל אותו.
    const res = savedSettlement(
      AUDIT_PLAYERS,
      1,
      {
        basis: settlementBasis(AUDIT_PLAYERS, 1),
        manualPayments: [{ from: "D1", to: "W2", amount: 95 }],
        preferCreditors: [],
        shortfall: { W2: 10 },
      },
      { potAmount: 10, potSinkName: POT_SINK_NAME }
    );
    expect(res.manualError).toBeTruthy();
    expect(res.manualError.payment.amount).toBe(95);
    expect(res.manualPayments).toEqual([]);
    expect(res.droppedManualPayments).toHaveLength(1);
    expect(res.transfers.some((t) => t.manual)).toBe(false);
    // המפה הידנית (W2 −10) נשארת מוחלת גם בלי הידניים: W2 מקבל 69
    // (בלעדיה היה מקבל 75 כמו בחיתוך האוטומטי הנקי)
    expect(receivedByName(res.transfers).W2).toBe(69);
  });

  it("מסלול בלי־קופה: המפה הדו־צדדית נשארת והשגיאה מדווחת", () => {
    const players = [
      { name: "A", buyin: 0, cashout: "100" },
      { name: "B", buyin: 100, cashout: "0" },
    ];
    const res = savedSettlement(players, 1, {
      basis: settlementBasis(players, 1),
      manualPayments: [{ from: "B", to: "A", amount: 90 }],
      preferCreditors: [],
      shortfall: { A: 20 },
    });
    expect(res.manualError).toBeTruthy();
    expect(res.manualPayments).toEqual([]);
    // A חתוך במפה ל־80 — ה־expected משקף את המפה, לא את הגולמי
    expect(res.opening).toContainEqual({ name: "A", net: 80 });
    expect(receivedByName(res.transfers).A).toBe(80);
  });

  it("paymentPlan מציג את הכשל כבעיה למנהל", () => {
    const session = {
      id: "wave2_f3",
      iso: "2026-10-24",
      d: 24,
      mo: 10,
      y: 2026,
      cps: 1,
      savings5: true,
      savingsPot: 10,
      entries: [
        { name: "W1", amount: 300 },
        { name: "W2", amount: 100 },
        { name: "D1", amount: -250 },
        { name: "D2", amount: -60 },
      ],
      manualSettlement: {
        basis: settlementBasis(AUDIT_PLAYERS, 1),
        manualPayments: [{ from: "D1", to: "W1", amount: 250 }],
        preferCreditors: [],
      },
    };
    const problems = paymentPlan(session).problems;
    expect(problems.some((p) => p.includes("החלוקה הידנית לא נטענה"))).toBe(true);
  });

  it("recordManualPayments מאמת מול אותן יתרות כמו ה־resolver (נטו, לא גולמי)", () => {
    expect(() =>
      recordManualPayments(AUDIT_PLAYERS, 1, [{ from: "D1", to: "W1", amount: 250 }], {
        potAmount: 10,
        potSinkName: POT_SINK_NAME,
      })
    ).toThrow();
    const ok = recordManualPayments(AUDIT_PLAYERS, 1, AUDIT_MANUAL, {
      potAmount: 10,
      potSinkName: POT_SINK_NAME,
    });
    expect(ok.manualPayments).toHaveLength(1);
  });

  it("תקרות העורך בלי־קופה: applyManualShortfall מיישר את העורך ל־resolver", () => {
    const players = [
      { name: "A", buyin: 0, cashout: "100" },
      { name: "B", buyin: 100, cashout: "0" },
    ];
    const base = openingBalances(players, 1, {});
    const editorBalances = applyManualShortfall(base.balances, { A: 20 });
    expect(editorBalances.A).toBe(80);
    expect(maxPayable(editorBalances, "B", "A")).toBe(80);
    const res = savedSettlement(players, 1, {
      basis: settlementBasis(players, 1),
      manualPayments: [],
      preferCreditors: [],
      shortfall: { A: 20 },
    });
    expect(res.opening).toContainEqual({ name: "A", net: 80 });
  });
});

describe("ממצא 7 — חלוקת חוסר יחסית אחת + קיזוז על הג'יטונים", () => {
  it("proportionalCuts שקול ל־settle: זכיות 50/25/25 וחיתוך 3 → {1,1,1}", () => {
    expect(proportionalCuts([50, 25, 25], 3)).toEqual([1, 1, 1]);
    expect(proportionalCuts([100], 250)).toEqual([100]);
    expect(proportionalCuts([0, 0], 5)).toEqual([0, 0]);
  });

  it("deductChipsShortage חותך את ה־chips — amount והחלוקה נשארים מסונכרנים", () => {
    const entries = [{ name: "W", buyin: 100, chips: 300, amount: 50 }];
    deductChipsShortage(entries, 10, 2);
    expect(entries[0].chips).toBe(280);
    expect(entries[0].amount).toBe(40);
  });

  it("בלי סכומים שליליים: חוסר מעבר לסך הזכיות עוצר באפס", () => {
    const entries = [
      { name: "W1", buyin: 0, chips: 60, amount: 30 },
      { name: "W2", buyin: 0, chips: 40, amount: 20 },
    ];
    deductChipsShortage(entries, 500, 2);
    expect(entries[0].amount).toBe(0);
    expect(entries[1].amount).toBe(0);
    expect(entries[0].chips).toBe(0);
    expect(entries[1].chips).toBe(0);
  });

  it("זכייה שברית: החיתוך לא יורד מהזכייה (amount נשאר אי־שלילי)", () => {
    const entries = [{ name: "W", buyin: 100, chips: 281, amount: 40.5 }];
    deductChipsShortage(entries, 41, 2);
    expect(entries[0].amount).toBeGreaterThanOrEqual(0);
    expect(entries[0].amount).toBe(0.5);
  });
});

describe("ממצא 23 (מאמתים) — נפילת־גיבוי של 5% ב־r2, לא בשקלים שלמים", () => {
  it("קניות 1,750 בלי שדה רשום → 87.5 (לא 88)", () => {
    const session = {
      iso: "2026-10-20",
      savings5: true,
      entries: [
        { name: "A", buyin: 1000, chips: 0 },
        { name: "B", buyin: 750, chips: 0 },
      ],
    };
    expect(potRecordedFor(session)).toBe(87.5);
  });

  it("שדה רשום קיים תמיד גובר על נפילת־הגיבוי", () => {
    const session = {
      iso: "2026-10-20",
      savings5: true,
      savingsPot: 93,
      entries: [{ name: "A", buyin: 1000, chips: 0 }],
    };
    expect(potRecordedFor(session)).toBe(93);
  });
});
