import { openingBalances, applyManualPayment, settleFromBalances, routePotThroughEden, applyShortfallMap, RESIDUAL_SINK_NAME } from "./manualSettlement";
import { roundedNets } from "./settlement";

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
  const manualPayments = basisOk ? (saved.manualPayments || []) : [];
  const shortfall = basisOk ? normalizeShortfall(saved?.shortfall) : {};
  const nets = roundedNets(players, cps);
  const rawTotal = nets.reduce((s, r) => s + r.net, 0);
  const opening = {
    balances: Object.fromEntries(nets.map((r) => [r.name, r.net])),
    shortfall: Math.max(0, rawTotal + potAmount),
    surplus: Math.max(0, -(rawTotal + potAmount)),
  };
  opening.balances[potSinkName] = potAmount;
  // הקופה חסינה — לא נחתכת ידנית ולא אוטומטית (applyShortfallMap עם הגנת הכיור)
  const adjustedOpening = applyShortfallMap(opening.balances, shortfall, potSinkName);
  let balances = { ...adjustedOpening };
  try {
    for (const payment of manualPayments) balances = applyManualPayment(balances, payment);
  } catch {
    return savedSettlementWithPot(players, cps, { preferCreditors }, { potAmount, potSinkName, edenName, allowResidual });
  }
  let remaining = settleFromBalances(balances, cps, {
    preferCreditors: [potSinkName, ...preferCreditors],
  });
  // ניתוב הקופה דרך עדן כשהוא חייב (הכרעת 25.10): תשלומיו לקופה קודם.
  // כשעדן זוכה — במסלול הידני לא מנתבים (ההפקדה נומינלית מתוך קבלתו).
  if (edenName && (adjustedOpening[edenName] ?? 0) < 0) {
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
  const openingList = Object.entries(adjustedOpening).map(([name, net]) => ({ name, net }));
  if (residual.total > 0) openingList.push({ name: RESIDUAL_SINK_NAME, net: residual.total });
  return {
    ...remaining,
    basis,
    manualPayments,
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
  const manualPayments = saved?.basis === basis ? (saved.manualPayments || []) : [];
  const shortfall = saved?.basis === basis ? normalizeShortfall(saved?.shortfall) : {};
  const opening = openingBalances(players, cps, { preferCreditors });
  // יתרות פתיחה אחרי חוסר ידני — זו ההתחייבות בפועל לוולידציה וליתרה
  const adjustedOpening = { ...opening.balances };
  for (const [name, amt] of Object.entries(shortfall)) {
    if (!(name in adjustedOpening)) continue;
    if (adjustedOpening[name] > 0) adjustedOpening[name] = Math.max(0, adjustedOpening[name] - amt);
    else if (adjustedOpening[name] < 0) adjustedOpening[name] = Math.min(0, adjustedOpening[name] + amt);
  }
  let balances = { ...adjustedOpening };
  try {
    for (const payment of manualPayments) balances = applyManualPayment(balances, payment);
  } catch {
    return savedSettlement(players, cps, { preferCreditors });
  }
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
    // ערבי קופה: הוולידציה חייבת לרוץ מול אותן יתרות שה־resolver משחזר —
    // נטו גולמי + כיור הקופה כזוכה, עם מפת החוסר השמורה (הכיור מוגן).
    // בלי זה כל תשלום ידני לקופה נדחה ("לא אמור לקבל יותר") למרות שהעורך
    // עצמו מציע את הקופה כמקבל ומאשר אותו מקומית.
    const nets = roundedNets(players, cps);
    balances = Object.fromEntries(nets.map((r) => [r.name, r.net]));
    balances[opts.potSinkName] = opts.potAmount;
    balances = applyShortfallMap(balances, normalizeShortfall(opts.shortfall), opts.potSinkName);
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
