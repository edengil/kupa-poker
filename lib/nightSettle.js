/* ============================================================================
   מנוע החלוקה של עידן־הקופה — מוצו מ־lib/nightShare.js (גל B, מנה 5.5,
   מיצוי־בלבד, אפס שינוי התנהגות). settleWithPot הוא לב חישוב הכסף:
   עיגול לחמישיות (כלל ברזל 1), עודף שיורי והפרשי עיגול לעדן (כלל 5),
   חוסר יחסי לרווחים עם פטור לעדן/אורן (כלל 6), ורגל קופה ב־floor5
   כשהרשום נשאר מלא (כללים 9+5). nightShare מייצא אותו הלאה (re-export),
   כך שאף יבואן לא השתנה — כולל lib/savedSettlement.js, שממשיך לייבא
   אותו מ־nightShare.
   סגירת־תלות מינימלית (מוצהרת): פנימיי העיגול־לחמישיות isPrivilegedName
   ו־OREN_CANON עברו עם המנוע — רק הוא צורך אותם. EDEN_CANON מיובא
   מ־lib/nightPlayers.js, שם הוא חי מאז מנה 5.2. כל שאר התלויות הן
   מהמנועים המשותפים (settlement, poker/helpers, manualSettlement) —
   אין כאן שום ייבוא מ־nightShare ואין ייבוא מעגלי.
   בלוק תיעוד מודל־הקופה שמתחת לכותרת זו עבר עם המנוע בשלמותו — הוא
   מתעד את settleWithPot עצמו (החלטת היקף מנה 5.5).
   הערת־המשך ממנה 5.3 (מוצהרת): lib/nightPlan.js מייבא מעתה את
   settleWithPot מכאן ישירות — הקצה nightPlan→nightShare עבורו התמוסס;
   את settlementPlayersFor / resolveSettlement הוא ייבא מ־nightShare
   עד מנה 5.6, שבה הם עברו ל־lib/nightResolve.js והוא מפנה לשם.
   ============================================================================ */

import { settle, roundedNets, floor5, ceil5, roundNetTo5, shortfallCuts5, canonName } from "./settlement";
import { canon, DEFAULT_ALIASES, r2 } from "./poker/helpers.js";
import { EDEN_CANON } from "./nightPlayers";
import { routePotThroughEden, POT_SINK_NAME, RESIDUAL_SINK_NAME } from "./manualSettlement";

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
