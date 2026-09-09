import { openingBalances, applyManualPayment, settleFromBalances } from "./manualSettlement";

export const settlementBasis = (players, cps) => JSON.stringify([cps, players.map(({ name, buyin, cashout }) => ({ name, buyin, cashout }))]);

export function savedSettlement(players, cps, saved) {
  const basis = settlementBasis(players, cps);
  const manualPayments = saved?.basis === basis ? (saved.manualPayments || []) : [];
  let balances = openingBalances(players, cps).balances;
  try {
    for (const payment of manualPayments) balances = applyManualPayment(balances, payment);
  } catch {
    return savedSettlement(players, cps, null);
  }
  const remaining = settleFromBalances(balances, cps);
  return { ...remaining, basis, manualPayments, balances, remaining,
    transfers: [...manualPayments.map((p) => ({ from: p.from, to: p.to, amount: p.amount, manual: true })), ...remaining.transfers] };
}

export function recordManualPayments(players, cps, manualPayments) {
  let balances = openingBalances(players, cps).balances;
  for (const payment of manualPayments) balances = applyManualPayment(balances, payment);
  return { basis: settlementBasis(players, cps), manualPayments };
}
