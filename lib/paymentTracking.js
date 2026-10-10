import { playersFromSession, sessionHasBuyinChips } from "./nightShare";
import { settle } from "./settlement";
import { CPS } from "./report";
import { savedSettlement, recordManualPayments } from "./savedSettlement";
import { r2 } from "./poker/helpers";

/**
 * מחזיר שחקנים עם קיזוז קופה צדדית מהנטו של עדן גיל.
 * ההפסד האמיתי נשמר ב-entries לסטטיסטיקה; הקיזוז חל רק על החישוב.
 */
export function playersWithPot(session) {
  return playersFromSession(session);
}

/**
 * עודף בקופה — אם סכום הנטו שלילי (חייבים יותר ממה שמגיע), ההפרש הוא עודף.
 */
function netSurplusFromEntries(session) {
  const entries = session?.entries || [];
  const sum = r2(entries.reduce((s, e) => s + (+e.amount || 0), 0));
  return Math.max(0, r2(-sum));
}

/**
 * מקזז את הקופה הצדדית מההעברות של עדן גיל.
 * אם הוא משלם — משלם פחות; אם מגיע לו — מקבל יותר.
 * ההפסד/רווח האמיתי נשמר ב-entries.
 */
export function applyPotToTransfers(transfers, pot) {
  pot = r2(Number(pot) || 0);
  if (pot <= 0 || !Array.isArray(transfers)) return transfers;
  const out = transfers.map((t) => ({ ...t }));
  let remaining = pot;
  // קודם מקזז מההעברות שעדן משלם (מהגדולה לקטנה)
  const outgoing = out
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.from === "עדן גיל")
    .sort((a, b) => b.t.amount - a.t.amount);
  for (const { t, i } of outgoing) {
    if (remaining <= 0) break;
    const cut = Math.min(t.amount, remaining);
    out[i] = { ...t, amount: r2(t.amount - cut) };
    remaining = r2(remaining - cut);
  }
  // אם נשאר עודף (עדן מרוויח) — מוסיף להעברות אליו
  if (remaining > 0) {
    const incoming = out
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.to === "עדן גיל")
      .sort((a, b) => b.t.amount - a.t.amount);
    for (const { t, i } of incoming) {
      if (remaining <= 0) break;
      out[i] = { ...t, amount: r2(t.amount + remaining) };
      remaining = 0;
      break; // מוסיף הכל להעברה אחת
    }
    // אין העברות נכנסות בכלל — יוצר אחת חדשה מהקופה
    if (remaining > 0) {
      out.push({ from: "קופה צדדית", to: "עדן גיל", amount: remaining, pot: true });
    }
  }
  return out.filter((t) => t.amount > 0);
}

/* שינוי בחלוקה מאפס סימוני «שולם» — לא מדביקים וי על העברות אחרות. */
export function paymentPlan(session) {
  const cps = sessionHasBuyinChips(session) ? (session.cps || CPS) : 1;
  const players = playersWithPot(session);
  let { transfers } = session.manualSettlement
    ? savedSettlement(players, cps, session.manualSettlement)
    : settle(players, cps);
  // קופה צדדית + עודף (אם חייבים יותר ממה שמגיע — העודף הולך לעדן)
  const pot = r2((Number(session?.savingsPot) || 0) + netSurplusFromEntries(session));
  transfers = applyPotToTransfers(transfers, pot);
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

export function saveManualPayments(session, manualPayments, opts = {}) {
  const cps = sessionHasBuyinChips(session) ? (session.cps || CPS) : 1;
  const players = playersFromSession(session);
  const previous = paymentPlan(session);
  const currentSaved = savedSettlement(players, cps, session.manualSettlement);
  const preferCreditors = Object.prototype.hasOwnProperty.call(opts, "preferCreditors")
    ? opts.preferCreditors
    : currentSaved.preferCreditors;
  const recorded = recordManualPayments(players, cps, manualPayments, { preferCreditors });
  const candidateSaved = savedSettlement(players, cps, recorded);
  const paymentKey = (payment) => JSON.stringify([payment.from, payment.to, Math.round(+payment.amount || 0)]);
  const sameManualPayments =
    currentSaved.manualPayments.length === candidateSaved.manualPayments.length &&
    currentSaved.manualPayments.every((payment, index) => paymentKey(payment) === paymentKey(candidateSaved.manualPayments[index]));
  const samePreferCreditors =
    JSON.stringify(currentSaved.preferCreditors) === JSON.stringify(candidateSaved.preferCreditors);
  const rawBasisChanged = Boolean(session.manualSettlement && session.manualSettlement.basis !== recorded.basis);

  if (session.manualSettlement && !rawBasisChanged && sameManualPayments && samePreferCreditors) {
    return session;
  }

  const previousVersion = Number(session.manualSettlement?.settlementVersion);
  const settlementVersion =
    Number.isInteger(previousVersion) && previousVersion > 0 ? previousVersion + 1 : 2;
  const updatedDate = opts.now ? new Date(opts.now) : new Date();
  const settlementUpdatedAt = Number.isNaN(updatedDate.getTime())
    ? new Date().toISOString()
    : updatedDate.toISOString();
  const next = {
    ...session,
    manualSettlement: {
      ...recorded,
      settlementVersion,
      settlementUpdatedAt,
    },
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
