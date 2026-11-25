/* עיגול לחמישיות — הכרעת עדן 19.11.2026, שלב 2 (הקצאה משותפת P1).
   חל רק במסלול האוטומטי של עידן־הקופה (settleWithPot):
   • העיגול ברמת הנטו: זוכה רגיל למטה (122←120), זוכה עדן/אורן למעלה
     (13←15), חייב רגיל למעלה (137←140, ההפרש לעודף), חייב עדן/אורן
     למטה (13←10). כל השאריות זורמות לעודף ← עדן (שלב 1).
   • כל העברה בין אנשים היא כפולה של 5; רגל הקופה נשארת מדויקת.
   • שבר מימון הקופה (<5) וקוונטיזציית החוסר נספגים על ידי הזוכים
     הרגילים בלבד — עדן/אורן לעולם לא סופגים; חלקם בקיצוץ מחולק
     מעוגל למטה לחמישייה. כשאין זוכה רגיל שיכול לספוג (פינת נפילה) —
     עדן סופג כהפחתת זיכוי העודף (או כקיצוץ מזכאותו בחוסר).
   • פיצולי זוג (fromSplit) ביחידות־5 בשארית־גדולה.
   • ערבים שמורים/ידניים וטרום־קופה — בלי עיגול, בדיוק כמו תמיד. */
import { describe, it, expect } from "vitest";
import { settleWithPot, resolveSettlement, POT_SINK_NAME, RESIDUAL_SINK_NAME } from "../lib/nightShare.js";
import { paymentPlan, validateTransfers, saveManualPayments } from "../lib/paymentTracking.js";
import { roundedNets, floor5, ceil5 } from "../lib/settlement";

const W = (name, amount) => ({ name, buyin: 0, cashout: String(amount) });
const D = (name, amount) => ({ name, buyin: amount, cashout: "0" });

const sums = (transfers) => {
  const got = {}, gave = {};
  for (const t of transfers) {
    got[t.to] = (got[t.to] || 0) + t.amount;
    if (t.fromSplit) for (const [n, a] of Object.entries(t.fromSplit)) gave[n] = (gave[n] || 0) + a;
    else gave[t.from] = (gave[t.from] || 0) + t.amount;
  }
  return { got, gave };
};

/** האסרט הגורף: כל העברה שאינה רגל־קופה היא כפולה של 5, וגם כל חלקי הפיצולים. */
function expectAllFive(res) {
  for (const t of res.transfers) {
    if (!t.pot) expect(t.amount % 5, JSON.stringify(t)).toBe(0);
    if (t.fromSplit) {
      for (const a of Object.values(t.fromSplit)) expect(a % 5).toBe(0);
      expect(Object.values(t.fromSplit).reduce((s, v) => s + v, 0)).toBe(t.amount);
    }
  }
  expect(validateTransfers(res.expected, res.transfers)).toEqual([]);
}

