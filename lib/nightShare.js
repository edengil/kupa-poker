/* ============================================================================
   עזרי שיתוף / חלוקה לערב שמור — מחושבים תמיד מחדש (לא נשמרים ב־DB).
   משותפים לטאב ערבים, טאב טבלה, לייב, ובוט הוואטסאפ.
   ============================================================================ */

import { CPS, buildSettlement, netOf, nightDateParts } from "./report";
import { settle, roundedNets, isCashOnly, transferVerb, isFemaleName, distribute5, floor5, ceil5, roundNetTo5, shortfallCuts5, canonName } from "./settlement";
import { toWhatsApp, canon, DEFAULT_ALIASES, r2 } from "./poker/helpers.js";
import {
  tipRankPlaces,
  formatFirstPlaceLine,
  formatLowestTipperLine,
  formatNonTipperLine,
  formatWinnerTitleLine,
  formatLoserTitleLine,
  formatTechnicalWinLine,
  formatTouristLine,
} from "./tipSummaryCopy.js";
import { withBotMark } from "./botMark";
import { savedSettlement, settlementBasis } from "./savedSettlement";
import { routePotThroughEden, POT_SINK_NAME, RESIDUAL_SINK_NAME } from "./manualSettlement";
/* קוראי־הקופה הטהורים חיים ב־lib/potReaders.js (גל B, מנה 5.1 — מיצוי־בלבד).
   מיובאים כאן לשימוש פנימי ומיוצאים הלאה, כך שאף יבואן לא השתנה. */
import { sessionHasBuyinChips, sessionHasPot, potPlanFor } from "./potReaders";
export { sessionHasBuyinChips, sessionHasPot, potRecordedFor, potActualFor, potPlanFor, computedPot } from "./potReaders";
/* בניית שחקני הערב חיה ב־lib/nightPlayers.js (גל B, מנה 5.2 — מיצוי־בלבד).
   מיובאים כאן לשימוש פנימי ומיוצאים הלאה, כך שאף יבואן לא השתנה.
   EDEN_CANON מיובא לשימוש פנימי בלבד (isPrivilegedName / settleWithPot) —
   הוא לא היה ולא נהיה export של nightShare. */
import { playersFromSession, playersWithPot, edenNameIn, EDEN_CANON } from "./nightPlayers";
export { playersFromSession, playersWithPot, edenNameIn } from "./nightPlayers";
/* סימוני תשלום ותוכנית שמורה חיים ב־lib/nightPlan.js (גל B, מנה 5.3 —
   מיצוי־בלבד). מיובאים כאן לשימוש פנימי (settlementTextForSession)
   ומיוצאים הלאה, כך שאף יבואן לא השתנה. */
import { hasPaymentMarks, storedPlanTransfersList } from "./nightPlan";
export { hasPaymentMarks, storedPlanTransfersList, autoShortfallMapForPot, freezeShortfallMapFor } from "./nightPlan";
/* פער הערב חי ב־lib/nightGap.js (גל B, מנה 5.4 — מיצוי־בלבד).
   מיוצא הלאה, כך שאף יבואן לא השתנה. אין שימוש פנימי בו במודול זה. */
export { nightGap } from "./nightGap";

