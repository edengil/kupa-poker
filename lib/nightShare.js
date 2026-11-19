/* ============================================================================
   עזרי שיתוף / חלוקה לערב שמור — מחושבים תמיד מחדש (לא נשמרים ב־DB).
   משותפים לטאב ערבים, טאב טבלה, לייב, ובוט הוואטסאפ.
   ============================================================================ */

import { CPS, buildSettlement, netOf, nightDateParts } from "./report";
import { settle, roundedNets, isCashOnly, transferVerb, isFemaleName, distribute5, floor5, ceil5 } from "./settlement";
import { toWhatsApp, canon, DEFAULT_ALIASES, r2, potForBuyin } from "./poker/helpers.js";
import {
  tipRankPlaces,
  formatFirstPlaceLine,
  formatLowestTipperLine,
  formatNonTipperLine,
} from "./tipSummaryCopy.js";
import { withBotMark } from "./botMark";
import { savedSettlement, settlementBasis } from "./savedSettlement";
import { routePotThroughEden, POT_SINK_NAME, RESIDUAL_SINK_NAME } from "./manualSettlement";

/** האם לרשומות יש buyin/chips (לייב) או רק נטו (הזנה ידנית). */
export function sessionHasBuyinChips(session) {
  const entries = session?.entries || [];
  return entries.some((e) => e.buyin != null || e.chips != null);
}

/**
 * שחקנים ל־settle מתוך ערב שמור.
 * אם יש buyin/chips — משתמשים בהם; אחרת נטו כמו InputTab (cps=1 אצל הקורא).
 */
export function playersFromSession(session) {
  const entries = session?.entries || [];
  if (!entries.length) return [];

  if (sessionHasBuyinChips(session)) {
    return entries.map((e) => {
      if (e.buyin != null || e.chips != null) {
        return {
          name: e.name,
          buyin: +e.buyin || 0,
          cashout: String(e.chips != null ? +e.chips || 0 : Math.max(0, +e.amount || 0)),
          tipsGiven: +e.tipsGiven || 0,
        };
      }
      /* רשומה מעורבת בלי פירוט — כמו נטו */
      return {
        name: e.name,
        buyin: e.amount < 0 ? -e.amount : 0,
        cashout: String(Math.max(0, e.amount)),
        tipsGiven: +e.tipsGiven || 0,
      };
    });
  }

  return entries.map((e) => ({
    name: e.name,
    buyin: e.amount < 0 ? -e.amount : 0,
    cashout: String(Math.max(0, e.amount)),
    tipsGiven: +e.tipsGiven || 0,
  }));
}

const EDEN_CANON = "עדן גיל";

/**
 * קופת החיסכון (חיסכון 5% מהג'יטונים) התחילה בערב 10.10.2026 — רק מערב
 * זה ואילך. בערבים קודמים אין קופה: עודף ברישום מתחלק כרגיל בין החייבים,
 * כמו שהיה בפועל כשאותם ערבים נסגרו (תיקון מעדן, 2026-10-13).
 */
const POT_START_ISO = "2026-10-10";

export function sessionHasPot(session) {
  const iso = String(session?.iso || "");
  return iso !== "" && iso >= POT_START_ISO;
}

/**
 * [LEGACY — מודל 2026-10-11, הוחלף ב־25.10.2026] שחקנים לחישוב ההעברות —
 * העודף מגולם בנטו של עדן גיל. נשמר אך ורק כדי לזהות ולשרת חלוקות ידניות
 * ישנות שה־basis שלהן חושב על השחקנים המותאמים (ערבים סגורים לא משתנים).
 * חלוקות חדשות עוברות דרך resolveSettlement/settleWithPot בלבד.
 */
export function playersWithPot(session) {
  const players = playersFromSession(session);
  if (!sessionHasPot(session)) return players;
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const total = players.reduce((s, p) => s + netOf(p, cps), 0);
  const surplus = Math.max(0, -total);
  if (!(surplus > 0)) return players;
  const idx = players.findIndex((p) => canon(p.name, DEFAULT_ALIASES) === EDEN_CANON);
  if (idx < 0) return players; // עדן לא בערב — הוולידטור ב-paymentPlan יתריע
  const p = players[idx];
  const newNet = netOf(p, cps) + surplus;
  const adjusted = { ...p };
  if (newNet >= 0) {
    adjusted.buyin = 0;
    adjusted.cashout = String(newNet * cps);
  } else {
    adjusted.buyin = -newNet;
    adjusted.cashout = "0";
  }
  const out = players.slice();
  out[idx] = adjusted;
  return out;
}

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

/** שם עדן כפי שהוא מופיע ברשומות הערב (לניתוב הקופה דרכו), או null. */
export function edenNameIn(session) {
  const players = playersFromSession(session || {});
  const eden = players.find((p) => canon(p.name, DEFAULT_ALIASES) === EDEN_CANON);
  return eden ? eden.name : null;
}