describe("הדוגמאות המנעולות של עדן — עיגול ברמת הנטו", () => {
  it("זוכה רגיל 122 ← 120 (למטה)", () => {
    const res = settleWithPot([D("עדן גיל", 120), W("דן ינקלויץ", 122)], 1, 0);
    expect(sums(res.transfers).got["דן ינקלויץ"]).toBe(120);
    expectAllFive(res);
  });

  it("זוכה עדן/אורן 13 ← 15 (למעלה)", () => {
    const eden = settleWithPot([W("עדן גיל", 13), D("קובי סעדה", 15)], 1, 0);
    expect(sums(eden.transfers).got["עדן גיל"]).toBe(15);
    expectAllFive(eden);
    const oren = settleWithPot([W("אורן גיל", 13), D("קובי סעדה", 15)], 1, 0);
    expect(sums(oren.transfers).got["אורן גיל"]).toBe(15);
    expectAllFive(oren);
  });

  it("חייב עדן/אורן 13 ← 10 (למטה)", () => {
    const eden = settleWithPot([D("עדן גיל", 13), W("דן ינקלויץ", 10)], 1, 0);
    expect(sums(eden.transfers).gave["עדן גיל"]).toBe(10);
    expectAllFive(eden);
    const oren = settleWithPot([D("אורן גיל", 13), W("דן ינקלויץ", 10)], 1, 0);
    expect(sums(oren.transfers).gave["אורן גיל"]).toBe(10);
    expectAllFive(oren);
  });

  it("חייב רגיל 137 ← 140 (למעלה) — ההפרש לעודף", () => {
    const res = settleWithPot([D("קובי סעדה", 137), W("דן ינקלויץ", 135)], 1, 0);
    const { got, gave } = sums(res.transfers);
    expect(got["דן ינקלויץ"]).toBe(135);
    expect(gave["קובי סעדה"]).toBe(140); // 135 לזוכה + 5 עודף
    // עדן לא בערב — העודף הולך לכיור הניטרלי כמקודם (שלב 1)
    expect(res.residualTransfers).toEqual([
      { from: "קובי סעדה", to: RESIDUAL_SINK_NAME, amount: 5, residual: true },
    ]);
    expectAllFive(res);
  });

  it("מקרי קצה 1–4: זוכה רגיל ← 0, זוכה מועדף ← 5, חייב רגיל ← 5, חייב מועדף ← 0", () => {
    const regWin = settleWithPot([D("קובי סעדה", 5), W("דן ינקלויץ", 3)], 1, 0);
    expect(regWin.transfers.some((t) => t.to === "דן ינקלויץ")).toBe(false); // זכאות 3 ← 0
    expectAllFive(regWin);
    const privWin = settleWithPot([D("קובי סעדה", 5), W("עדן גיל", 3)], 1, 0);
    expect(sums(privWin.transfers).got["עדן גיל"]).toBe(5); // 3 ← 5
    expectAllFive(privWin);
    const regDebt = settleWithPot([D("קובי סעדה", 3), W("דן ינקלויץ", 5)], 1, 0);
    expect(sums(regDebt.transfers).gave["קובי סעדה"]).toBe(5); // חוב 3 ← 5
    expectAllFive(regDebt);
    const privDebt = settleWithPot([D("עדן גיל", 3), D("קובי סעדה", 5), W("דן ינקלויץ", 5)], 1, 0);
    expect(privDebt.transfers.some((t) => t.from === "עדן גיל")).toBe(false); // חוב 3 ← 0
    expect(sums(privDebt.transfers).got["דן ינקלויץ"]).toBe(5);
    expectAllFive(privDebt);
  });
});

describe("ערב 24.10 במסלול האוטומטי — חשבון החמישיות המלא", () => {
  const NIGHT_2410 = {
    id: "live_1792879962020", iso: "2026-10-24", cps: 2, savings5: true, savingsPot: 93,
    entries: [
      { name: "עדן גיל", buyin: 550, chips: 40 },
      { name: "אורן גיל", buyin: 100, chips: 840 },
      { name: "קובי סעדה", buyin: 400, chips: 0 },
      { name: "ירין מלאך", buyin: 150, chips: 300 },
      { name: "דן ינקלויץ", buyin: 150, chips: 500 },
      { name: "נתנאל כהן", buyin: 150, chips: 0 },
      { name: "דור לירז", buyin: 100, chips: 420 },
      { name: "אופיר סנה", buyin: 250, chips: 1530 },
    ],
  };

  it("עדן: סך בין־אנשים 435 + רגל קופה 90 (§8); שבר 2 נספג על ידי הרגילים בלבד; אורן פטורה ממנו", () => {
    const resolved = resolveSettlement(NIGHT_2410);
    const res = resolved.result;
    expect(paymentPlan(NIGHT_2410).problems).toEqual([]);
    const { got, gave } = sums(resolved.transfers);
    // זכאויות סופיות: אופיר 480, אורן 305, דור 105, דן 95
    expect(got["אופיר סנה"]).toBe(480);
    expect(got["אורן גיל"]).toBe(305);
    expect(got["דור לירז"]).toBe(105);
    expect(got["דן ינקלויץ"]).toBe(95);
    // הקיצוץ הכולל 60 = חוסר 58 + שבר קופה 2. אורן נחתכה רק 15 —
    // חלקה היחסי המדויק (17.76) מעוגל למטה; היא לא סופגת מהשבר.
    // הרגילים נחתכו 45 יחד (אופיר 35, דור 5, דן 5) — כולל השבר.
    expect(320 - got["אורן גיל"]).toBe(15);
    expect(515 - got["אופיר סנה"] + (110 - got["דור לירז"]) + (100 - got["דן ינקלויץ"])).toBe(45);
    // עדן: חוב מעוגל 530 — 435 בין־אנשים (כפולת־5) + 90 לקופה (§8:
    // floor5(93); השבר 3 הוא עודף נסתר של עדן, ולכן הוא משלם 525)
    const edenPerson = resolved.transfers
      .filter((t) => !t.pot && !t.residual)
      .reduce((s, t) => s + (t.fromSplit ? t.fromSplit["עדן גיל"] || 0 : t.from === "עדן גיל" ? t.amount : 0), 0);
    expect(edenPerson).toBe(435);
    expect(gave["עדן גיל"]).toBe(525);
    const potRows = resolved.transfers.filter((t) => t.pot);
    expect(potRows).toEqual([{ from: "עדן גיל", to: POT_SINK_NAME, amount: 90, pot: true }]);
    expect(res.potFunded).toBe(90);
    expect(res.potFraction).toBe(3);
    expectAllFive(res);
  });
});

