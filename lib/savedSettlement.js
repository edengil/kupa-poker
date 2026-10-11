import { openingBalances, applyManualPayment, settleFromBalances } from "./manualSettlement";

export const settlementBasis = (players, cps) => JSON.stringify([cps, players.map(({ name, buyin, cashout }) => ({ name, buyin, cashout }))]);

const normalizePreferCreditors = (names) => [
  ...new Set((Array.isArray(names) ? names : []).map((name) => String(name || "").trim()).filter(Boolean)),
];

export function savedSettlement(players, cps, saved) {
  const basis = settlementBasis(players, cps);
  const preferCreditors = normalizePreferCreditors(saved?.preferCreditors);
  const manualPayments = saved?.basis === basis ? (saved.manualPayments || []) : [];
  const opening = openingBalances(players, cps, { preferCreditors });
  let balances = opening.balances;
  try {
    for (const payment of manualPayments) balances = applyManualPayment(balances, payment);
  } catch {
    return savedSettlement(players, cps, { preferCreditors });
  }
  const remaining = settleFromBalances(balances, cps);
  return {
    ...remaining,
    basis,
    manualPayments,
    preferCreditors,
    balances,
    remaining,
    // יתרות צפויות (אחרי עיגול ופיזור חוסר, לפני תשלומים ידניים) — לוולידציה
    opening: Object.entries(opening.balances).map(([name, net]) => ({ name, net })),
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