/** שמות הכיורים הפנימיים — מוגדרים ב־manualSettlement ומיוצאים כאן הלאה. */
export { POT_SINK_NAME, RESIDUAL_SINK_NAME } from "./manualSettlement";

/** סכום הקופה הרשום לערב: השדה המתועד; אם חסר והמתג דלק — 5% מהקניות. */
export function potRecordedFor(session) {
  if (!sessionHasPot(session)) return 0;
  const raw = session?.savingsPot;
  if (raw != null && raw !== "" && Number.isFinite(Number(raw))) return r2(Number(raw));
  if (session?.savings5 && sessionHasBuyinChips(session)) {
    // נוסחת הקופה האחת (גל 4, ממצא 14): סכום potForBuyin על כל רשומת
    // קנייה — אותו חישוב בדיוק כמו צבירת הלייב, לא נוסחת־סכום נפרדת.
    // (העיגול לשקלים שלמים קורה רק בנקודת בניית התוכנית.)
    return r2((session.entries || []).reduce((s, e) => s + potForBuyin(+e.buyin || 0), 0));
  }
  return 0;
}

/** סכום הקופה בפועל לערב: שדה savingsPotActual אם הוגדר, אחרת הרשום. */
export function potActualFor(session) {
  const raw = session?.savingsPotActual;
  if (raw != null && raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0) {
    return r2(Number(raw));
  }
  return potRecordedFor(session);
}

/**
 * סכום הקופה בתוכנית החלוקה (הכרעת עדן, 25.10 — R3): אם נערך "בפועל"
 * (savingsPotActual) — ההעברה לקופה בתוכנית היא הבפועל; בלי שדה — הרשום.
 * זהו בדיוק potActualFor; השם הנפרד מסמן שהשימוש הוא בבניית התוכנית.
 * פנקס הקופה (רשום/בפועל/יתרות ב־potOverview) לא נגזר מכאן ולא משתנה.
 */
export function potPlanFor(session) {
  return potActualFor(session);
}

/**
 * מפת חוסר אוטומטית (יחסית לרווחים, דרך settleWithPot) לסכום קופה נתון —
 * משמשת "להקפיא" את החלוקה כמפה ידנית כשעורכים "בפועל" לערב בלי חלוקה
 * שמורה: המפה מוחלטת, ולכן צופה שמחשב עם הרשום (בלי לדעת את הבפועל)
 * מקבל את אותם סכומי שחקנים בדיוק.
 * @returns {Object<string, number>} שם זוכה → סכום שנחתך; {} אם אין חוסר.
 */
export function autoShortfallMapForPot(session, potAmount) {
  const players = playersFromSession(session || {});
  if (!players.length) return {};
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const r = settleWithPot(players, cps, Math.max(0, Math.round(+potAmount || 0)));
  const received = Object.create(null);
  for (const t of r.playerTransfers || []) {
    received[t.to] = (received[t.to] || 0) + t.amount;
  }
  // ההשוואה היא מול הנטו הגולמי — ה־nets של settleWithPot כבר אחרי החלוקה
  const map = {};
  for (const n of roundedNets(players, cps)) {
    if (n.net <= 0) continue;
    const cut = Math.round(n.net - (received[n.name] || 0));
    if (cut > 0) map[n.name] = cut;
  }
  return map;
}

/**
 * מפת ההקפאה לעריכת "בפועל" על ערב עם חלוקה ידנית (ממצא ביקורת 8):
 * מחשבת את החלוקה כפי שהיא תחת הקופה הרשומה (בלי ה"בפועל"), ומחזירה
 * מפת חוסר מוחלטת שמשחזרת בדיוק את אותם סכומי שחקנים. כשזו המפה
 * השמורה, שינוי סכום הקופה בתוכנית מזיז רק את שורת הקופה (ההפרש
 * הופך לעודף פנימי) — ומנהל וצופה, שהצופה מחשב עם הרשום בלבד,
 * מקבלים אותם סכומי שחקנים. כולל את התשלומים הידניים בחישוב
 * ה"התקבל", כי המפה חלה לפניהם והסכומים משתמרים (ראו withActual).
 * @returns {Object<string, number>} שם זוכה → סכום שנחתך; {} אם אין חוסר.
 */