describe("פינת נפילה — עדן הזוכה היחיד עם קופה (אין זוכה רגיל שיספוג)", () => {
  it("עודף: העודף ושבר הקופה (§8) מזוכים לעדן; רגל הקופה 90 וההעברות חמישיות", () => {
    // עודף אמיתי 7 (חובות 300, זכייה 200, קופה 93). §8: הרגל היא
    // floor5(93) = 90, והשבר 3 מצטרף לעודף — כל השארית (10) לעדן.
    const res = settleWithPot([W("עדן גיל", 200), D("קובי סעדה", 300)], 1, 93);
    expect(res.potFunded).toBe(90);
    expect(res.potFraction).toBe(3);
    expect(res.residualTransfers).toEqual([
      { from: "קובי סעדה", to: "עדן גיל", amount: 10, residual: true },
    ]);
    const { got, gave } = sums(res.transfers);
    expect(got["עדן גיל"]).toBe(210); // 200 זכייה + 7 עודף + 3 שבר־קופה
    expect(gave["קובי סעדה"]).toBe(300); // משלם את מלוא חובו
    expect(res.expected.find((e) => e.name === "עדן גיל").net).toBe(210);
    expectAllFive(res);
  });

  it("חוסר: עדן הזוכה היחיד סופג את החוסר האמיתי מול הרגל המעוגלת — בלי שבר הקופה", () => {
    // תביעות 300 + רגל 90 מול חובות 350 → חוסר 40 (כפולת־5 כבר).
    // אין זוכה רגיל — הקיצוץ 40 נופל על עדן, הזוכה היחיד (הפינה
    // המתועדת). שבר הקופה 3 לא מתווסף לקיצוץ שלו.
    const res = settleWithPot([W("עדן גיל", 300), D("קובי סעדה", 200), D("נתנאל כהן", 150)], 1, 93);
    expect(res.potFunded).toBe(90);
    const { got, gave } = sums(res.transfers);
    expect(got["עדן גיל"]).toBe(260); // 300 − 40
    expect(gave["קובי סעדה"]).toBe(200);
    expect(gave["נתנאל כהן"]).toBe(150);
    expectAllFive(res);
  });
});