/* ============================================================================
   מודל הקופה (הכרעת עדן, 25.10.2026) — מחליף את מודל 10.11:
   • הקופה היא ה־5% המתועד בשדה session.savingsPot ("רשום") — תמיד מלאה,
     ולעולם לא נגזרת מפער הערב ולא נחתכת בגללו. בתוכנית החלוקה עצמה
     ההעברה לקופה היא ה"בפועל" אם נערך (R3, potPlanFor) — הרשום נשאר
     הסכום הרשמי בפנקס, והבפועל הוא מה שמועבר בפועל בתוכנית.
   • "בפועל" (session.savingsPotActual) = כמה נשמר במזומן בפועל; ניתן לעריכה,
     ברירת מחדל = הרשום. יתרת המזומן הראשית עוקבת אחרי ה"בפועל".
   • פער הערב (סכום הנטו) הוא שורה נפרדת בשמו — לא קופה ולא חלק ממנה.
   • חלוקת ההעברות חייבת לממן: זוכים (אחרי חלוקת חוסר) + קופה מלאה, מתוך
     תשלומי החייבים המלאים. חוסר מימון = (זכיות + קופה) − חובות, ומתחלק
     בין המרוויחים ביחס לרווחים, בשקלים שלמים — לעולם לא מהקופה.
   • עודף מעבר לקופה (הכרעת עדן 19.11.2026 — מחליפה את כיור "עודף ערב"
     הניטרלי של 25.10, וחוזרת לכלל 2026-10-11): העודף מזוכה לעדן גיל על
     שמו בחישוב החלוקה — חייבים אחרים מעבירים את שאריתם אליו (שורות
     residual פנימיות), ושארית חובו שלו נספגת ומקטינה את חובו הצפוי.
     הנטו הגולמי (raw) והסטטיסטיקה לא משתנים; הזיכוי הוא רק בחישוב
     ההעברות והיתרות הצפויות. כשעדן לא בערב — אין שורת שחקן לזכות,
     ונשאר כיור "עודף ערב" כמקודם.
   • עיגול לחמישיות (הכרעת עדן 19.11.2026, שלב 2 — רק במסלול האוטומטי
     של עידן־הקופה, בתוך settleWithPot): כל העברה בין אנשים היא כפולה
     של 5. העיגול הוא ברמת הנטו לפני ההקצאה: זוכה רגיל למטה, עדן גיל /
     אורן גיל זוכים למעלה, חייב רגיל למעלה (ההפרש לעודף), עדן/אורן
     חייבים למטה. רגל הקופה נשארת מדויקת: החלק הלא־כפול־5 שלה משולם
     ישירות על ידי נושא אחד (עדן קודם כשהוא חייב), ושברו (<5) נספג —
     בחוסר על ידי הזוכים הרגילים דרך הקיצוץ, ובעודף כהפחתת הזיכוי של
     עדן (פינת נפילה). קיצוץ החוסר האמיתי נשאר יחסי בין הזוכים, אבל
     מקוונטט לחמישיות: חלקם של עדן/אורן מעוגל למטה והיתרה עוברת
     לזוכים הרגילים; עדן/אורן לעולם לא סופגים את שברי המכניקה.
     ערבים שמורים/ידניים וערבי טרום־קופה לא עוברים עיגול לעולם.
   ========================================================================== */

/** שמות הכיורים הפנימיים — מוגדרים ב־manualSettlement ומיוצאים כאן הלאה. */
export { POT_SINK_NAME, RESIDUAL_SINK_NAME } from "./manualSettlement";

const OREN_CANON = "אורן גיל";
/** מועדפים בעיגול לחמישיות: עדן גיל ואורן גיל (הכרעת עדן 19.11). */
const isPrivilegedName = (name) =>
  canon(name, DEFAULT_ALIASES) === EDEN_CANON || canon(name, DEFAULT_ALIASES) === OREN_CANON;

/**
 * עיגול נטו שלם אחד לחמישיות, לפי הכרעת עדן (19.11, שלב 2):
 * זוכה רגיל — למטה (122←120); זוכה עדן/אורן — למעלה (13←15);
 * חייב רגיל — החוב למעלה (137←140, ההפרש לעודף); חייב עדן/אורן —
 * החוב למטה (13←10). אפס נשאר אפס; הסימן לעולם לא מתהפך.
 */
/* roundNetTo5 + shortfallCuts5 חיים עכשיו במנוע האחד ב־lib/settlement.ts
   (מיובאים למעלה) — אותו מימוש משרת גם את המסלול השמור/ידני. */

/**
 * קיצוץ חוסר־מימון בחמישיות (הקצאה משותפת P1): החלוקה היחסית הקיימת
 * בין הזוכים נשארת, אבל כל קיצוץ הוא כפולה של 5. הקיצוץ הכולל הוא
 * ‏K = ‏G + ‏F (חוסר אמיתי G + שבר־מימון הקופה F), והחלוקה:
 * 1. עדן/אורן נחתכים **רק מול החוסר האמיתי G**: חלק יחסי מדויק ב־G,
 *    מעוגל למטה לחמישייה. מהשבר F ומשאריות העיגול של עצמם הם פטורים
 *    לגמרי — לעולם לא סופגים אותם (הכרעת עדן 19.11).
 * 2. היתרה (K פחות קיצוצי המועדפים) עוברת לזוכים הרגילים ביחידות־5
 *    (distribute5, יחסי לתביעות, עם תקרות). קבוצות ההעדפה נשמרות כמו
 *    ב־settle: לא־מועדפים נחתכים קודם, מועדפים אחרונים.
 * 3. פינת נפילה: אם הזוכים הרגילים מיצו את מלוא תביעותיהם ועדיין חסר
 *    קיצוץ — המועדפים סופגים אחרונים, ביחידות־5. רק שם מותר למועדף
 *    להיחתך מעל floor5(חלקו ב־G).
 * סך הקיצוצים הוא בדיוק K (עד כדי סך התביעות).
 * @returns {Map<string, number>} שם זוכה → סכום הקיצוץ
 */
