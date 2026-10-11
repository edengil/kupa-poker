import { openingBalances, applyManualPayment, settleFromBalances } from "./manualSettlement";

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

export function savedSettlement(players, cps, saved) {
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
  return {
    ...remaining,
    basis,
    manualPayments,
    preferCreditors,
    shortfall,
    shortfallTotal,
    balances,
    remaining,
    // יתרות צפויות אחרי חוסר ידני (לפני תשלומים ידניים) — לוולידציה
    opening: Object.entries(adjustedOpening).map(([name, net]) => ({ name, net })),
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
    ],
  };
}

export function recordManualPayments(players, cps, manualPayments, opts = {}) {
  let balances = openingBalances(players, cps, { preferCreditors: opts.preferCreditors }).balances;
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