describe("קיצוץ חוסר בחמישיות עם עדן בין הזוכים", () => {
  it("חלקו של עדן מעוגל למטה לחמישייה; היתרה עוברת לזוכה הרגיל", () => {
    // זכאויות מעוגלות: עדן 115 (113 למעלה), דן 205 (207 למטה). חובות
    // 250, קופה 20 → חוסר 90. חלקו המדויק של עדן 32.3 — נחתך 30 בלבד;
    // דן סופג 60 (חלקו המדויק 57.7 + היתרה).
    const res = settleWithPot([W("עדן גיל", 113), W("דן ינקלויץ", 207), D("קובי סעדה", 250)], 1, 20);
    const { got, gave } = sums(res.transfers);
    expect(got["עדן גיל"]).toBe(85); // 115 − 30
    expect(got["דן ינקלויץ"]).toBe(145); // 205 − 60
    expect(got[POT_SINK_NAME]).toBe(20);
    expect(gave["קובי סעדה"]).toBe(250);
    expectAllFive(res);
  });

  it("רגרסיה: קיצוץ המועדף מחושב מול החוסר האמיתי G בלבד — לא מול G+F", () => {
    // תביעות 575 (עדן 420, דן 155), חובות 580 (קובי), קופה 113.
    // חוסר אמיתי G = ‏108 (מול הקופה המלאה); הקיצוץ הכולל K = ‏110.
    // חלקו המדויק של עדן ב־G הוא 78.9 → נחתך 75 בלבד. אילו חושב מול K
    // היה נחתך 80 — כלומר סופג חלק מהשבר, בניגוד להכרעה שעדן/אורן
    // לעולם לא סופגים את השבר. דן סופג את היתרה (35). §8: הרגל היא
    // floor5(113) = 110, ולכן המימון העודף (110 קיצוץ מול פער־רגל 105)
    // חוזר לעדן כשורת עודף של 5 — נטו הוא מקבל 350.
    const res = settleWithPot([W("עדן גיל", 420), W("דן ינקלויץ", 155), D("קובי סעדה", 580)], 1, 113);
    const { got } = sums(res.transfers);
    const edenDirect = res.transfers
      .filter((t) => t.to === "עדן גיל" && !t.residual)
      .reduce((s, t) => s + t.amount, 0);
    expect(420 - edenDirect).toBe(75); // קיצוץ עדן בהעברות הישירות
    expect(res.residualTransfers).toEqual([
      { from: "קובי סעדה", to: "עדן גיל", amount: 5, residual: true },
    ]);
    expect(got["עדן גיל"]).toBe(350);
    expect(155 - got["דן ינקלויץ"]).toBe(35); // קיצוץ דן
    expect(got["דן ינקלויץ"]).toBe(120);
    expect(res.potFunded).toBe(110); // §8: floor5(113)
    expectAllFive(res); // כל ההעברות חמישיות + הוולידטור שקט
  });
});

describe("פיצול זוג ביחידות־5", () => {
  it("חובות 95/5 המשלמים 50: הפיצול 50/0 (שארית־גדולה), לא 48/2", () => {
    // איציק וירדן הם זוג (FILL_COUPLES). ההעברה המשותפת הראשונה היא 50
    // ביחס חובות 95:5 — פיצול יחסי מדויק היה 47.5/2.5.
    const res = settleWithPot(
      [D("איציק תפילין", 95), D("ירדן תפילין", 5), W("דן ינקלויץ", 50), W("אבי כהן", 50)],
      1,
      0
    );
    const joints = res.transfers.filter((t) => t.joint);
    expect(joints.length).toBeGreaterThan(0);
    expect(joints[0].amount).toBe(50);
    expect(joints[0].fromSplit).toEqual({ "איציק תפילין": 50, "ירדן תפילין": 0 });
    const { got, gave } = sums(res.transfers);
    expect(gave["איציק תפילין"]).toBe(95);
    expect(gave["ירדן תפילין"]).toBe(5);
    expect(got["דן ינקלויץ"]).toBe(50);
    expect(got["אבי כהן"]).toBe(50);
    expectAllFive(res);
  });
});