/* shortfallCuts5 — במנוע האחד ב־lib/settlement.ts (מיובא למעלה).
   ה־preferSet נבנה מעכשיו בשמות קנוניים של settlement (canonName). */

/**
 * חלוקה עם קופה — המסלול האוטומטי של עידן־הקופה, עם עיגול לחמישיות
 * (הכרעת עדן 19.11, שלבים 1+2). האלגוריתם:
 * 1. נטו גולמי מעוגל לשקלים (roundedNets) — נשמר ל־raw/סטטיסטיקה.
 * 2. עיגול הנטו לחמישיות לפי הכלל (roundNetTo5) — התביעות והחובות
 *    שעליהם נבנית ההקצאה.
 * 3. מימון הקופה: הקופה מדויקת תמיד. חלקה הכפול־5 (floor5) הוא כיור
 *    בתוך settle כמקודם ומנותב דרך עדן; השארית r‏ (<5) משולמת ישירות
 *    על ידי נושא אחד — עדן קודם כשהוא חייב, אחרת החייבים הגדולים לפי
 *    הסדר. נושא חלקי משאיר שבר f‏ (<5): חובו להקצאה קטן ב־f, והשבר
 *    נספג — בחוסר על ידי הזוכים הרגילים (הקיצוץ גדל ב־f), ובעודף
 *    כהפחתה מזיכוי העודף של עדן (פינת נפילה).
 * 4. חוסר מימון G = תביעות + קופה − חובות (על הנטו המעוגל). הקיצוץ
 *    הכולל K = ‏G + ‏F הוא תמיד כפולה של 5, ומחולק ב־shortfallCuts5:
 *    עדן/אורן נחתכים רק מול G (השבר F נושב כולו על הזוכים הרגילים).
 * 5. ההקצאה עצמה היא settle על השחקנים המותאמים (תביעות אחרי קיצוץ,
 *    חובות אחרי שברי־מימון, כיור floor5(קופה)) עם פיצולי זוג
 *    ביחידות־5 — לכן כל העברה בין אנשים יוצאת כפולה של 5 מעצמה.
 * 6. עודף: שאריות החייבים מול ההתחייבות המותאמת מזוכות לעדן (שלב 1) —
 *    שורות residual כפולות־5, שאריתו של עדן נספגת בצפוי שלו.
 * ההעברות לכיור מסומנות pot:true ולא מוצגות בקבוצה.
 */
