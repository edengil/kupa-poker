import { playersFromSession, sessionHasBuyinChips } from "./nightShare";
import { settle } from "./settlement";
import { CPS } from "./report";
import { savedSettlement, recordManualPayments } from "./savedSettlement";

/* שינוי בחלוקה מאפס סימוני «שולם» — לא מדביקים וי על העברות אחרות. */
export function paymentPlan(session) {
  const cps = sessionHasBuyinChips(session) ? (session.cps || CPS) : 1;
  const players = playersFromSession(session);
  const { transfers } = session.manualSettlement ? savedSettlement(players, cps, session.manualSettlement) : settle(players, cps);
  const fingerprint = JSON.stringify(transfers);
  const paid = session.payments?.plan === fingerprint ? { ...(session.payments.paid || {}) } : {};
  transfers.forEach((t, i) => { if (t.manual) paid[i] = true; });
  return { transfers, fingerprint, paid };
}

export function markTransfer(session, index, isPaid) {
  const { transfers, fingerprint, paid } = paymentPlan(session);
  if (!transfers[index]) return session;
  if (transfers[index].manual && !isPaid) {
    return saveManualPayments(session, session.manualSettlement.manualPayments.filter((_, i) => i !== index));
  }
  return { ...session, payments: { plan: fingerprint, paid: { ...paid, [index]: isPaid } } };
}

export function saveManualPayments(session, manualPayments) {
  const cps = sessionHasBuyinChips(session) ? (session.cps || CPS) : 1;
  const previous = paymentPlan(session);
  const next = { ...session, manualSettlement: recordManualPayments(playersFromSession(session), cps, manualPayments) };
  const plan = paymentPlan({ ...next, payments: undefined });
  const paid = {};
  const key = (t) => JSON.stringify([t.from, t.to, t.amount, !!t.manual]);
  const paidKeys = previous.transfers.filter((_, i) => previous.paid[i]).map(key);
  plan.transfers.forEach((t, i) => {
    const match = paidKeys.indexOf(key(t));
    if (t.manual || match !== -1) paid[i] = true;
    if (match !== -1) paidKeys.splice(match, 1);
  });
  return { ...next, payments: { plan: plan.fingerprint, paid } };
}