describe("בלי עיגול מחוץ למסלול האוטומטי של עידן־הקופה", () => {
  it("ערב טרום־קופה: סכומים מדויקים, בלי חמישיות", () => {
    const session = {
      iso: "2026-10-09",
      entries: [
        { name: "עדן גיל", amount: -137 },
        { name: "דן ינקלויץ", amount: 137 },
      ],
    };
    const resolved = resolveSettlement(session);
    expect(resolved.mode).toBe("plain");
    expect(resolved.transfers).toEqual([{ from: "עדן גיל", to: "דן ינקלויץ", amount: 137 }]);
  });

  it("חלוקה שמורה/ידנית: תשלום ידני 137 מתעגל למעלה ל־140 (§8), והיתרה בחמישיות", () => {
    /* נוסח קודם (19.11) שימר 137 כמות שהוא — הוחלף בהכרעת §8 של גל
       Pot Boost: ערך ידני לא־עגול מתעגל אוטומטית למעלה, ההפרש לעדן,
       וכל יתרת החלוקה עוברת במנוע החמישיות האחד. */
    const session = {
      iso: "2026-10-24", cps: 1, savings5: true,
      entries: [
        { name: "עדן גיל", amount: -200 },
        { name: "דן ינקלויץ", amount: 200 },
      ],
    };
    const withManual = saveManualPayments(session, [
      { from: "עדן גיל", to: "דן ינקלויץ", amount: 137 },
    ]);
    const plan = paymentPlan(withManual);
    expect(plan.problems).toEqual([]);
    const amounts = plan.transfers.map((t) => t.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([60, 140]); // 140 ידני (137↑) + 60 שארית במנוע
  });
});

describe("פאז — האסרט הגורף על תצורות אקראיות", () => {
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const NAMES = ["עדן גיל", "אורן גיל", "דור לירז", "עדן לירז", "שגיא גיל", "דוד בני גיל", "אופיר סנה", "נתנאל כהן", "איציק תפילין", "ירדן תפילין", "קובי סעדה", "דן ינקלויץ", "נועה לוי", "אבי רון"];
  const ri = (rnd, n) => Math.floor(rnd() * n);

  it("600 ערבים: הוולידטור שקט, כל העברה בין־אנשים כפולת־5, הקופה ממומנת כשיש חובות", () => {
    const rnd = mulberry32(19571119);
    for (let iter = 0; iter < 600; iter++) {
      const nPlayers = 5 + ri(rnd, 6);
      const pool = [...NAMES].sort(() => rnd() - 0.5).slice(0, nPlayers);
      if (!pool.includes("עדן גיל")) pool[0] = "עדן גיל";
      const players = pool.map((name) => {
        const buyin = 50 * (1 + ri(rnd, 8));
        const cashout = String(ri(rnd, buyin * 2 + 400));
        return { name, buyin, cashout };
      });
      const pot = Math.round(players.reduce((s, p) => s + p.buyin, 0) * 0.05);
      const res = settleWithPot(players, 2, pot);
      expectAllFive(res);
      // קיצוץ של זוכה מועדף (עדן/אורן) לעולם לא עובר את floor5(חלקו
      // המדויק בחוסר האמיתי G) — הוא לא סופג דבר מהשבר F. היוצא מן
      // הכלל היחיד: פינת נפילה, שבה כל הזוכים הרגילים נחתכו ל־100%
      // מתביעותיהם והמועדפים סופגים אחרונים.
      {
        const PRIV = new Set(["עדן גיל", "אורן גיל"]);
        const claimOf = new Map();
        let sumClaims = 0, sumDebts = 0;
        for (const row of roundedNets(players, 2)) {
          if (row.net > 0) {
            const c = PRIV.has(row.name) ? ceil5(row.net) : floor5(row.net);
            claimOf.set(row.name, c);
            sumClaims += c;
          } else if (row.net < 0) {
            sumDebts += PRIV.has(row.name) ? floor5(-row.net) : ceil5(-row.net);
          }
        }
        const G = sumClaims + pot - sumDebts;
        const finalOf = new Map(res.nets.map((n) => [n.name, n.net]));
        const cutOf = (name) => (claimOf.get(name) || 0) - Math.max(0, finalOf.get(name) || 0);
        const totalCuts = [...claimOf.keys()].reduce((s, n) => s + cutOf(n), 0);
        if (totalCuts > 0 && sumClaims > 0) {
          const regsExhausted = [...claimOf.keys()]
            .filter((n) => !PRIV.has(n))
            .every((n) => cutOf(n) >= (claimOf.get(n) || 0));
          if (!regsExhausted) {
            for (const n of claimOf.keys()) {
              if (!PRIV.has(n)) continue;
              const cap = G > 0 ? floor5((G * claimOf.get(n)) / sumClaims) : 0;
              expect(cutOf(n), `iter ${iter}: קיצוץ ${n}`).toBeLessThanOrEqual(cap);
            }
          }
        }
      }
      const rawDebts = res.nets.reduce((s, n) => s + Math.max(0, -n.raw), 0);
      /* §8: הרגל הממומנת היא floor5(pot) — לא הסכום המלא. */
      if (rawDebts >= pot + 10) expect(res.potFunded).toBe(Math.floor(pot / 5) * 5);
      // אף חייב לא משלם מעבר להתחייבותו בתוכנית (nets = ההתחייבות)
      const owe = {};
      for (const t of res.transfers) {
        if (t.fromSplit) for (const [n, a] of Object.entries(t.fromSplit)) owe[n] = (owe[n] || 0) + a;
        else if (t.from) owe[t.from] = (owe[t.from] || 0) + t.amount;
      }
      for (const n of res.nets) {
        if (n.net < 0) expect(owe[n.name] || 0).toBeLessThanOrEqual(-n.net);
      }
    }
  }, 120000);
});