export function settleWithPot(players, cps, potAmount, opts = {}) {
  /* הכרעת עדן 25.11.2026 (§8, גוברת על §2.2/P1): אין Math.round על הקופה.
     רגל הקופה בתוכנית = floor5(הקופה) בלבד (77.5←75, 93←90); ההפרש
     (potFraction, <5) מזוכה לעדן כעודף שיורי נסתר — הוא יוצא מאליו
     בסך שורות ה־residual, כי החייבים משלמים מול הקופה המלאה בחישוב
     החוסר אבל הרגל המועברת היא המעוגלת. הפנקס (potRecordedFor /
     potOverview) ממשיך לרשום את הסכום המלא. */
  const pot = Math.max(0, r2(+potAmount || 0));
  const rn = roundedNets(players, cps);
  const edenPlayer = players.find((p) => canon(p.name, DEFAULT_ALIASES) === EDEN_CANON) || null;

  // (2) עיגול הנטו לחמישיות
  const rounded = rn.map((row) => ({
    name: row.name,
    net: roundNetTo5(row.net, isPrivilegedName(row.name)),
  }));
  const winners = rounded
    .filter((r) => r.net > 0)
    .map((r) => ({ name: r.name, claim: r.net, priv: isPrivilegedName(r.name) }));
  const debtors = rounded.filter((r) => r.net < 0).map((r) => ({ name: r.name, debt: -r.net }));
  const sumClaims = winners.reduce((s, w) => s + w.claim, 0);
  const sumDebts = debtors.reduce((s, d) => s + d.debt, 0);

  // (3) מימון הקופה (§8): רק החלק הכפול־5 של הקופה הוא כיור בתוך settle;
  // השבר potFraction אינו משולם לאף אחד כהעברה — הוא חלק מהעודף לעדן.
  const potInSettle = floor5(pot);
  const potFraction = r2(pot - potInSettle);
  const directOf = new Map();
  const settleDebtOf = new Map(debtors.map((d) => [d.name, d.debt]));

  // (4) חוסר מימון וקיצוץ בחמישיות: החוסר מחושב מול הקופה המלאה, והקיצוץ
  // הכולל מעוגל למעלה לחמישייה — כך שגם בחוסר, סך התשלומים משאיר שארית
  // כפולת־5 שהיא העודף הנסתר של עדן (כולל שבר הקופה). מועדפים נחתכים רק
  // מול החוסר האמיתי gap (בלי שבר הקופה), כמו תמיד.
  const gap = r2(sumClaims + pot - sumDebts);
  const totalCutNeeded = gap > 0 ? ceil5(gap) : gap;
  const preferSet = new Set(
    (opts.preferCreditors || []).map((n) => canonName(n)).filter(Boolean)
  );
  const cuts = totalCutNeeded > 0 ? shortfallCuts5(winners, totalCutNeeded, preferSet, gap) : new Map();
  const finalClaimOf = new Map(winners.map((w) => [w.name, w.claim - (cuts.get(w.name) || 0)]));

  // (5) ההקצאה: settle על שחקנים מותאמים + כיור הקופה (החלק הכפול־5)
  const adjPlayers = rounded.map((r) => {
    if (r.net > 0) return { name: r.name, buyin: 0, cashout: String((finalClaimOf.get(r.name) || 0) * cps) };
    if (r.net < 0) return { name: r.name, buyin: settleDebtOf.get(r.name) || 0, cashout: "0" };
    return { name: r.name, buyin: 0, cashout: "0" };
  });
  const withSink = [
    ...adjPlayers,
    { name: POT_SINK_NAME, buyin: 0, cashout: String(potInSettle * cps) },
  ];
  const res = settle(withSink, cps, {
    ...opts,
    preferCreditors: [POT_SINK_NAME, ...(opts.preferCreditors || [])],
    splitUnit5: true,
  });
  let allTransfers = res.transfers;
  // הקופה חובת הפקדה של עדן — מנתבים את תשלומי הקופה דרכו (הכרעת 25.10).
  if (edenPlayer && potInSettle > 0) {
    allTransfers = routePotThroughEden(allTransfers, edenPlayer.name, POT_SINK_NAME, { splitUnit5: true }).transfers;
  }
  const potTransfers = allTransfers
    .filter((t) => t.to === POT_SINK_NAME)
    .map((t) => (t.pot ? t : { ...t, pot: true }));
  const playerTransfers = allTransfers.filter((t) => t.to !== POT_SINK_NAME);

  // (6) עודף מעבר לקופה — מול ההתחייבות המותאמת של כל חייב
  const obligationOf = new Map();
  for (const r of rounded) {
    if (r.net > 0) obligationOf.set(r.name, finalClaimOf.get(r.name) || 0);
    else if (r.net < 0) obligationOf.set(r.name, -((settleDebtOf.get(r.name) || 0) + (directOf.get(r.name) || 0)));
    else obligationOf.set(r.name, 0);
  }
  const paidOut = Object.create(null);
  for (const t of allTransfers) {
    if (t.fromSplit) {
      for (const [n, a] of Object.entries(t.fromSplit)) paidOut[n] = (paidOut[n] || 0) + a;
    } else {
      paidOut[t.from] = (paidOut[t.from] || 0) + t.amount;
    }
  }
  const residualTransfers = [];
  let residual = 0;
  for (const r of rounded) {
    if (r.net >= 0) continue;
    const leftover = -(obligationOf.get(r.name) || 0) - (paidOut[r.name] || 0);
    if (leftover > 0) {
      residual += leftover;
      // שארית של עדן עצמו נספגת — אין העברה עצמית; היא נספרת בסך העודף
      // ומקטינה את חובו הצפוי למטה. שארית של חייב אחר היא העברה אליו.
      if (!edenPlayer || r.name !== edenPlayer.name) {
        residualTransfers.push({
          from: r.name,
          to: edenPlayer ? edenPlayer.name : RESIDUAL_SINK_NAME,
          amount: leftover,
          residual: true,
        });
      }
    }
  }
  // היתרות הצפויות הן ההתחייבות המותאמת — הניתוב דרך עדן לא משנה סכומים
  // כוללים לאף שחקן, רק את יעדי התשלום שלו עצמו. בזיכוי העודף, שורת
  // הצפוי של עדן גדלה במלוא העודף (שורות מאחרים + שאריתו שנספגה);
  // ה־raw בכל שורה הוא הנטו הגולמי, שלא זז.
  // ה־raw הוא הנטו הגולמי המעוגל לשקלים שלמים (לפני עיגול החמישיות
  // והקיצוץ) — אותה סמנטיקה שהייתה לשורות ה־nets של settle תמיד.
  const nets = rn.map((row) => ({ name: row.name, net: obligationOf.get(row.name) || 0, raw: row.net }));
  const expected = nets.map((n) => ({ ...n }));
  if (residual > 0 && edenPlayer) {
    const edenRow = expected.find((n) => n.name === edenPlayer.name);
    if (edenRow) edenRow.net += residual;
  }
  const potFunded = potTransfers.reduce((s, t) => s + t.amount, 0);
  if (pot > 0) expected.push({ name: POT_SINK_NAME, net: potFunded });
  if (residual > 0 && !edenPlayer) expected.push({ name: RESIDUAL_SINK_NAME, net: residual });
  return {
    transfers: [...playerTransfers, ...potTransfers, ...residualTransfers],
    playerTransfers,
    potTransfers,
    residualTransfers,
    shortfall: Math.max(0, gap),
    // סך העודף האמיתי של הערב — שאריות ההקצאה כבר כוללות את שבר הקופה
    // (§8): החייבים מימנו מול הקופה המלאה והרגל שהועברה היא floor5 בלבד.
    surplus: residual,
    // שבר הקופה (pot − floor5(pot)) — מזוכה לעדן בתוך ה־residual, נסתר מהשחקנים.
    potFraction,
    nets,
    expected,
    potFunded,
  };
}

