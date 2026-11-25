import { openingBalances, applyManualPayment, settleFromBalances, routePotThroughEden, applyManualShortfall, editorBalancesWithPot, RESIDUAL_SINK_NAME } from "./manualSettlement";
import { ceil5 } from "./settlement";
import { settleWithPot } from "./nightShare";

/**
 * עיגול ערכים ידניים למעלה לכפולת־5 (הכרעת עדן 25.11.2026, §8 — במקום
 * החסימה של §2.2/C5): סכום תשלום ידני וערך במפת חוסר ידנית שאינם כפולת־5
 * מתעגלים אוטומטית למעלה (13←15), וההפרש מזוכה לעדן כעודף שיורי נסתר
 * (ברמת הצפוי של המנהל בלבד — לא נראה לשחקנים ולא יוצר העברה לא־עגולה).
 * @returns {{ payments: object[], diff: number }}
 */
/* רק ערכים שלמים וסופיים מתעגלים — ערך שברי/לא־סופי עובר כמו שהוא,
   כדי שוולידציית applyManualPayment תמשיך לדחות אותו כמקודם. */
const roundableInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
};

export function roundManualPaymentsUp5(manualPayments) {
  let diff = 0;
  const payments = (manualPayments || []).map((p) => {
    /* תשלום זוגי (joint/fromSplit) הוא רישום של חלוקה פנימית שבוצעה
       בפועל בין בני הזוג (למשל 6/4 על 10₪ בערב 10.10 האמיתי) — לא
       מעגלים אותו ולא את חלקיו; עיגול §8 חל על סכום תשלום יחיד. */
    if (p.fromSplit && typeof p.fromSplit === "object") return p;
    const n = roundableInt(p.amount);
    if (n == null) return p;
    const rounded = ceil5(n);
    diff += rounded - n;
    return { ...p, amount: rounded };
  });
  return { payments, diff };
}

/** מפת חוסר ידנית עם כל ערך מעוגל למעלה לכפולת־5 (§8). */
export function roundShortfallMapUp5(shortfallMap) {
  let diff = 0;
  const map = {};
  for (const [name, amt] of Object.entries(shortfallMap || {})) {
    const n = roundableInt(amt);
    if (n == null) {
      map[name] = amt;
      continue;
    }
    const rounded = ceil5(n);
    if (rounded > 0) map[name] = rounded;
    diff += rounded - n;
  }
  return { map, diff };
}

/**
 * מחיל תשלומים ידניים בזה אחר זה על יתרות ההתחלה. בכשל — לא זורק ולא
 * בולע בשקט: מחזיר דגל מפורש עם התשלום הכושל והשגיאה, והקורא מציג אותו
 * למנהל (ממצא ביקורת 3 — פעם catch ריק היה מחזיר חלוקה "נקייה" בלי
 * התשלומים הידניים ובלי מפת החוסר, ומי שסודר ידנית התבקש לשלם שוב).
 * בהצלחה מחזיר את היתרות שאחרי כל התשלומים.
 */
function applyManualsOrFlag(startBalances, manualPayments) {
  let balances = { ...startBalances };
  for (const payment of manualPayments || []) {
    try {
      balances = applyManualPayment(balances, payment);
    } catch (e) {
      return {
        balances: null,
        error: { message: e?.message || "תשלום ידני לא תקין", payment },
      };
    }
  }
  return { balances, error: null };
}

/**
 * עודף מזומן מעבר לכל התביעות (זוכים + קופה): החייבים שנותרו עם חוב אחרי
 * החלוקה האוטומטית "משלמים" אותו הלאה — כך כל חייב משלם את מלוא חובו
 * הגולמי והוולידטור רואה את התמונה המלאה.
 * היעד (הכרעת עדן 19.11.2026, מחליפה את כיור 25.10): כש־edenName ניתן
 * ועדן בין שחקני הערב — העודף מזוכה לו על שמו: שאריות של אחרים הן
 * העברות residual אליו, ושאריתו שלו נספגת (אין שורת העברה; היא נספרת
 * ב־total ומתווספת לשורת הצפוי שלו אצל הקורא). בלי עדן בערב — כיור
 * "עודף ערב" הניטרלי כמקודם.
 * balancesAfter = יתרות אחרי תשלומים ידניים וקיצוץ חוסר, לפני החלוקה.
 * הפונקציה נוגעת רק בשורות המצורפות וב־total — לא ביתרות עצמן, לא
 * בתשלומים הידניים ולא בהעברות השחקנים, ולכן סימוני שולם/התקבל (שנקשרים
 * רק לרשימת השחקנים הקנונית) לא זזים ממנה בשום ערב, גם סגור ושולם.
 */
