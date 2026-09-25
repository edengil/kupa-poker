import { playersFromSession, sessionHasBuyinChips } from "./nightShare";
import { settle } from "./settlement";
import { CPS } from "./report";
import { savedSettlement, recordManualPayments } from "./savedSettlement";

/* שינוי בחלוקה מאפס סימוני «שולם» — לא מדביקים וי על העברות אחרות. */
export function paymentPlan(session) {
  const cps = sessionHasBuyinChips(session) ? (session.cps || CPS) : 1;
  const players = playersFromSession(session);
  const { transfers } = session.manualSettlement
    ? savedSettlement(players, cps, session.manualSettlement)
    : settle(players, cps);
  const fingerprint = JSON.stringify(transfers);
  const samePlan = session.payments?.plan === fingerprint;
  const paid = samePlan ? { ...(session.payments.paid || {}) } : {};
  const received = samePlan ? { ...(session.payments.received || {}) } : {};
  const confirmations = samePlan && Array.isArray(session.payments?.confirmations)
    ? session.payments.confirmations.map((event) => ({ ...event }))
    : [];
  transfers.forEach((t, i) => {
    if (t.manual) {
      paid[i] = true;
      received[i] = true;
    }
  });
  return { transfers, fingerprint, paid, received, confirmations };
}

function actorName(by) {
  const name = typeof by === "string" ? by.trim() : "";
  return name || null;
}

function rememberConfirmation(confirmations, index, action, by, enabled) {
  const list = Array.isArray(confirmations) ? [...confirmations] : [];
  const name = actorName(by);
  if (enabled && name) {
    list.push({ index, action, by: name, at: new Date().toISOString() });
  }
  return list;
}

export function markTransfer(session, index, isPaid, by = null) {
  const { transfers, fingerprint, paid, received, confirmations } = paymentPlan(session);
  if (!transfers[index]) return session;
  if (transfers[index].manual && !isPaid) {
    return saveManualPayments(
      session,
      session.manualSettlement.manualPayments.filter((_, i) => i !== index)
    );
  }
  return {
    ...session,
    payments: {
      plan: fingerprint,
      paid: { ...paid, [index]: isPaid },
      received,
      confirmations: rememberConfirmation(confirmations, index, "paid", by, isPaid),
    },
  };
}

/** סימון «התקבל» אצל מי שאמור לקבל — אותו אובייקט payments, מפה נפרדת. */
export function markReceipt(session, index, isReceived, by = null) {
  const { transfers, fingerprint, paid, received, confirmations } = paymentPlan(session);
  if (!transfers[index]) return session;
  if (transfers[index].manual) return session;
  return {
    ...session,
    payments: {
      plan: fingerprint,
      paid,
      received: { ...received, [index]: isReceived },
      confirmations: rememberConfirmation(confirmations, index, "received", by, isReceived),
    },
  };
}

export function saveManualPayments(session, manualPayments) {
  const cps = sessionHasBuyinChips(session) ? (session.cps || CPS) : 1;
  const previous = paymentPlan(session);
  const next = {
    ...session,
    manualSettlement: recordManualPayments(playersFromSession(session), cps, manualPayments),
  };
  const plan = paymentPlan({ ...next, payments: undefined });
  const paid = {};
  const received = {};
  const confirmations = [];
  const key = (t) => JSON.stringify([t.from, t.to, t.amount, !!t.manual]);
  const paidKeys = previous.transfers.filter((_, i) => previous.paid[i]).map(key);
  const receivedKeys = previous.transfers.filter((_, i) => previous.received[i]).map(key);
  plan.transfers.forEach((t, i) => {
    const match = paidKeys.indexOf(key(t));
    if (t.manual || match !== -1) paid[i] = true;
    if (match !== -1) paidKeys.splice(match, 1);
    const got = receivedKeys.indexOf(key(t));
    if (t.manual || got !== -1) received[i] = true;
    if (got !== -1) receivedKeys.splice(got, 1);
  });
  for (const event of previous.confirmations || []) {
    const old = previous.transfers[event?.index];
    if (!old) continue;
    const idx = plan.transfers.findIndex((candidate) => key(candidate) === key(old));
    if (idx !== -1) confirmations.push({ ...event, index: idx });
  }
  return { ...next, payments: { plan: plan.fingerprint, paid, received, confirmations } };
}

/**
 * סימון «שולם» מצופה — דרך RPC (אין כתיבה ישירה ל־groups).
 * מחזיר את ה־data המעודכן או null אם נכשל.
 */
export async function markPaymentViaRpc(supabase, { slug, sessionId, fingerprint, index, paid, field = "paid", by = null }) {
  const { data, error } = await supabase.rpc("mark_group_payment", {
    p_slug: slug,
    p_session_id: sessionId,
    p_fingerprint: fingerprint,
    p_index: index,
    p_paid: paid,
    p_field: field === "received" ? "received" : "paid",
    p_by: actorName(by),
  });
  if (error) {
    console.error("mark_group_payment failed:", error.message);
    return null;
  }
  return data;
}