/**
 * השחקנים שעליהם נבנית החלוקה: אם קיימת חלוקה ידנית שנשמרה על הבסיס
 * הישן (מותאם־עדן) — מחזירים את השחקנים הישנים כדי שה־basis יתאים והערב
 * הסגור לא ישתנה. בכל מקרה אחר — השחקנים הגולמיים.
 */
export function settlementPlayersFor(session) {
  const raw = playersFromSession(session);
  const ms = session?.manualSettlement;
  if (!ms?.basis) return raw;
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  if (ms.basis === settlementBasis(raw, cps)) return raw;
  const legacy = playersWithPot(session);
  if (ms.basis === settlementBasis(legacy, cps)) return legacy;
  return raw;
}

/** האם החלוקה הידנית של הערב נשמרה על הבסיס הישן (לפני מודל 25.10). */
export function isLegacySettlement(session) {
  const ms = session?.manualSettlement;
  if (!ms?.basis) return false;
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const raw = playersFromSession(session);
  if (ms.basis === settlementBasis(raw, cps)) return false;
  return ms.basis === settlementBasis(playersWithPot(session), cps);
}

/**
 * פותר החלוקה האחד של ערב שמור — כל המשטחים (דשבורד, מעקב תשלומים,
 * טקסט שיתוף, עורך ידני) עוברים דרכו כדי שלא יתפצלו שוב.
 * מחזיר { mode, cps, pot, transfers, expected, shortfall, saved? , result? }
 */