function residualFor(balancesAfter, autoTransfers, edenName) {
  const paidOut = Object.create(null);
  for (const t of autoTransfers || []) {
    if (t.fromSplit) {
      for (const [n, a] of Object.entries(t.fromSplit)) paidOut[n] = (paidOut[n] || 0) + a;
    } else if (t.from) {
      paidOut[t.from] = (paidOut[t.from] || 0) + t.amount;
    }
  }
  const creditEden =
    edenName && Object.prototype.hasOwnProperty.call(balancesAfter || {}, edenName)
      ? edenName
      : null;
  const transfers = [];
  let total = 0;
  for (const [name, bal] of Object.entries(balancesAfter || {})) {
    if (bal >= 0) continue;
    const leftover = -bal - (paidOut[name] || 0);
    if (leftover > 0) {
      total += leftover;
      if (creditEden && name === creditEden) continue; // שארית של עדן — נספגת
      transfers.push({
        from: name,
        to: creditEden || RESIDUAL_SINK_NAME,
        amount: leftover,
        residual: true,
      });
    }
  }
  return { transfers, total, creditedTo: creditEden };
}

/**
 * שורת הצפוי של יעד העודף ברשימת הפתיחה: בזיכוי לעדן — שורתו הקיימת
 * גדלה במלוא העודף (קיבל מאחרים + נספג מחובו), בלי שורת כיור; אחרת —
 * שורת הכיור הניטרלית כמקודם.
 */
function openingWithResidual(openingList, residual) {
  if (residual.total <= 0) return openingList;
  if (residual.creditedTo) {
    return openingList.map((row) =>
      row.name === residual.creditedTo ? { ...row, net: row.net + residual.total } : row
    );
  }
  return [...openingList, { name: RESIDUAL_SINK_NAME, net: residual.total }];
}

export const settlementBasis = (players, cps) => JSON.stringify([cps, players.map(({ name, buyin, cashout }) => ({ name, buyin, cashout }))]);

const normalizePreferCreditors = (names) => [
  ...new Set((Array.isArray(names) ? names : []).map((name) => String(name || "").trim()).filter(Boolean)),
];

/** חוסר ידני: מפת שם → סכום מחיקה. זוכה מקבל פחות / חייב משלם פחות. */
const normalizeShortfall = (s) => {
  const out = {};
  if (s && typeof s === "object") {
    for (const [k, v] of Object.entries(s)) {
      const amt = Math.round(+v || 0);
      const name = String(k || "").trim();
      if (name && amt > 0) out[name] = amt;
    }
  }
  return out;
};

/**
 * מסלול קופה (ערבי קופת חיסכון, מודל 25.10): יתרות הפתיחה הן הנטו הגולמי
 * של השחקנים + כיור הקופה כזוכה מוגן. מפת החוסר הידנית חלה על זוכים בלבד
 * (הקופה לעולם לא נחתכת) וסכומה הוא החוסר עצמו — בלי החילוק ב־2 של המסלול
 * הישן, שם המפה הייתה דו־צדדית (זוכה מקבל פחות + חייב משלם פחות).
 */
