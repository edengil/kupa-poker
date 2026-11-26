/* ============================================================================
   חלוקת התשלומים בסוף ערב — מנוע החלוקה (settle) ושכבת החמישיות סביבו.

   מה המנוע שבקובץ הזה עושה בעצמו:
     · הנטואים מעוגלים לשקלים שלמים בלבד, תוך שמירה על הסכום הכולל
       (roundPreservingSum). המנוע לא מעגל לחמישיות.
     · חוסר במנוע: הזוכים הלא־מועדפים נחתכים קודם, יחסית לגודל הזכייה;
       המועדפים (preferCreditors) נחתכים רק מהשארית.
     · התאמת ההעברות, בסדר: (1) כיסוי פנימי בין בני זוג; (2) נמנעי־מזומן
       (AVOID_CASH_PAY) → מקבלי ביט, לפני שאחרים מרוקנים אותם; (3) זוג
       ששניהם חייבים משלם יחד — למקבלי פייבוקס/מזומן קודם (הגדול קודם),
       אחר כך למקבלי ביט מהקטן לגדול; (4) שאר ההתאמות בשלוש דרגות
       (חייב רגיל ← נמנע־מזומן למקבל ביט ← נמנע־מזומן למקבל פייבוקס/מזומן).

   עיגול החמישיות (כלל ברזל 1) הוא שכבה סביב המנוע, לא המנוע עצמו:
     · roundNetTo5 (בקובץ הזה) מופעל ב־settleWithPot שב־lib/nightSettle.js
       על הנטואים לפני קריאת המנוע על השחקנים המותאמים: זוכה רגיל למטה,
       עדן/אורן זוכים למעלה; חייב רגיל למעלה, עדן/אורן חייבים למטה; אפס
       נשאר אפס.
     · בחוסר של שכבת החמישיות (shortfallCuts5, בקובץ הזה) עדן/אורן
       מוגנים: נחתכים רק מול החוסר האמיתי, מעוגל למטה לחמישייה; רק
       בפינת הנפילה המתועדת (הרגילים מיצו את תביעותיהם ועדיין חסר)
       הם סופגים אחרונים, ביחידות־5.
     · גם המסלול השמור/ידני עובר באותו מנוע חמישיות
       (lib/savedSettlement.js), חוץ ממצב מפת־חוסר שמורה: שם המנוע נקרא
       בלי סכום קופה והכיור הוא שחקן סינתטי רגיל.

   זוגות קבועים: הרשימה נגזרת מ־FILL_COUPLES שב־lib/poker/coupleFills.js
   (מקור האמת האחד) — עדן גיל ↔ אורן גיל · דור לירז ↔ עדן לירז ·
   שגיא גיל ↔ דוד בני גיל · אופיר סנה ↔ נתנאל כהן · איציק תפילין ↔
   ירדן תפילין. הם נסגרים קודם ביניהם, לפני שאר החלוקה.

   קופה ועודף:
     · רגל הקופה בתוכנית היא רק החלק הכפול־5 של הקופה (floor5;
       77.5 ← 75); השבר (<5) הוא חלק מהעודף השיורי של עדן. הקופה
       הרשומה היא תמיד הסכום המלא; ברירת המחדל 5% מהקניות חיה
       ב־lib/potReaders.js, לא במנוע. תשלומי הקופה מנותבים דרך עדן
       כשהוא בערב (routePotThroughEden).
     · עודף שיורי מזוכה לעדן גיל בשם בשלב 6 של settleWithPot
       ב־lib/nightSettle.js; המנוע כאן רק מחזיר את סכום העודף.
     · ערך ידני: תשלום יחיד מעוגל למעלה לכפולת־5 וההפרש לעודף
       (roundManualPaymentsUp5 ב־lib/savedSettlement.js); פיצול זוגי
       (fromSplit) לא מעוגל.

   מגבלות תשלום (כלל 11):
     · עדן/אורן מקבלים בפייבוקס או במזומן בלבד — לעולם לא בביט
       (CASH_ONLY).
     · נתנאל כהן לעולם לא משלם במזומן (AVOID_CASH_PAY): בערוץ הלא־ביט
       («פייבוקס או מזומן» משולב) הוא תמיד בצד הפייבוקס.

   פיצול העברה זוגית: יחסי בשקלים שלמים בכל המסלולים; ביחידות־5
   בשארית־גדולה רק במסלול הקופה האוטומטי (splitUnit5).
   ************************************************************************** */