export function freezeShortfallMapFor(session) {
  const players = settlementPlayersFor(session || {});
  if (!players.length) return {};
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const atRecorded = { ...(session || {}), savingsPotActual: undefined };
  const resolved = resolveSettlement(atRecorded);
  const received = Object.create(null);
  for (const t of resolved.transfers || []) {
    // רק קבלות־זכאות נספרות כאן: שורות ה־residual הן זיכוי העודף לעדן
    // (הכרעת 19.11), לא חלק מהזכאות — אם ייספרו, מפת ההקפאה תחתוך את
    // עדן פחות מהנדרש והעודף יזוכה לו פעמיים כשהמפה תוחל.
    if (t.to && !t.residual) received[t.to] = (received[t.to] || 0) + t.amount;
  }
  const map = {};
  for (const n of roundedNets(players, cps)) {
    if (n.net <= 0) continue;
    const cut = Math.round(n.net - (received[n.name] || 0));
    if (cut > 0) map[n.name] = cut;
  }
  return map;
}

/**
 * פער הערב החתום (בשקלים) — ההגדרה הקנונית של עדן (11.11), כמו
 * checkNightBalance ב־lib/poker/nightBalance.js: הפער הוא יציאות + טיפים
 * מול הג'יטונים שהונפקו. ג'יטוני הטיפ חוזרים לספירה כי טיפ הוא רישום
 * בלבד והג'יטונים עברו בין השחקנים בשולחן; רק מה שחסר מתחת לטיפים הוא
 * חוסר אמיתי (שלילי = חוסר, חיובי = עודף מזומן בקופה).
 * לערב בלי נתוני ג'יטונים (רשומות סכום־בלבד) אין תיקון טיפים — סכום
 * הנטו כמות שהוא, כמו תמיד.
 */
export function nightGap(session) {
  const players = playersFromSession(session);
  if (!players.length) return 0;
  const hasChips = sessionHasBuyinChips(session);
  const cps = hasChips ? session.cps || CPS : 1;
  const netSum = roundedNets(players, cps).reduce((s, r) => s + r.net, 0);
  if (!hasChips) return netSum;
  const tipsChips = (session?.entries || []).reduce(
    (s, e) => s + (+e.tipsGiven || 0),
    0
  );
  return r2(netSum + tipsChips / cps);
}

/**
 * הקופה של הערב — מעכשיו (25.10) זהו הסכום הרשום (ה־5%), לא פער הערב.
 * נשמר השם computedPot לתאימות קוראים; פער הערב (נטו + טיפים, כלל 11.11)
 * זמין דרך nightGap.
 */
export function computedPot(session) {
  return potRecordedFor(session);
}

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
function roundNetTo5(net, priv) {
  if (net > 0) return priv ? ceil5(net) : floor5(net);
  if (net < 0) return priv ? -floor5(-net) : -ceil5(-net);
  return 0;
}

/**
 * קיצוץ חוסר־מימון בחמישיות (הקצאה משותפת P1): החלוקה היחסית הקיימת
 * בין הזוכים נשארת, אבל כל קיצוץ הוא כפולה של 5 — חלקם של עדן/אורן
 * מעוגל למטה לחמישייה (סופגים פחות מהחלק המדויק), והיתרה עוברת
 * לזוכים הרגילים (ביחידות־5, שארית־גדולה). קבוצות ההעדפה נשמרות כמו
 * ב־settle: לא־מועדפים נחתכים קודם, מועדפים אחרונים. אם אין זוכים
 * רגילים שיכולים לספוג (פינת נפילה) — המועדפים סופגים ביחידות־5.
 * @returns {Map<string, number>} שם זוכה → סכום הקיצוץ
 */
function shortfallCuts5(winners, totalCut, preferSet) {
  const cuts = new Map(winners.map((w) => [w.name, 0]));
  if (totalCut <= 0 || !winners.length) return cuts;
  const nonPref = winners.filter((w) => !preferSet.has(canon(w.name, DEFAULT_ALIASES)));
  const pref = winners.filter((w) => preferSet.has(canon(w.name, DEFAULT_ALIASES)));
  const groups = [];
  if (nonPref.length) groups.push(nonPref);
  if (pref.length) groups.push(pref);
  let remaining = totalCut;
  for (const group of groups) {
    if (remaining <= 0) break;
    const gClaims = group.reduce((s, w) => s + w.claim, 0);
    if (gClaims <= 0) continue;
    const take = Math.min(remaining, gClaims);
    remaining -= take;
    const exact = group.map((w) => (take * w.claim) / gClaims);
    let privSum = 0;
    group.forEach((w, i) => {
      if (w.priv) {
        const c = Math.min(w.claim, floor5(exact[i]));
        cuts.set(w.name, c);
        privSum += c;
      }
    });
    let regNeed = take - privSum;
    const regs = group.filter((w) => !w.priv);
    if (regs.length && regNeed > 0) {
      const dist = distribute5(regNeed, regs.map((w) => w.claim), regs.map((w) => w.claim));
      regs.forEach((w, i) => cuts.set(w.name, dist[i]));
      regNeed -= dist.reduce((s, v) => s + v, 0);
    }
    if (regNeed > 0) {
      // הזוכים הרגילים בקבוצה מיצו את תקרתם — המועדפים סופגים את היתרה
      // ביחידות־5 (פינת נפילה; בערב רגיל זה לא קורה).
      const privs = group.filter((w) => w.priv);
      const room = privs.map((w) => w.claim - (cuts.get(w.name) || 0));
      const extra = distribute5(regNeed, room, room);
      privs.forEach((w, i) => cuts.set(w.name, (cuts.get(w.name) || 0) + extra[i]));
    }
  }
  return cuts;
}

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
 *    הכולל K = ‏G + ‏F הוא תמיד כפולה של 5, ומחולק ב־shortfallCuts5.
 * 5. ההקצאה עצמה היא settle על השחקנים המותאמים (תביעות אחרי קיצוץ,
 *    חובות אחרי שברי־מימון, כיור floor5(קופה)) עם פיצולי זוג
 *    ביחידות־5 — לכן כל העברה בין אנשים יוצאת כפולה של 5 מעצמה.
 * 6. עודף: שאריות החייבים מול ההתחייבות המותאמת מזוכות לעדן (שלב 1) —
 *    שורות residual כפולות־5, שאריתו של עדן נספגת בצפוי שלו.
 * ההעברות לכיור מסומנות pot:true ולא מוצגות בקבוצה.
 */