function savedSettlementWithPot(players, cps, saved, { potAmount, potSinkName, edenName, allowResidual }) {
  const basis = settlementBasis(players, cps);
  const preferCreditors = normalizePreferCreditors(saved?.preferCreditors);
  const basisOk = saved?.basis === basis;
  const storedManual = basisOk ? (saved.manualPayments || []) : [];
  /* עיגול §8.5 במפת החוסר חל גם בקריאה (סבב תיקון, ממצא בודק 1): ערך
     ידני לא־עגול במפה שמורה מתעגל למעלה לכפולת־5 כשה־resolver צורך
     אותה (13←15), וההפרש מזוכה לעדן כ־hiddenResidualCredit. ערב שכבר
     סומן מוגן בכל מקרה — paymentPlan מגיש לו את התוכנית השמורה כמות
     שהיא ואינו מחשב מחדש, כך שאין שינוי בדיעבד לערבים סגורים. גם
     נתיב הכתיבה מנרמל (recordManualPayments/saveManualPayments),
     כך שמפות חדשות נשמרות נקיות מלכתחילה. */
  const rawShortfall = basisOk ? normalizeShortfall(saved?.shortfall) : {};
  const { map: shortfall, diff: shortfallRoundDiff } = roundShortfallMapUp5(rawShortfall);

  // נקודת התחלה אחת עם העורך (ממצא ביקורת 2): editorBalancesWithPot מחיל
  // את מפת החוסר השמורה אם ניתנה, אחרת את חיתוך החוסר האוטומטי של
  // settle — תמיד לפני התשלומים הידניים, והקופה חסינה מהחיתוך.
  // unit5: היתרות מעוגלות לחמישיות במנוע האחד, כמו במסלול האוטומטי.
  const { balances: startBalances } = editorBalancesWithPot(players, cps, potAmount, potSinkName, {
    preferCreditors,
    shortfallMap: shortfall,
    unit5: true,
  });
  // תשלום ידני שלא עובר ולידציה לא נזרק בשקט: החלוקה מחושבת בלעדיו
  // ובלי שאר הידניים (הכול־או־כלום), עם דגל מפורש למנהל (ממצא 3).
  // מפת החוסר נשארת מוחלת גם במקרה הזה.
  const applied = applyManualsOrFlag(startBalances, storedManual);
  const manualError = applied.error;
  const manualPayments = manualError ? [] : storedManual;
  let balances = applied.balances || { ...startBalances };
  /* היתרה שנשארה אחרי הידניים נפתרת במנוע החמישיות האחד (settleWithPot
     על שחקנים סינתטיים מהיתרות, cps=1): עיגול נטו, קיצוץ חוסר ביחידות־5,
     רגל קופה floor5, ניתוב קופה דרך עדן עם splitUnit5, ועודף לעדן —
     בדיוק כמו במסלול האוטומטי. זה התיקון לשורש 22.11: פעם המסלול הזה
     רץ על settle בלי שום עיגול וייצר 249/41 ופיצולי 23.
     חריגה אחת: כשיש מפת חוסר שמורה, היתרות כבר מקובעות על ידה (היא
     נגזרה בדיוק כדי לקבע את החלוקה מול שינויי קופה, R1+R3+R4) — אז
     המנוע נקרא עם potAmount=0 והכיור כשחקן סינתטי רגיל ביתרתו, כדי
     שלא יחתוך שוב לפי סכום הקופה הנוכחי (מנהל רואה בפועל, צופה בלי
     שדות קופה — ושניהם חייבים לקבל אותן העברות שחקנים). */
  const hasStoredMap = basisOk && Object.keys(shortfall).length > 0;
  const synthPlayers = Object.entries(balances)
    .filter(([name]) => !hasStoredMap || name !== potSinkName || (+balances[name] || 0) !== 0)
    .map(([name, net]) => {
      const n = Math.round(+net || 0);
      return n >= 0
        ? { name, buyin: 0, cashout: String(n) }
        : { name, buyin: -n, cashout: "0" };
    });
  const engine = hasStoredMap
    ? settleWithPot(synthPlayers, 1, 0, { preferCreditors })
    : settleWithPot(
        synthPlayers.filter((p) => p.name !== potSinkName),
        1,
        potAmount,
        { preferCreditors }
      );
  /* במסלול המפה: ניתוב הקופה דרך עדן כשהוא חייב (הכרעת 25.10, R3) —
     הקופה היא חובת ההפקדה שלו; הניתוב מחליף מקורות בלי לשנות סכומים. */
  const routedTransfers = hasStoredMap && edenName && (startBalances[edenName] ?? 0) < 0
    ? routePotThroughEden(engine.transfers, edenName, potSinkName, { splitUnit5: true }).transfers
    : engine.transfers;
  const flaggedTransfers = hasStoredMap
    ? routedTransfers.map((t) =>
        t.to === potSinkName && !t.manual && !t.pot ? { ...t, pot: true } : t
      )
    : routedTransfers;
  const engineTransfers = allowResidual === false
    ? flaggedTransfers.filter((t) => !t.residual)
    : flaggedTransfers;
  const remaining = {
    transfers: engineTransfers,
    shortfall: engine.shortfall,
    nets: engine.nets,
  };
  const shortfallTotal = Object.values(shortfall).reduce((s, v) => s + v, 0);
  /* ה־opening (expected) נבנה מזרימת־הנטו בפועל: זרימה ידנית + הצפוי של
     המנוע על היתרות — כך הוולידציה משווה מול ההתחייבות המעוגלת בדיוק,
     ושימור הנטו מחזיק לכל שחקן. */
  const manualFlow = Object.create(null);
  for (const p of manualPayments) {
    if (p.fromSplit) {
      for (const [n, a] of Object.entries(p.fromSplit)) manualFlow[n] = (manualFlow[n] || 0) - (+a || 0);
    } else if (p.from) {
      manualFlow[p.from] = (manualFlow[p.from] || 0) - (+p.amount || 0);
    }
    if (p.to) manualFlow[p.to] = (manualFlow[p.to] || 0) + (+p.amount || 0);
  }
  const engineExpected = Object.create(null);
  for (const row of engine.expected || []) engineExpected[row.name] = row.net;
  const openingList = Object.keys(startBalances).map((name) => {
    const net = (manualFlow[name] || 0) + (engineExpected[name] || 0);
    return { name, net };
  });
  const residual = {
    transfers: engineTransfers.filter((t) => t.residual),
    total: engineTransfers.filter((t) => t.residual).reduce((s, t) => s + t.amount, 0),
    creditedTo: edenName || null,
  };
  return {
    ...remaining,
    basis,
    manualPayments,
    ...(manualError ? { manualError, droppedManualPayments: storedManual } : {}),
    preferCreditors,
    shortfall,
    shortfallTotal,
    balances,
    remaining,
    opening: openingList,
    potFraction: engine.potFraction || 0,
    /* ההפרש מעיגול־למעלה של מפת החוסר (§8.5): החיתוך הגדול ב־diff
       מקטין את זכאות הזוכים באותו סכום, והמנוע מחזיר אותו לעדן דרך
       שורות ה־residual/הצפוי — כאן הוא נחשף למנהל כזיכוי השיורי. */
    hiddenResidualCredit: shortfallRoundDiff,
    transfers: [
      ...manualPayments.map((p) => ({
        from: p.from,
        to: p.to,
        amount: p.amount,
        manual: true,
        ...(p.joint ? { joint: true } : {}),
        ...(p.fromSplit ? { fromSplit: p.fromSplit } : {}),
      })),
      ...engineTransfers,
    ],
  };
}