import { CPS } from "./report";
import { FEMALE, canonName, isFemaleName } from "./gender.js";
import { FILL_COUPLES } from "./poker/coupleFills.js";
import type { Player, Transfer as CanonicalTransfer } from "./poker/entities.js";

export { FEMALE, canonName, isFemaleName };

/* גל 7 (7.4): כינויים לטיפוסים הקנוניים ב־lib/poker/entities.ts —
   Transfer הקנוני נושא גם את דגלי pot/residual/manual של תוכניות
   התשלומים השמורות, לא רק את דגלי החלוקה. */
export type SettlePlayer = Player;
export type Transfer = CanonicalTransfer;

export interface SettleResult {
  transfers: Transfer[];
  shortfall: number;
  surplus: number;
  unfinished: string[];
  nets: { name: string; net: number; raw: number }[];
}

export interface SettleOpts {
  /** זוכים שנשמר להם יותר כשיש חוסר (חותכים קודם מאחרים). */
  preferCreditors?: string[];
  /**
   * עיגול לחמישיות, שלב 2 (הכרעת עדן 19.11.2026): פיצול העברה זוגית
   * ביחידות־5 בשארית־גדולה במקום פיצול יחסי בשקלים שלמים. דלוק רק
   * במסלול הקופה האוטומטי (settleWithPot); כל שאר המסלולים (שמור, ידני,
   * טרום־קופה, לייב) ממשיכים בפיצול היחסי המדויק כמו תמיד.
   */
  splitUnit5?: boolean;
}

/* מי שמקבל רק פייבוקס או מזומן, ולא ביט (כלל 11, הכרעת עדן 25.11.2026:
   עדן ואורן מקבלים בפייבוקס או במזומן בלבד — לעולם לא ביט, ולכן גם לא
   נוצר להם קישור תשלום ביט בשום משטח) */
export const CASH_ONLY: string[] = ["עדן", "אורן", "עדן גיל", "אורן גיל"];

/* מי שלא משלם במזומן לעולם (כלל 11, הכרעת עדן 25.11.2026 — נתנאל כהן).
   הסמנטיקה המדויקת: הערוץ הלא־ביט בקוד הוא "פייבוקס או מזומן" משולב,
   ונתנאל משלם בו תמיד בצד הפייבוקס. לכן הניתוב מתאים אותו קודם למקבלי
   ביט (תשלום בביט), ורק כשלא נשאר מקבל ביט הוא משלם למקבל "פייבוקס או
   מזומן" — בפייבוקס. (הניסוח הישן "לא אוהב להעביר בפייבוקס" היה הפוך:
   המגבלה היא על מזומן, לא על פייבוקס.) */
export const AVOID_CASH_PAY: string[] = ["נתנאל", "נתנאל כהן"];

/* זוגות שמכסים אחד את השני ואחר כך יכולים לשלם יחד.
   מקור האמת האחד = FILL_COUPLES (הכרעת עדן, 25.10): כלל הכיסוי־קודם חל על
   כל הזוגות ברשימה המלאה; ההפרדה הישנה בין רשימת המילוי הזוגי לרשימת
   הכיסוי בחלוקה בוטלה. הוספת זוג = שורה אחת ב־lib/poker/coupleFills.js. */
export const COUPLES: [string, string][] = FILL_COUPLES.map(
  ([a, b]) => [a, b] as [string, string]
);

/** "מעביר" או "מעבירה" לפי השם */
export const transferVerb = (name: string): string => {
  const raw = String(name).trim();
  // העברה משותפת של זוג
  if (raw.includes(" ו")) {
    const parts = raw.split(/\s+ו/);
    const allFemale = parts.every((p) => isFemaleName(p.trim()));
    return allFemale ? "מעבירות" : "מעבירים";
  }
  return isFemaleName(raw) ? "מעבירה" : "מעביר";
};

const r0 = (v: number): number => Math.round(v);

const findByCoupleName = (names: string[], target: string): number => {
  const t = canonName(target);
  return names.findIndex((n) => canonName(n) === t);
};