export function resolveSettlement(session) {
  /* הערה (הקפאת B1): resolveSettlement נשאר מחשבון טהור. ההקפאה של ערבים
     מסומנים חיה בשכבת הגשת התוכנית — paymentPlan ב־paymentTracking.js
     (שם חיים הסימונים, ודרכו עוברים כל משטחי התוכנית: כרטיס החלוקה,
     אישורים, תזכורות, סגירה) + טקסט השיתוף למטה. שם, ערב עם סימון כלשהו
     מוגש מהתוכנית השמורה כמות שהיא ולעולם לא מחושב מחדש. */
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const raw = playersFromSession(session);
  // סכום הקופה בתוכנית = "בפועל" אם נערך, אחרת הרשום (R3). הפנקס קורא את
  // השדות ישירות (potOverview) ולא מושפע מהבחירה כאן.
  const pot = potPlanFor(session);
  const ms = session?.manualSettlement;
  if (ms) {
    if (isLegacySettlement(session)) {
      const legacy = playersWithPot(session);
      const saved = savedSettlement(legacy, cps, ms, { allowResidual: false });
      return { mode: "legacy", cps, pot, transfers: saved.transfers, expected: saved.opening, shortfall: saved.shortfall || 0, saved, manualError: saved.manualError || null };
    }
    const saved = savedSettlement(raw, cps, ms, {
      potAmount: pot,
      potSinkName: POT_SINK_NAME,
      edenName: edenNameIn(session),
      allowResidual: sessionHasPot(session),
    });
    return { mode: "manual", cps, pot, transfers: saved.transfers, expected: saved.opening, shortfall: saved.shortfall || 0, saved, manualError: saved.manualError || null };
  }
  // בלי חלוקה שמורה: ערבים מעידן הקופה (10.10+) עוברים דרך מודל הקופה —
  // הקופה (אם נרשמה) כיור נפרד, ועודף מעבר לה מזוכה לעדן בחישוב החלוקה
  // (הכרעת 19.11; הנטו הגולמי שלו לא משתנה). ערבים קודמים נשארים בדיוק
  // כמו שנסגרו.
  if (!sessionHasPot(session)) {
    const s = settle(raw, cps);
    return { mode: "plain", cps, pot: 0, transfers: s.transfers, expected: s.nets, shortfall: s.shortfall, result: s };
  }
  const r = settleWithPot(raw, cps, pot);
  return {
    mode: pot > 0 ? "pot" : "plain",
    cps,
    pot,
    transfers: r.transfers,
    expected: r.expected,
    shortfall: r.shortfall,
    result: r,
  };
}

/**
 * טקסט חלוקה (מי מעביר למי) — אותו פורמט כמו ShareSheet «חלוקה».
 * ההעברות הפנימיות לקופה/לעודף מסוננות החוצה — הקבוצה רואה רק שחקנים.
 * @returns {string} ריק אם אין שחקנים / לא ניתן לחשב
 */
export function settlementTextForSession(session, opts = {}) {
  /* שער כלל 3 (25.11.2026): טקסט החלוקה (וואטסאפ/שיתוף) מופק רק לערב
     שהמנהל אישר לצפייה — אלא אם הקורא הוא המנהל עצמו (manager:true,
     תצוגה מקדימה/עריכה). */
  if (!opts.manager && !session?.settlementApprovedAt) return "";
  const players = playersFromSession(session);
  if (!players.length) return "";

  const cps = opts.cps ?? (sessionHasBuyinChips(session) ? (session.cps || CPS) : 1);
  /* ערב מסומן: טקסט החלוקה נבנה מהתוכנית השמורה, לא מחישוב מחדש (הקפאה). */
  const stored = hasPaymentMarks(session) ? storedPlanTransfersList(session?.payments?.plan) : null;
  const r = stored
    ? { transfers: stored, shortfall: 0 }
    : resolveSettlement(session);
  const result = {
    transfers: r.transfers.filter((t) => !t.pot && !t.residual),
    shortfall: r.shortfall,
  };
  const text = buildSettlement(result, {
    now: opts.now ?? session?.endedAt ?? (session?.iso ? new Date(`${session.iso}T12:00:00`).getTime() : Date.now()),
    isCashOnly,
    transferVerb,
  });
  return withBotMark(text);
}

