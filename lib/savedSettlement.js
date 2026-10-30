import { openingBalances, applyManualPayment, settleFromBalances, routePotThroughEden, applyManualShortfall, editorBalancesWithPot, RESIDUAL_SINK_NAME } from "./manualSettlement";

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
 * החלוקה האוטומטית "משלמים" אותו לכיור "עודף ערב" — כך כל חייב משלם את
 * מלוא חובו הגולמי והוולידטור רואה את התמונה המלאה, בלי לנתב את העודף
 * דרך הנטו של שחקן כלשהו (המודל הישן ניתב אותו דרך עדן — נדחה 25.10).
 * balancesAfter = יתרות אחרי תשלומים ידניים וקיצוץ חוסר, לפני החלוקה.
 */
function residualFor(balancesAfter, autoTransfers) {
  const paidOut = Object.create(null);
  for (const t of autoTransfers || []) {
    if (t.fromSplit) {
      for (const [n, a] of Object.entries(t.fromSplit)) paidOut[n] = (paidOut[n] || 0) + a;
    } else if (t.from) {
      paidOut[t.from] = (paidOut[t.from] || 0) + t.amount;
    }
  }
  const transfers = [];
  let total = 0;
  for (const [name, bal] of Object.entries(balancesAfter || {})) {
    if (bal >= 0) continue;
    const leftover = -bal - (paidOut[name] || 0);
    if (leftover > 0) {
      total += leftover;
      transfers.push({ from: name, to: RESIDUAL_SINK_NAME, amount: leftover, residual: true });
    }
  }
  return { transfers, total };
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
  const shortfall = basisOk ? normalizeShortfall(saved?.shortfall) : {};
  // נקודת התחלה אחת עם העורך (ממצא ביקורת 2): editorBalancesWithPot מחיל
  // את מפת החוסר השמורה אם ניתנה, אחרת את חיתוך החוסר האוטומטי של
  // settle — תמיד לפני התשלומים הידניים, והקופה חסינה מהחיתוך. פעם
  // ה־resolver התחיל מהגולמי, החיל ידניים וחתך אחרון בתוך החלוקה —
  // והעורך והתוכנית בפועל נתנו חלוקות שונות לאותו ערב (₪32 עברו בין
  // זוכים בשחזור הביקורת). בלי תשלומים ידניים התוצאה זהה לקודם:
  // settle על יתרותיו־שלו הוא אידמפוטנטי.
  const { balances: startBalances } = editorBalancesWithPot(players, cps, potAmount, potSinkName, {
    preferCreditors,
    shortfallMap: shortfall,
  });
  // תשלום ידני שלא עובר ולידציה לא נזרק בשקט: החלוקה מחושבת בלעדיו
  // ובלי שאר הידניים (הכול־או־כלום), עם דגל מפורש למנהל (ממצא 3).
  // מפת החוסר נשארת מוחלת גם במקרה הזה.
  const applied = applyManualsOrFlag(startBalances, storedManual);
  const manualError = applied.error;
  const manualPayments = manualError ? [] : storedManual;
  let balances = applied.balances || { ...startBalances };
  let remaining = settleFromBalances(balances, cps, {
    preferCreditors: [potSinkName, ...preferCreditors],
  });
  // ניתוב הקופה דרך עדן כשהוא חייב (הכרעת 25.10): תשלומיו לקופה קודם.
  // כשעדן זוכה — במסלול הידני לא מנתבים (ההפקדה נומינלית מתוך קבלתו).
  if (edenName && (startBalances[edenName] ?? 0) < 0) {
    const routed = routePotThroughEden(remaining.transfers, edenName, potSinkName);
    remaining = {
      ...remaining,
      transfers: routed.transfers.map((t) =>
        t.to === potSinkName && !t.pot ? { ...t, pot: true } : t
      ),
    };
  }
  const shortfallTotal = Object.values(shortfall).reduce((s, v) => s + v, 0);
  const residual = allowResidual === false ? { transfers: [], total: 0 } : residualFor(balances, remaining.transfers);
  // ה־expected לוולידציה ולדשבורד = יתרות ההתחלה שאחרי כל החיתוכים
  // (מפה ידנית או חיתוך אוטומטי), לפני התשלומים הידניים — אותה סמנטיקה
  // כמו במסלול האוטומטי (settleWithPot). פעם זה היה הגולמי, והוולידטור
  // צעק "אמור לקבל 300 אבל מקבל 257" על תוכניות תקינות (ממצא 2).
  const openingList = Object.entries(startBalances).map(([name, net]) => ({ name, net }));
  if (residual.total > 0) openingList.push({ name: RESIDUAL_SINK_NAME, net: residual.total });
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

export function savedSettlement(players, cps, saved, opts = {}) {
  if (opts.potAmount > 0 && opts.potSinkName) {
    return savedSettlementWithPot(players, cps, saved, opts);
  }
  const basis = settlementBasis(players, cps);
  const preferCreditors = normalizePreferCreditors(saved?.preferCreditors);
  const storedManual = saved?.basis === basis ? (saved.manualPayments || []) : [];
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
  const residual = opts.allowResidual === false ? { transfers: [], total: 0 } : residualFor(balances, remaining.transfers);
  // יתרות צפויות אחרי חוסר ידני (לפני תשלומים ידניים) — לוולידציה
  const openingList = Object.entries(adjustedOpening).map(([name, net]) => ({ name, net }));
  if (residual.total > 0) openingList.push({ name: RESIDUAL_SINK_NAME, net: residual.total });
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

export function recordManualPayments(players, cps, manualPayments, opts = {}) {
  let balances;
  if (opts.potAmount > 0 && opts.potSinkName) {
    // ערבי קופה: הוולידציה חייבת לרוץ מול אותן יתרות התחלה שה־resolver
    // והעורך משתמשים בהן — editorBalancesWithPot: כיור הקופה כזוכה +
    // מפת החוסר השמורה אם יש (הכיור מוגן), אחרת חיתוך החוסר האוטומטי.
    // בלי הכיור כל תשלום ידני לקופה נדחה ("לא אמור לקבל יותר"); בלי
    // החיתוך האוטומטי הוולידציה אישרה תשלומים מעבר לזכאות הנטו —
    // שה־resolver היה זורק אחר כך (ממצאי ביקורת 2+3).
    balances = editorBalancesWithPot(players, cps, opts.potAmount, opts.potSinkName, {
      preferCreditors: opts.preferCreditors,
      shortfallMap: normalizeShortfall(opts.shortfall),
    }).balances;
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