export function savedSettlement(players, cps, saved, opts = {}) {
  /* גל Pot Boost: גם ערב־קופה עם קופה 0 עובר במנוע החמישיות — כלל 1
     ("כל העברה כפולת־5, תמיד") חל על כל ערב מעידן הקופה, לא רק כשיש
     קופה בפועל. הנתיב הישן נשאר לערבי טרום־קופה/לגאסי בלבד
     (allowResidual:false מפורש, או בלי potSinkName). */
  if (opts.potSinkName && (opts.potAmount > 0 || opts.allowResidual !== false)) {
    return savedSettlementWithPot(players, cps, saved, opts);
  }
  const basis = settlementBasis(players, cps);
  const preferCreditors = normalizePreferCreditors(saved?.preferCreditors);
  const storedManual = saved?.basis === basis ? (saved.manualPayments || []) : [];
  /* המסלול בלי־קופה (לגאסי, דו־צדדי) אינו חלק מממצא §8.5 — מפתו נצרכת
     כמות שהיא כמו תמיד; עיגול־הלמעלה חל במסלול הקופה בלבד (למעלה). */
  const shortfall = saved?.basis === basis ? normalizeShortfall(saved?.shortfall) : {};
  const opening = openingBalances(players, cps, { preferCreditors });
  // יתרות פתיחה אחרי חוסר ידני — זו ההתחייבות בפועל לוולידציה וליתרה.
  // אותה פונקציה (applyManualShortfall) משמשת גם את עורך החלוקה, כדי
  // שתקרות העורך יחושבו מול אותן יתרות בדיוק (ממצא ביקורת 3).
  const adjustedOpening = applyManualShortfall(opening.balances, shortfall);
  // כשל בתשלום ידני אחד לא מוחק בשקט את כולם: דגל מפורש למנהל, והמפה
  // נשארת מוחלת גם בחלוקה המחושבת בלעדיהם (ממצא ביקורת 3).
  const applied = applyManualsOrFlag(adjustedOpening, storedManual);
  const manualError = applied.error;
  const manualPayments = manualError ? [] : storedManual;
  let balances = applied.balances || { ...adjustedOpening };
  const remaining = settleFromBalances(balances, cps);
  // סך החוסר נטו (המפה כוללת שני צדדים, לכן חצי)
  const shortfallTotal = Math.round(
    Object.values(shortfall).reduce((s, v) => s + v, 0) / 2
  );
  const residual = opts.allowResidual === false ? { transfers: [], total: 0, creditedTo: null } : residualFor(balances, remaining.transfers, opts.edenName);
  // יתרות צפויות אחרי חוסר ידני (לפני תשלומים ידניים) — לוולידציה
  const openingList = openingWithResidual(
    Object.entries(adjustedOpening).map(([name, net]) => ({ name, net })),
    residual
  );
  return {
    ...remaining,
    basis,
    manualPayments,
    ...(manualError ? { manualError, droppedManualPayments: storedManual } : {}),
    preferCreditors,
    shortfall,
    shortfallTotal,
    balances,
    remaining,
    opening: openingList,
    transfers: [
      // תשלום ידני זוגי שומר joint/fromSplit כדי שהוולידטור והתצוגה יבינו אותו
      ...manualPayments.map((p) => ({
        from: p.from,
        to: p.to,
        amount: p.amount,
        manual: true,
        ...(p.joint ? { joint: true } : {}),
        ...(p.fromSplit ? { fromSplit: p.fromSplit } : {}),
      })),
      ...remaining.transfers,
      ...residual.transfers,
    ],
  };
}