/**
 * סך טיפים לשחקן — מ־tips[] (יומן אירועים) וגם מ־tipsGiven על
 * entries/players. ערבים שמורים מלייב לפעמים נשארים עם tipsGiven בלבד
 * (בלי מערך tips) — חייבים לתפוס את שני המקורות.
 */
export function tipTotalsByName(session, players) {
  const totals = {};
  for (const t of session?.tips || []) {
    const amt = +t.amount || 0;
    if (amt > 0) totals[t.name] = (totals[t.name] || 0) + amt;
  }
  const foldGiven = (name, raw) => {
    const n = +raw || 0;
    if (n > 0) totals[name] = Math.max(totals[name] || 0, n);
  };
  for (const e of session?.entries || []) foldGiven(e.name, e.tipsGiven);
  for (const p of players || []) foldGiven(p.name, p.tipsGiven);
  return totals;
}

/**
 * סיכום טיפים לסוף ערב — תמיד כשהיו שחקנים (גם אם אף אחד לא טיפא).
 * מקבל state לייב {players, tips} או ערב שמור {entries, tips}.
 * בלי סכומים במקומות; תיקו = אותו מקום; מחמאות/צחוקים מתחלפים.
 * מי שלא טיפא מופיע פעם אחת בלבד (שורת צחוק אחת) — בלי שורה כפולה למי שזכה.
 * @param {object} session
 * @param {{ p: { name: string }, net: number }[]} [_withNet] נשמר לתאימות קוראים ישנים
 * @param {{ now?: number }} [opts]
 */
export function tipSummaryForSession(session, _withNet, opts = {}) {
  const now = opts.now ?? Date.now();
  const entries = session?.entries || [];
  const players = session?.players?.length
    ? session.players
    : entries.map((e) => ({
        name: e.name,
        tipsGiven: +e.tipsGiven || 0,
      }));
  if (!players.length) return "";

  const totals = tipTotalsByName(session, players);
  const tippers = Object.entries(totals)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "he"));
  const tipped = new Set(tippers.map((t) => t.name));
  const noTip = players.filter((p) => !tipped.has(p.name));

  const lines = ["💸 טיפים הערב"];

  if (tippers.length) {
    const ranks = tipRankPlaces(tippers);
    const onPodium = new Set(ranks.flatMap((r) => r.names));
    for (const r of ranks) {
      if (r.place === 1) {
        lines.push(formatFirstPlaceLine(r.names, isFemaleName, now));
      } else if (r.place === 2) {
        lines.push(`🥈 מקום שני בטיפים: ${r.names.join(", ")}`);
      } else if (r.place === 3) {
        lines.push(`🥉 מקום שלישי בטיפים: ${r.names.join(", ")}`);
      }
    }

    /* כבוד רק למי שטיפא ולא על הפודיום (1–3 כולל תיקו) */
    const alsoTipped = tippers.filter((t) => !onPodium.has(t.name)).map((t) => t.name);
    if (alsoTipped.length) {
      lines.push(`👏 גם נתנו טיפ: ${alsoTipped.join(", ")}`);
    }

    const minAmt = tippers[tippers.length - 1].amount;
    const lowest = tippers.filter((t) => t.amount === minAmt).map((t) => t.name);
    /* הכי מעט רק אם יש גם מישהו ששם יותר — אחרת כולם תיקו במקום 1 */
    if (tippers.some((t) => t.amount > minAmt)) {
      lines.push(formatLowestTipperLine(lowest, isFemaleName));
    }
  } else {
    lines.push("אף אחד לא שם טיפ הערב… 🙈");
  }

  if (noTip.length) {
    const names = noTip.map((p) => p.name);
    /* שורה ריקה לפני «בלי טיפ» — שבירת שורה בוואטסאפ */
    lines.push("");
    lines.push(formatNonTipperLine(names, isFemaleName, now));
  }

  /* BOT_MARK — שליחה לקבוצה (ShareSheet / settleSummary) בלי לולאת אקו */
  return withBotMark(lines.join("\n"));
}

/**
 * ערב שמור מתוך מצב לייב — אותו מבנה שהאפליקציה שומרת בסיום ערב,
 * כדי שהבוט יבנה את אותו סיכום כמו גיליון השיתוף.
 */
