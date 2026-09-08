import { playersFromSession, sessionHasBuyinChips } from "./nightShare";
import { settle } from "./settlement";
import { CPS } from "./report";

/* שינוי בחלוקה מאפס סימוני «שולם» — לא מדביקים וי על העברות אחרות. */
export function paymentPlan(session) {
  const cps = sessionHasBuyinChips(session) ? (session.cps || CPS) : 1;
  const { transfers } = settle(playersFromSession(session), cps);
  const fingerprint = JSON.stringify(transfers);
  const paid = session.payments?.plan === fingerprint ? (session.payments.paid || {}) : {};
  return { transfers, fingerprint, paid };
}

export function markTransfer(session, index, isPaid) {
  const { transfers, fingerprint, paid } = paymentPlan(session);
  if (!transfers[index]) return session;
  return { ...session, payments: { plan: fingerprint, paid: { ...paid, [index]: isPaid } } };
}
