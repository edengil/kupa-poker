import { playersFromSession, sessionHasBuyinChips } from "./nightShare";
import { settle } from "./settlement";
import { CPS } from "./report";
import { savedSettlement, recordManualPayments } from "./savedSettlement";
import { canon, DEFAULT_ALIASES } from "./poker/helpers";

const EDEN_CANON = "עדן גיל";

/** נטו של שחקן בשקלים (cashout בג׳יטונים לפי cps, buyin בשקלים). */
function shekelNet(p, cps) {
  return (+p.cashout || 0) / (cps || 1) - (+p.buyin || 0);
}

function playersAndSurplus(session) {
  const players = playersFromSession(session);
  const cps = sessionHasBuyinChips(session) ? session.cps || CPS : 1;
  const total = players.reduce((s, p) => s + shekelNet(p, cps), 0);
  // כסף תלוי באוויר: סך החובות עולה על סך הזכיות.
  // כלל קבוע מעדן (2026-10-11): הכל הולך אליו — מפחית את חובו או מגדיל את זכייתו.
  const surplus = Math.max(0, -total);
  if (!(surplus > 0)) return { players, surplus: 0, cps };
  const idx = players.findIndex((p) => canon(p.name, DEFAULT_ALIASES) === EDEN_CANON);
  if (idx < 0) return { players, surplus, cps }; // עדן לא בערב — הוולידטור יתריע
  const p = players[idx];
  const newNet = shekelNet(p, cps) + surplus;
  const adjusted = { ...p };
  if (newNet >= 0) {
    adjusted.buyin = 0;
    adjusted.cashout = String(newNet * cps);
  } else {
    adjusted.buyin = -newNet;
    adjusted.cashout = "0";
  }
  const out = players.slice();
  out[idx] = adjusted;
  return { players: out, surplus, cps };
}

/**
 * שחקנים לחישוב ההעברות — העודף (כסף תלוי באוויר) כבר מגולם בנטו של עדן גיל.
 * ההפסד/רווח הגולמי נשמר ב-entries לסטטיסטיקה; ההתאמה חלה רק על החישוב.
 */
export function playersWithPot(session) {
  return playersAndSurplus(session).players;
}

/**
 * ולידציה חשבונאית על רשימת ההעברות הסופית מול היתרות הצפויות.
 * תופס באגים מסוג "איציק משלם פחות / קובי מקבל פחות" (ערב 10.10.2026):
 * כל זוכה חייב לקבל מלא, כל חייב חייב לשלם מלא, סכומים שלמים, סה"כ מאוזן.
 * @param {{name: string, net: number}[]} expected - יתרות צפויות בשקלים
 * @param {object[]} transfers
 * @returns {string[]} רשימת בעיות (מערך ריק = תקין)
 */
export function validateTransfers(expected, transfers) {
  const problems = [];
  const paid = Object.create(null);
  const received = Object.create(null);
  let totalOut = 0;
  let totalIn = 0;
  for (const t of transfers || []) {
    const amt = Number(t.amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      problems.push(`סכום לא תקין בהעברה: ${t.from || "?"} → ${t.to || "?"} (${t.amount})`);
      continue;
    }
    if (t.fromSplit && typeof t.fromSplit === "object") {
      for (const [name, a] of Object.entries(t.fromSplit)) {
        paid[name] = (paid[name] || 0) + a;
        totalOut += a;
      }
    } else if (t.from) {
      paid[t.from] = (paid[t.from] || 0) + amt;
      totalOut += amt;
    }
    if (t.to) {
      received[t.to] = (received[t.to] || 0) + amt;
      totalIn += amt;
    }
  }
  if (totalOut !== totalIn) {
    problems.push(`סך ההעברות לא מאוזן: משולם ${totalOut}₪ מול מתקבל ${totalIn}₪`);
  }
  const TOL = 1; // טולרנטיות לעיגולים בלבד — לא להסתרת פערים אמיתיים
  for (const { name, net } of expected || []) {
    const n = Math.round(Number(net) || 0);
    if (n > 0) {
      const got = Math.round(received[name] || 0);
      if (Math.abs(got - n) > TOL) problems.push(`${name} אמור לקבל ${n}₪ אבל מקבל ${got}₪`);
    } else if (n < 0) {
      const gave = Math.round(paid[name] || 0);
      if (Math.abs(gave + n) > TOL) problems.push(`${name} אמור לשלם ${-n}₪ אבל משלם ${gave}₪`);
    }
  }
  return problems;
}

/* שינוי בחלוקה מאפס סימוני «שולם» — לא מדביקים וי על העברות אחרות. */
export function paymentPlan(session) {
  const cps = sessionHasBuyinChips(session) ? (session.cps || CPS) : 1;
  const players = playersWithPot(session); // העודף כבר בנטו של עדן — אין קיצוץ בדיעבד
  let transfers;
  let expected;
  if (session.manualSettlement) {
    const saved = savedSettlement(players, cps, session.manualSettlement);
    transfers = saved.transfers;
    expected = saved.opening;
  } else {
    const s = settle(players, cps);
    transfers = s.transfers;
    expected = s.nets;
  }
  const problems = validateTransfers(expected, transfers);
  // ה-fingerprint לא כולל fromSplit (מטא-דאטה פנימי) כדי לא לאפס סימוני «שולם» קיימים
  const fingerprint = JSON.stringify(transfers.map(({ fromSplit, ...rest }) => rest));
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
  return { transfers, fingerprint, paid, received, confirmations, problems };
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