export function sessionFromLive(state, { cps = CPS, now = Date.now() } = {}) {
  const players = (state?.players || []).filter((p) => p.cashout !== "" && p.cashout != null);
  const startedAt = state?.startedAt || null;
  const { d, mo, y, iso } = nightDateParts(startedAt, now);
  const tips = (state?.tips || []).map(({ name, amount, at }) => ({ name, amount, at }));
  return {
    iso,
    d,
    mo,
    y,
    cps,
    startedAt,
    endedAt: now,
    entries: players.map((p) => ({
      name: p.name,
      amount: netOf(p, cps),
      chips: +p.cashout || 0,
      buyin: +p.buyin || 0,
      tipsGiven: +p.tipsGiven || 0,
    })),
    ...(tips.length ? { tips } : {}),
    /* ביקורת הגדרות §5.6: שדות הקופה חייבים לזרום גם מהלייב — בלעדיהם כל
       צרכן עתידי שיחשב חלוקה מה־session הזה יקבל קופה 0. */
    ...(state?.savingsPot != null ? { savingsPot: state.savingsPot } : {}),
    ...(state?.savingsPotActual != null ? { savingsPotActual: state.savingsPotActual } : {}),
    ...(state?.savings5 != null ? { savings5: state.savings5 } : {}),
    ...(state?.potDraft != null && state.potDraft !== "" && Number.isFinite(Number(state.potDraft))
      ? { savingsPot: Number(state.potDraft) }
      : {}),
  };
}

/**
 * בלוק פרסי סוף־ערב, עד 3 שורות, בסדר עדיפות: כתר לזוכה הגדול, כתר
 * עדין למפסיד הגדול, «ניצחון טכני» כשהזוכה הגדול זכה ב־10 ₪ או פחות,
 * ו«תייר הערב» לשחקן הראשון שסגר בדיוק באפס.
 * תיקו — הראשון אחרי אותו מיון כמו בסיכום עצמו (יורד לזוכים, עולה
 * למפסידים; מיון יציב שומר על סדר הרשומות). הכותרות מתחלפות לפי דקה,
 * מעוגנות לסוף הערב כמו מחמאות הטיפים. ריק כשאין אף פרס.
 * @param {{ name: string, amount: number }[]} entries
 */
export function nightAwardsText(entries, now = Date.now()) {
  const nets = (entries || []).map((e) => ({ name: e.name, amount: +e.amount || 0 }));
  const winners = nets.filter((e) => e.amount > 0).sort((a, b) => b.amount - a.amount);
  const losers = nets.filter((e) => e.amount < 0).sort((a, b) => a.amount - b.amount);
  const zeros = nets.filter((e) => e.amount === 0);
  const lines = [];
  if (winners.length) lines.push(formatWinnerTitleLine(winners[0].name, isFemaleName, now));
  if (losers.length) lines.push(formatLoserTitleLine(losers[0].name, isFemaleName, now));
  if (winners.length && winners[0].amount <= 10)
    lines.push(formatTechnicalWinLine(winners[0].name, winners[0].amount, isFemaleName, now));
  if (zeros.length) lines.push(formatTouristLine(zeros[0].name, isFemaleName, now));
  return lines.slice(0, 3).join("\n");
}

/** סיכום נטו לוואטסאפ + בלוק טיפים + כתרי סיום — לשיתוף מטאב ערבים / לייב. */
export function nightSummaryText(session, aliases) {
  const entries = Array.isArray(session?.entries)
    ? session.entries
    : (session?.players || []).map((p) => ({
        name: p.name,
        amount: netOf(p, session?.cps || CPS),
      }));
  if (!entries.length) return "";
  const base = toWhatsApp(entries, session, null, aliases || null);
  /* המחמאות מתחלפות לפי דקה — מעוגנים לסוף הערב, כדי שמה שנשלח זהה לתצוגה המקדימה */
  const now = session?.endedAt ?? Date.now();
  const tips = tipSummaryForSession(session, undefined, { now });
  /* בלוק טיפים תמיד כשיש שחקנים — גם כשסך הטיפים 0. אחריו בלוק הפרסים
     כסיום. withBotMark על כל ההודעה (טיפים כבר מסומנים — בלי כפילות בתחילה). */
  const awards = nightAwardsText(entries, now);
  const tail = [tips, awards].filter(Boolean).join("\n\n");
  return withBotMark(tail ? `${base}\n\n${tail}` : base);
}
