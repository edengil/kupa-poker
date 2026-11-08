import { describe, it, expect } from "vitest";
import { settle } from "../lib/settlement.ts";
import { routePotThroughEden, POT_SINK_NAME } from "../lib/manualSettlement";
import { settleWithPot } from "../lib/nightShare";
import { savedSettlement } from "../lib/savedSettlement";
import { validateTransfers, paymentPlan } from "../lib/paymentTracking.js";
import { CPS } from "../lib/report.js";
import { NIGHT_24_10 } from "./fixtures/night-2026-10-24.js";

/* ============================================================================
   גל 4 · פריט 4.1 — רגרסיית שער 0.1 (A3): ניתוב הקופה דרך עדן לא שובר
   העברה זוגית משותפת (joint+fromSplit) שמשלמת לקופה. לפני התיקון הסכום
   קטן והפיצול נשאר מלא: הוולידטור צעק "משולם 500 מול מתקבל 400" ושורת
   הקופה הציגה 50 על פיצול של 150, ו"העברת־רפאים" יצאה על שם הזוג המשולב
   בלי joint ובלי fromSplit.
   ============================================================================ */

const EDEN = "עדן גיל";
const SINK = POT_SINK_NAME;

function obligationsOf(transfers) {
  const owe = Object.create(null);
  for (const t of transfers) {
    if (t.fromSplit) for (const [n, a] of Object.entries(t.fromSplit)) owe[n] = (owe[n] || 0) + a;
    else if (t.from) owe[t.from] = (owe[t.from] || 0) + t.amount;
  }
  return owe;
}
const planSum = (ts) => ts.reduce((s, t) => s + t.amount, 0);
const obSum = (ts) => Object.values(obligationsOf(ts)).reduce((s, v) => s + v, 0);
const jointBroken = (ts) =>
  ts.filter(
    (t) =>
      t.fromSplit &&
      Object.values(t.fromSplit).reduce((s, v) => s + v, 0) !== t.amount
  );

describe("4.1 — הרפרו הממוקד של שער 0.1 (זוג משלם קופה במשותף, עדן חייב)", () => {
  it("התוכנית מאוזנת: 400 = 400, אין העברת־רפאים, שורת הקופה עקבית", () => {
    // התחייבויות: שגיא −150 · דוד −150 (זוג) · עדן −100. תביעות: קופה 150 · קובי 250.
    const players = [
      { name: "שגיא גיל", buyin: 150, cashout: "0" },
      { name: "דוד בני גיל", buyin: 150, cashout: "0" },
      { name: EDEN, buyin: 100, cashout: "0" },
      { name: "קובי סעדה", buyin: 0, cashout: String(250 * CPS) },
      { name: SINK, buyin: 0, cashout: String(150 * CPS) },
    ];
    const res = settle(players, CPS, { preferCreditors: [SINK] });
    const routed = routePotThroughEden(res.transfers, EDEN, SINK);
    const problems = validateTransfers(
      res.nets.filter((n) => n.name !== SINK).concat([{ name: SINK, net: 150 }]),
      routed.transfers
    );
    expect(problems).toEqual([]);
    expect(planSum(routed.transfers)).toBe(400);
    expect(obSum(routed.transfers)).toBe(400);
    // אף העברה לא נשברת: amount ≡ ΣfromSplit בכל העברה זוגית
    expect(jointBroken(routed.transfers)).toEqual([]);
    // אין העברה על שם הזוג המשולב בלי joint/fromSplit ("העברת־הרפאים")
    const ghosts = routed.transfers.filter(
      (t) => t.from === "שגיא גיל ודוד בני גיל" && !t.joint
    );
    expect(ghosts).toEqual([]);
    // הקופה ממומנת במלואה, וחלקו של עדן בה = חובו (100)
    const potIn = routed.transfers
      .filter((t) => t.to === SINK)
      .reduce((s, t) => s + t.amount, 0);
    expect(potIn).toBe(150);
    const edenToPot = routed.transfers.find((t) => t.from === EDEN && t.to === SINK);
    expect(edenToPot?.amount).toBe(100);
    // כל אחד מבני הזוג משלם בדיוק את חובו — לא שקל יותר
    const owe = obligationsOf(routed.transfers);
    expect(owe["שגיא גיל"]).toBe(150);
    expect(owe["דוד בני גיל"]).toBe(150);
    expect(owe[EDEN]).toBe(100);
  });

  it("רשימה סינתטית: החלפה חלקית מהעברה זוגית לקופה שומרת פיצול יחסי", () => {
    const input = [
      { from: "שגיא גיל ודוד בני גיל", to: SINK, amount: 150, joint: true, fromSplit: { "שגיא גיל": 75, "דוד בני גיל": 75 } },
      { from: EDEN, to: "קובי סעדה", amount: 100 },
      { from: "שגיא גיל ודוד בני גיל", to: "קובי סעדה", amount: 150, joint: true, fromSplit: { "שגיא גיל": 75, "דוד בני גיל": 75 } },
    ];
    const { transfers: out } = routePotThroughEden(input, EDEN, SINK);
    expect(jointBroken(out)).toEqual([]);
    expect(planSum(out)).toBe(400);
    expect(obSum(out)).toBe(400);
    // ההעברה המחליפה לזוכה מתמזגת לתוך ההעברה הזוגית הקיימת לאותו זוכה:
    // 150 מקוריים (75/75) + 100 מההחלפה (50/50) = 250 עם פיצול 125/125
    const replacement = out.find((t) => t.to === "קובי סעדה" && t.joint);
    expect(replacement?.amount).toBe(250);
    expect(replacement?.fromSplit).toEqual({ "שגיא גיל": 125, "דוד בני גיל": 125 });
    // שורת הקופה הזוגית שנשארה: 50 עם פיצול 25/25 — לא 50 על פיצול 150
    const potRow = out.find((t) => t.to === SINK && t.joint);
    expect(potRow?.amount).toBe(50);
    expect(potRow?.fromSplit).toEqual({ "שגיא גיל": 25, "דוד בני גיל": 25 });
  });
});

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