/**
 * חלוקת סכום שלם בין משקלים באופן יחסי, בשקלים שלמים, תוך שמירת הסכום
 * הכולל — המימוש האחד של "חלוקת חוסר יחסית" לכל המסלולים (settle של
 * החלוקה, קיזוז חוסר־הג'יטונים בשמירת ערב). פעם היו שני מימושים לא
 * שקולים (ממצא ביקורת 7). מחזיר חיתוכים שסכומם בדיוק
 * min(totalCut, Σweights); כשהמשקלים שלמים, חיתוך לא עובר את משקלו.
 */
export function proportionalCuts(weights: number[], totalCut: number): number[] {
  const ws = weights.map((w) => Math.max(0, +w || 0));
  const total = ws.reduce((s, w) => s + w, 0);
  const take = Math.min(Math.max(0, Math.round(+totalCut || 0)), total);
  if (take <= 0 || total <= 0) return ws.map(() => 0);
  const shares = ws.map((w) => (w / total) * take);
  return roundPreservingSum(shares);
}

/** עיגול למטה/למעלה לכפולה של 5 (כלל החמישיות, הכרעת עדן 19.11.2026). */
export const floor5 = (v: number): number => Math.floor(v / 5) * 5;
export const ceil5 = (v: number): number => Math.ceil(v / 5) * 5;

/**
 * חלוקת סכום שהוא כפולה של 5 בין משקלים, ביחידות־5 בשארית־גדולה:
 * כל חלק הוא כפולה של 5, אף חלק לא עובר את התקרה שלו, והסכום הכולל
 * נשמר בדיוק (כשסך התקרות ≥ הסכום). המימוש האחד של "חלוקה יחסית
 * ביחידות־5" — פיצולי זוג בחלוקה, פיצולי החלפת־קופה בניתוב, וקיצוצי
 * החוסר במסלול הקופה האוטומטי.
 */