export function settleWithPot(players, cps, potAmount, opts = {}) {
  const pot = Math.max(0, Math.round(+potAmount || 0));
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

  // (3) מימון הקופה: שארית r ישירה מנושא אחד; שבר f של נושא חלקי
  const potInSettle = floor5(pot);
  let remainder = pot - potInSettle;
  const directPot = [];
  const directOf = new Map();
  const settleDebtOf = new Map(debtors.map((d) => [d.name, d.debt]));
  let fractionTotal = 0;
  if (remainder > 0) {
    const order = [...debtors].sort((a, b) => {
      const ae = edenPlayer && a.name === edenPlayer.name ? 0 : 1;
      const be = edenPlayer && b.name === edenPlayer.name ? 0 : 1;
      return ae - be || b.debt - a.debt || a.name.localeCompare(b.name, "he");
    });
    for (const d of order) {
      if (remainder <= 0) break;
      const direct = Math.min(remainder, d.debt);
      directPot.push({ from: d.name, amount: direct });
      directOf.set(d.name, direct);
      remainder -= direct;
      if (direct < d.debt) {
        const sd = floor5(d.debt - direct);
        settleDebtOf.set(d.name, sd);
        fractionTotal += d.debt - direct - sd;
      } else {
        settleDebtOf.set(d.name, 0);
      }
    }
  }

  // (4) חוסר מימון וקיצוץ בחמישיות
  const gap = sumClaims + pot - sumDebts;
  const totalCutNeeded = gap + fractionTotal;
  const preferSet = new Set(
    (opts.preferCreditors || []).map((n) => canon(n, DEFAULT_ALIASES)).filter(Boolean)
  );
  const cuts = totalCutNeeded > 0 ? shortfallCuts5(winners, totalCutNeeded, preferSet) : new Map();
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
  // שורות הקופה הישירות (שארית r): מיזוג לשורת הכיור הקיימת של הנושא
  // כשאפשר, כדי ששורת הקופה של עדן תישאר אחת ומלאה כמו תמיד.
  for (const dp of directPot) {
    const ex = allTransfers.find(
      (t) => t.from === dp.from && t.to === POT_SINK_NAME && !t.joint && !t.manual
    );
    if (ex) ex.amount += dp.amount;
    else allTransfers.push({ from: dp.from, to: POT_SINK_NAME, amount: dp.amount, pot: true });
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
    // סך העודף האמיתי של הערב: שאריות ההקצאה + שבר המימון שנספג בתוכה
    // (בעודף בלבד; בחוסר השבר כבר נכלל בקיצוץ ואינו עודף).
    surplus: residual + (totalCutNeeded < 0 ? fractionTotal : 0),
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
  const players = playersFromSession(session);
  if (!players.length) return "";

  const cps = opts.cps ?? (sessionHasBuyinChips(session) ? (session.cps || CPS) : 1);
  const r = resolveSettlement(session);
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
  };
}

/** סיכום נטו לוואטסאפ + בלוק טיפים — לשיתוף מטאב ערבים / לייב. */
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
  const tips = tipSummaryForSession(session, undefined, { now: session?.endedAt ?? Date.now() });
  /* בלוק טיפים תמיד כשיש שחקנים — גם כשסך הטיפים 0.
     withBotMark על כל ההודעה (טיפים כבר מסומנים — בלי כפילות בתחילה). */
  return withBotMark(tips ? `${base}\n\n${tips}` : base);
}
