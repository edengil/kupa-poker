import { playersFromSession, playersWithPot, sessionHasBuyinChips, computedPot, sessionHasPot } from "./nightShare";
import { settle } from "./settlement";
import { CPS, netOf } from "./report";
import { savedSettlement, recordManualPayments } from "./savedSettlement";
import { canon, DEFAULT_ALIASES, r2 } from "./poker/helpers";

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
  // הוולידציה המחמירה חלה על ערבי קופה בלבד: בערבים שלפני 10.10.2026 עודף
  // ברישום הוא חלק מההיסטוריה (הכסף נסגר אז בפועל) — לא שגיאה לתפוס.
  const problems = sessionHasPot(session) ? validateTransfers(expected, transfers) : [];
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
  // חובה להשתמש באותן יתרות מותאמות־קופה כמו paymentPlan/settlementTextForSession,
  // אחרת ה-basis לא תואם והתשלומים הידניים נזרקים בשקט בערב עם עודף.
  const players = playersWithPot(session);
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
      // שומר חוסר ידני קיים (לא נערך דרך העורך הידני)
      ...(currentSaved.shortfall && Object.keys(currentSaved.shortfall).length
        ? { shortfall: currentSaved.shortfall }
        : {}),
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

/**
 * נתוני דשבורד קופת החיסכון (אדמין בלבד).
 * לכל ערב: קופה מיושמת (מחושבת מהיתרות — זה מה שירד מהתשלום של עדן),
 * קופה מתועדת (שדה savingsPot, ניתן לעריכה), והנטו הגולמי של עדן.
 * @returns {{ evenings, totalApplied, totalRecorded, withdrawn, balance }}
 */
export function potOverview(db) {
  const sessions = [...(db?.sessions || [])].sort((a, b) =>
    String(b.iso || "").localeCompare(String(a.iso || ""))
  );
  const withdrawals = Array.isArray(db?.savingsWithdrawals) ? db.savingsWithdrawals : [];
  const withdrawn = withdrawals.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const evenings = sessions.map((s) => {
    const cps = sessionHasBuyinChips(s) ? s.cps || CPS : 1;
    const applied = computedPot(s);
    const recordedRaw = s.savingsPot != null && s.savingsPot !== "" ? Number(s.savingsPot) : null;
    const recorded = recordedRaw != null && Number.isFinite(recordedRaw) ? r2(recordedRaw) : null;
    const raw = playersFromSession(s);
    const rawEden = raw.find((p) => canon(p.name, DEFAULT_ALIASES) === "עדן גיל");
    const edenGross = rawEden ? Math.round(netOf(rawEden, cps)) : 0;
    const adjusted = playersWithPot(s);
    const edenAdj = adjusted.find((p) => canon(p.name, DEFAULT_ALIASES) === "עדן גיל");
    const edenNet = edenAdj ? netOf(edenAdj, cps) : 0;
    return {
      id: s.id,
      date: `${s.d}.${s.mo}.${s.y}`,
      applied,
      recorded,
      edenGross,
      edenPaid: Math.max(0, Math.round(-edenNet)),
      edenWon: Math.max(0, Math.round(edenNet)),
    };
  });
  const totalApplied = evenings.reduce((s, e) => s + e.applied, 0);
  const totalRecorded = evenings.reduce((s, e) => s + (e.recorded ?? e.applied), 0);
  return {
    evenings,
    totalApplied: r2(totalApplied),
    totalRecorded: r2(totalRecorded),
    withdrawn: r2(withdrawn),
    balance: r2(totalRecorded - withdrawn),
  };
}