export function distribute5(total: number, weights: number[], caps: number[]): number[] {
  const out = weights.map(() => 0);
  if (!(total > 0) || !weights.length) return out;
  const ws = weights.map((w) => Math.max(0, +w || 0));
  const wsum = ws.reduce((s, w) => s + w, 0);
  if (wsum <= 0) return out;
  const exact = ws.map((w) => (total * w) / wsum);
  let assigned = 0;
  const rems = exact.map((x, i) => {
    out[i] = Math.min(caps[i], floor5(x));
    assigned += out[i];
    return { i, rem: x - floor5(x), w: ws[i] };
  });
  rems.sort((a, b) => b.rem - a.rem || b.w - a.w || a.i - b.i);
  let units = Math.round((total - assigned) / 5);
  while (units > 0) {
    let progressed = false;
    for (const { i } of rems) {
      if (units <= 0) break;
      if (out[i] + 5 <= caps[i]) {
        out[i] += 5;
        units--;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return out;
}

/* ============================================================================
   מנוע העיגול לחמישיות האחד (כלל ברזל 1; הכרעות עדן 19.11 + 25.11.2026) —
   משותף לכל מסלולי החלוקה: האוטומטי (settleWithPot ב־nightShare), השמור/
   הידני (savedSettlementWithPot), והעורך. פעם ההיגיון חי רק בתוך
   settleWithPot ב־nightShare והמסלול השמור לא עיגל כלל — שורש באג 22.11.
   ========================================================================== */

/**
 * עיגול נטו שלם אחד לחמישיות: זוכה רגיל — למטה (122←120); זוכה מועדף
 * (עדן/אורן) — למעלה (13←15); חייב רגיל — החוב למעלה (137←140, ההפרש
 * לעודף); חייב מועדף — החוב למטה (13←10). אפס נשאר אפס; הסימן לא מתהפך.
 */
export function roundNetTo5(net: number, priv: boolean): number {
  if (net > 0) return priv ? ceil5(net) : floor5(net);
  if (net < 0) return priv ? -floor5(-net) : -ceil5(-net);
  return 0;
}

/**
 * קיצוץ חוסר־מימון בחמישיות (הקצאה משותפת P1): החלוקה היחסית נשארת, אבל
 * כל קיצוץ הוא כפולה של 5.
 * 1. מועדפים (עדן/אורן) נחתכים רק מול החוסר האמיתי trueGap: חלק יחסי
 *    מדויק, מעוגל למטה לחמישייה. משבר־הקופה ומשאריות העיגול הם פטורים.
 * 2. היתרה לזוכים הרגילים ביחידות־5 (distribute5), בקבוצות ההעדפה של
 *    settle: לא־מועדפים קודם, מועדפים (preferSet) אחרונים.
 * 3. פינת נפילה מתועדת (הכרעת 19.11, לא הורחבה): אם הרגילים מיצו את
 *    תביעותיהם ועדיין חסר קיצוץ — המועדפים סופגים אחרונים, ביחידות־5.
 * @returns {Map<string, number>} שם זוכה → סכום הקיצוץ
 */
export function shortfallCuts5(
  winners: { name: string; claim: number; priv: boolean }[],
  totalCut: number,
  preferSet: Set<string>,
  trueGap: number
): Map<string, number> {
  const cuts = new Map(winners.map((w) => [w.name, 0]));
  if (totalCut <= 0 || !winners.length) return cuts;
  const totalClaims = winners.reduce((s, w) => s + w.claim, 0);
  if (totalClaims <= 0) return cuts;

  let privSum = 0;
  for (const w of winners) {
    if (!w.priv) continue;
    const share = trueGap > 0 ? (trueGap * w.claim) / totalClaims : 0;
    const c = Math.min(w.claim, Math.max(0, floor5(share)));
    cuts.set(w.name, c);
    privSum += c;
  }

  let remaining = totalCut - privSum;
  const nonPref = winners.filter((w) => !w.priv && !preferSet.has(canonName(w.name)));
  const pref = winners.filter((w) => !w.priv && preferSet.has(canonName(w.name)));
  const groups: (typeof winners)[] = [];
  if (nonPref.length) groups.push(nonPref);
  if (pref.length) groups.push(pref);
  for (const group of groups) {
    if (remaining <= 0) break;
    const gClaims = group.reduce((s, w) => s + w.claim, 0);
    if (gClaims <= 0) continue;
    const take = Math.min(remaining, gClaims);
    const dist = distribute5(take, group.map((w) => w.claim), group.map((w) => w.claim));
    group.forEach((w, i) => cuts.set(w.name, dist[i]));
    remaining -= dist.reduce((s, v) => s + v, 0);
  }

  if (remaining > 0) {
    const privs = winners.filter((w) => w.priv);
    const room = privs.map((w) => w.claim - (cuts.get(w.name) || 0));
    const extra = distribute5(remaining, room, room);
    privs.forEach((w, i) => cuts.set(w.name, (cuts.get(w.name) || 0) + extra[i]));
  }
  return cuts;
}

/** עיגול ערך ידני לא־כפול־5 למעלה לכפולת־5 הבאה (הכרעת עדן 25.11, §8). */
export function ceilTo5(v: number): number {
  return ceil5(Math.round(+v || 0));
}

function roundPreservingSum(values: number[]): number[] {
  const floors = values.map(Math.floor);
  const target = r0(values.reduce((s, v) => s + v, 0));
  let drift = target - floors.reduce((s, v) => s + v, 0);
  const order = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; drift > 0 && k < order.length; k++, drift--) out[order[k].i] += 1;
  return out;
}

/** האם מקבל התשלום מוגבל לפייבוקס או מזומן */
export function isCashOnly(name: string): boolean {
  const n = String(name).trim();
  return CASH_ONLY.includes(n) || CASH_ONLY.includes(canonName(n));
}

function avoidsCashPay(name: string): boolean {
  const n = String(name).trim();
  return AVOID_CASH_PAY.includes(n) || AVOID_CASH_PAY.includes(canonName(n));
}

/**
 * נטו מעוגל לשקלים שלמים לכל שחקן, בלי שום חלוקת חוסר/עודף —
 * הבסיס הגולמי שממנו נגזרות כל החלוקות (קופה, ידני, אוטומטי).
 */
export function roundedNets(
  players: SettlePlayer[] = [],
  cps: number = CPS
): { name: string; net: number; raw: number }[] {
  const exact = players.map((p) => (+p.cashout! || 0) / cps - (+p.buyin! || 0));
  const nets = roundPreservingSum(exact);
  return players.map((p, i) => ({ name: p.name, net: nets[i], raw: exact[i] }));
}

export function settle(players: SettlePlayer[] = [], cps: number = CPS, opts: SettleOpts = {}): SettleResult {
  const unfinished = players.filter((p) => p.cashout === "" || p.cashout == null).map((p) => p.name);

  const names = players.map((p) => p.name);
  const exact = players.map((p) => (+p.cashout! || 0) / cps - (+p.buyin! || 0));
  const nets = roundPreservingSum(exact);

  const total = nets.reduce((s, v) => s + v, 0);
  const shortfall = total > 0 ? total : 0;
  const surplus = total < 0 ? -total : 0;

  const adjusted = [...nets];
  if (shortfall > 0) {
    const preferSet = new Set(
      (opts.preferCreditors || []).map((n) => canonName(n)).filter(Boolean)
    );
    const winners = adjusted.map((v, i) => ({ i, v })).filter((x) => x.v > 0);
    const others = winners.filter((x) => !preferSet.has(canonName(names[x.i])));
    const preferred = winners.filter((x) => preferSet.has(canonName(names[x.i])));

    const cutGroup = (group: { i: number; v: number }[], amount: number): number => {
      if (amount <= 0 || !group.length) return amount;
      const totalWins = group.reduce((s, x) => s + Math.max(0, adjusted[x.i]), 0);
      if (totalWins <= 0) return amount;
      const take = Math.min(amount, totalWins);
      const cuts = proportionalCuts(group.map((x) => Math.max(0, adjusted[x.i])), take);
      group.forEach((x, k) => {
        adjusted[x.i] -= cuts[k];
      });
      return amount - take;
    };

    let left = shortfall;
    left = cutGroup(others.length ? others : winners, left);
    if (left > 0 && preferred.length) cutGroup(preferred, left);
  }

  const bal = [...adjusted];
  const transfers: Transfer[] = [];
  const move = (from: number, to: number, amount: number, extra: Partial<Transfer> = {}) => {
    if (amount <= 0) return;
    transfers.push({ from: names[from], to: names[to], amount, ...extra });
    bal[from] += amount;
    bal[to] -= amount;
  };

  const moveJoint = (i: number, j: number, to: number, amount: number) => {
    if (amount <= 0) return;
    const debtI = bal[i] < 0 ? -bal[i] : 0;
    const debtJ = bal[j] < 0 ? -bal[j] : 0;
    const combined = debtI + debtJ;
    if (combined <= 0) return;
    // חלוקה יחסית — כדי ששניהם יישארו במשחק וימשיכו לשלם יחד למרוויחים הבאים.
    // במצב splitUnit5 (מסלול הקופה האוטומטי בלבד) הפיצול הוא ביחידות־5
    // בשארית־גדולה, כדי שגם חלקי הפיצול וגם יתרות ההמשך יישארו כפולות־5.
    let takeI = opts.splitUnit5
      ? distribute5(amount, [debtI, debtJ], [debtI, debtJ])[0]
      : Math.round((amount * debtI) / combined);
    takeI = Math.max(0, Math.min(debtI, takeI, amount));
    let takeJ = amount - takeI;
    if (takeJ > debtJ) {
      takeJ = debtJ;
      takeI = amount - takeJ;
    }
    if (takeI > debtI) {
      takeI = debtI;
      takeJ = amount - takeI;
    }
    bal[i] += takeI;
    bal[j] += takeJ;
    bal[to] -= amount;
    transfers.push({
      from: `${names[i]} ו${names[j]}`,
      to: names[to],
      amount,
      joint: true,
      // פיצול פנימי לוולידציה — לא חלק מה-fingerprint
      fromSplit: { [names[i]]: takeI, [names[j]]: takeJ },
    });
  };

  // 1) כיסוי פנימי בין בני זוג
  for (const [a, b] of COUPLES) {
    const i = findByCoupleName(names, a);
    const j = findByCoupleName(names, b);
    if (i < 0 || j < 0) continue;
    if (bal[i] < 0 && bal[j] > 0) move(i, j, Math.min(-bal[i], bal[j]), { pair: true });
    else if (bal[j] < 0 && bal[i] > 0) move(j, i, Math.min(-bal[j], bal[i]), { pair: true });
  }

  // 2) נתנאל (וכל מי ב-AVOID_CASH_PAY) → מקבלי ביט קודם, לפני שזוגות/אחרים מרוקנים אותם
  for (;;) {
    let bestL = -1;
    let bestW = -1;
    let bestAmt = 0;
    for (let l = 0; l < bal.length; l++) {
      if (bal[l] >= 0 || !avoidsCashPay(names[l])) continue;
      for (let w = 0; w < bal.length; w++) {
        if (bal[w] <= 0 || isCashOnly(names[w])) continue;
        const amt = Math.min(-bal[l], bal[w]);
        if (
          amt > bestAmt ||
          bestL === -1 ||
          (amt === bestAmt && bal[l] < bal[bestL]) ||
          (amt === bestAmt && bal[l] === bal[bestL] && bal[w] > bal[bestW])
        ) {
          bestAmt = amt;
          bestL = l;
          bestW = w;
        }
      }
    }
    if (bestL === -1) break;
    move(bestL, bestW, Math.min(-bal[bestL], bal[bestW]));
  }

  // 3) זוג ששניהם עדיין חייבים — משלמים יחד למרוויחים (פייבוקס קודם → נשאר ביט לאחרים)
  for (const [a, b] of COUPLES) {
    const i = findByCoupleName(names, a);
    const j = findByCoupleName(names, b);
    if (i < 0 || j < 0) continue;
    for (;;) {
      const debtI = bal[i] < 0 ? -bal[i] : 0;
      const debtJ = bal[j] < 0 ? -bal[j] : 0;
      if (debtI <= 0 || debtJ <= 0) break;
      const combined = debtI + debtJ;
      // פייבוקס/מזומן קודם (הסכום הגדול), אחר כך ביט מהקטן לגדול (אופיר לפני דן)
      let winnerCash = -1;
      let winnerBit = -1;
      bal.forEach((v, k) => {
        if (v <= 0 || k === i || k === j) return;
        if (isCashOnly(names[k])) {
          if (winnerCash === -1 || v > bal[winnerCash]) winnerCash = k;
        } else if (winnerBit === -1 || v < bal[winnerBit]) {
          winnerBit = k;
        }
      });
      const w = winnerCash !== -1 ? winnerCash : winnerBit;
      if (w === -1) break;
      moveJoint(i, j, w, Math.min(combined, bal[w]));
    }
  }

  // 4) שאר ההעברות — נתנאל לפייבוקס רק אם לא נשאר מקבל ביט
  const findBestPair = (): [number, number] | null => {
    const losers: number[] = [];
    const winners: number[] = [];
    bal.forEach((v, i) => {
      if (v < 0) losers.push(i);
      if (v > 0) winners.push(i);
    });
    if (!losers.length || !winners.length) return null;

    const tiers: ((l: number, w: number) => boolean)[] = [
      (l, w) => !avoidsCashPay(names[l]),
      (l, w) => avoidsCashPay(names[l]) && !isCashOnly(names[w]),
      (l, w) => avoidsCashPay(names[l]) && isCashOnly(names[w]),
    ];

    for (const ok of tiers) {
      let bestL = -1;
      let bestW = -1;
      let bestAmt = 0;
      for (const l of losers) {
        for (const w of winners) {
          if (!ok(l, w)) continue;
          const amt = Math.min(-bal[l], bal[w]);
          if (
            amt > bestAmt ||
            (amt === bestAmt && bestL !== -1 && bal[l] < bal[bestL]) ||
            (amt === bestAmt && bestL === -1)
          ) {
            // מעדיפים מפסיד גדול יותר (יותר שלילי) ואז מרוויח גדול
            if (amt > bestAmt || bestL === -1 || bal[l] < bal[bestL] || (bal[l] === bal[bestL] && bal[w] > bal[bestW])) {
              bestAmt = amt;
              bestL = l;
              bestW = w;
            }
          }
        }
      }
      if (bestL !== -1) return [bestL, bestW];
    }
    return null;
  };

  for (;;) {
    const pair = findBestPair();
    if (!pair) break;
    const [loser, winner] = pair;
    move(loser, winner, Math.min(-bal[loser], bal[winner]));
  }

  return {
    transfers,
    shortfall,
    surplus,
    unfinished,
    nets: names.map((n, i) => ({ name: n, net: adjusted[i], raw: nets[i] })),
  };
}