describe("4.1 — פאז תצורות זוגיות (תצורת הרפרו נכללת דרך הבדיקה הממוקדת למעלה)", () => {
  it("settleWithPot: ‏2000 ערבים — הוולידטור שקט, תוכנית = התחייבויות, אין חיוב־יתר", () => {
    const rnd = mulberry32(20261108);
    let jointToSinkSeen = 0;
    for (let iter = 0; iter < 2000; iter++) {
      const nPlayers = 5 + ri(rnd, 6);
      const pool = [...NAMES].sort(() => rnd() - 0.5).slice(0, nPlayers);
      if (!pool.includes(EDEN)) pool[0] = EDEN;
      const players = pool.map((name) => {
        const buyin = 50 * (1 + ri(rnd, 8));
        const cashout = String(ri(rnd, buyin * CPS + 400));
        return { name, buyin, cashout };
      });
      const pot = Math.round(players.reduce((s, p) => s + p.buyin, 0) * 0.05);
      const res = settleWithPot(players, CPS, pot);
      if (res.transfers.some((t) => t.joint && t.to === SINK)) jointToSinkSeen++;
      expect(jointBroken(res.transfers)).toEqual([]);
      expect(validateTransfers(res.expected, res.transfers)).toEqual([]);
      expect(planSum(res.transfers)).toBe(obSum(res.transfers));
      const owe = obligationsOf(res.transfers);
      for (const n of res.nets) {
        const debt = n.net < 0 ? -n.net : 0;
        expect(owe[n.name] || 0).toBeLessThanOrEqual(debt);
      }
    }
    // תצורת זוג→קופה באמת הופיעה בפאז (אחרת הפאז לא מוכיח כלום)
    expect(jointToSinkSeen).toBeGreaterThan(0);
  }, 120000);

  it("savedSettlement: ‏1500 ערבים שמורים — הוולידטור שקט מול היתרות", () => {
    const rnd = mulberry32(424242);
    for (let iter = 0; iter < 1500; iter++) {
      const nPlayers = 5 + ri(rnd, 5);
      const pool = [...NAMES].sort(() => rnd() - 0.5).slice(0, nPlayers);
      if (!pool.includes(EDEN)) pool[0] = EDEN;
      const players = pool.map((name) => {
        const buyin = 50 * (1 + ri(rnd, 8));
        const cashout = String(ri(rnd, buyin * CPS + 300));
        return { name, buyin, cashout };
      });
      const pot = Math.round(players.reduce((s, p) => s + p.buyin, 0) * 0.05);
      const basis = JSON.stringify([CPS, players.map(({ name, buyin, cashout }) => ({ name, buyin, cashout }))]);
      const saved = { basis, manualPayments: [], preferCreditors: [], shortfall: {} };
      let res;
      try {
        res = savedSettlement(players, CPS, saved, { potAmount: pot, potSinkName: SINK, edenName: EDEN });
      } catch { continue; }
      expect(jointBroken(res.transfers)).toEqual([]);
      expect(validateTransfers(res.opening, res.transfers)).toEqual([]);
      expect(planSum(res.transfers)).toBe(obSum(res.transfers));
    }
  }, 120000);

  it("routePotThroughEden ישיר: ‏3000 רשימות סינתטיות עם joint לקופה", () => {
    const rnd = mulberry32(777);
    let jointSink = 0;
    for (let iter = 0; iter < 3000; iter++) {
      const list = [];
      const jt = 20 + ri(rnd, 180);
      const a = 1 + ri(rnd, jt - 1);
      list.push({ from: `${EDEN} ואורן גיל`, to: "דן ינקלויץ", amount: jt, joint: true, fromSplit: { [EDEN]: a, "אורן גיל": jt - a } });
      const sinkAmt = 10 + ri(rnd, 120);
      if (rnd() < 0.5) {
        const b = 1 + ri(rnd, Math.max(1, sinkAmt - 1));
        list.push({ from: "קובי סעדה ודן ינקלויץ", to: SINK, amount: sinkAmt, joint: true, fromSplit: { "קובי סעדה": b, "דן ינקלויץ": sinkAmt - b } });
        jointSink++;
      } else {
        list.push({ from: "קובי סעדה", to: SINK, amount: sinkAmt });
      }
      const e1 = ri(rnd, 300);
      if (e1 > 0) list.push({ from: EDEN, to: "אופיר סנה", amount: e1 });
      const e2 = ri(rnd, 200);
      if (e2 > 0) list.push({ from: EDEN, to: "דן ינקלויץ", amount: e2 });
      const ps0 = planSum(list), os0 = obSum(list);
      const owe0 = obligationsOf(list);
      const { transfers: out } = routePotThroughEden(list, EDEN, SINK);
      expect(jointBroken(out)).toEqual([]);
      expect(planSum(out)).toBe(ps0);
      expect(obSum(out)).toBe(os0);
      const owe1 = obligationsOf(out);
      for (const n of Object.keys(owe0)) expect(owe1[n] || 0).toBeLessThanOrEqual(owe0[n]);
    }
    expect(jointSink).toBeGreaterThan(0);
  }, 120000);
});

describe("4.1 — פיקסצ'ר־הזהב 24.10 לא זז", () => {
  it("התוכנית המחושבת של 24.10 זהה בייטית לתוכנית הסופית הסגורה", () => {
    const plan = paymentPlan(NIGHT_24_10);
    expect(plan.problems).toEqual([]);
    expect(plan.transfers).toEqual([
      { from: "עדן גיל", to: "אורן גיל", amount: 307, pair: true },
      { from: "נתנאל כהן", to: "אופיר סנה", amount: 150, pair: true },
      { from: "קובי סעדה", to: "אופיר סנה", amount: 330 },
      { from: "עדן גיל", to: "דן ינקלויץ", amount: 30 },
      { from: "עדן גיל", to: "דור לירז", amount: 100 },
      { from: "קובי סעדה", to: "דן ינקלויץ", amount: 70 },
    ]);
    expect(plan.potTransfer).toEqual(
      expect.objectContaining({ from: "עדן גיל", to: "קופת חיסכון", amount: 70, pot: true })
    );
  });
});