export function recordManualPayments(players, cps, manualPaymentsIn, opts = {}) {
  /* §8: גם בנתיב הרישום של העורך — סכומים ידניים מתעגלים למעלה לכפולת־5
     לפני הוולידציה, כדי שהערך השמור, המוצג והמחושב יהיו אותו ערך. */
  const potEra = Boolean(opts.potSinkName) && (opts.potAmount > 0 || opts.allowResidual !== false);
  const manualPayments = potEra
    ? roundManualPaymentsUp5(manualPaymentsIn).payments
    : manualPaymentsIn;
  let balances;
  if (potEra) {
    // ערבי קופה: הוולידציה חייבת לרוץ מול אותן יתרות התחלה שה־resolver
    // והעורך משתמשים בהן — editorBalancesWithPot: כיור הקופה כזוכה +
    // מפת החוסר השמורה אם יש (הכיור מוגן), אחרת חיתוך החוסר האוטומטי.
    // בלי הכיור כל תשלום ידני לקופה נדחה ("לא אמור לקבל יותר"); בלי
    // החיתוך האוטומטי הוולידציה אישרה תשלומים מעבר לזכאות הנטו —
    // שה־resolver היה זורק אחר כך (ממצאי ביקורת 2+3).
    balances = editorBalancesWithPot(players, cps, opts.potAmount, opts.potSinkName, {
      preferCreditors: opts.preferCreditors,
      /* נתיב כתיבה (§8.5): מפת החוסר מנורמלת מעוגלת־למעלה כבר כאן,
         כדי שהוולידציה תרוץ מול אותה מפה שה־resolver יצרוך. */
      shortfallMap: roundShortfallMapUp5(normalizeShortfall(opts.shortfall)).map,
      unit5: true,
    }).balances;
    /* אותה התאמת §8 כמו ב־resolver: הכיור על floor5, השבר לעדן —
       כדי שוולידציית תשלום ידני לקופה תעמוד מול אותה יתרה בדיוק. */
    const potAmt = +opts.potAmount || 0;
    const frac = Math.max(0, Math.round(potAmt - Math.floor(potAmt / 5) * 5));
    if (frac > 0 && balances[opts.potSinkName] != null) {
      balances[opts.potSinkName] = Math.floor(potAmt / 5) * 5;
      if (opts.edenName && balances[opts.edenName] != null) balances[opts.edenName] += frac;
    }
  } else {
    balances = openingBalances(players, cps, { preferCreditors: opts.preferCreditors }).balances;
  }
  for (const payment of manualPayments) balances = applyManualPayment(balances, payment);
  return {
    basis: settlementBasis(players, cps),
    manualPayments,
    preferCreditors: normalizePreferCreditors(opts.preferCreditors),
  };
}

/** תווית גרסת החלוקה לכרטיס הצופה — רק אחרי עריכה אחת לפחות. */
export function settlementVersionLabel(session) {
  const saved = session?.manualSettlement;
  const version = Number(saved?.settlementVersion);
  if (!Number.isInteger(version) || version <= 1) return "";
  const updatedAt = saved?.settlementUpdatedAt ? new Date(saved.settlementUpdatedAt) : null;
  const time =
    updatedAt && !Number.isNaN(updatedAt.getTime())
      ? updatedAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
      : "";
  return time ? `עודכן ${time} · גרסה ${version}` : `גרסה ${version}`;
}
