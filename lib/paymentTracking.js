import {
  playersFromSession,
  sessionHasBuyinChips,
  sessionHasPot,
  settlementPlayersFor,
  isLegacySettlement,
  edenNameIn,
  potRecordedFor,
  potActualFor,
  nightGap,
  resolveSettlement,
  POT_SINK_NAME,
} from "./nightShare";
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

/* שינוי בחלוקה מאפס סימוני «שולם» — לא מדביקים וי על העברות אחרות.
   החלוקה נפתרת דרך resolveSettlement (מודל הקופה 25.10): חייבים משלמים
   מלא, זוכים מקבלים אחרי חלוקת חוסר יחסית, והקופה ממומנת במלואה דרך
   העברות פנימיות מסומנות (pot/residual) שאינן מוצגות לשחקנים. */
export function paymentPlan(session) {
  const resolved = resolveSettlement(session);
  const transfers = resolved.transfers;
  const expected = resolved.expected;
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
  // חובה להשתמש באותם שחקנים כמו paymentPlan/settlementTextForSession
  // (גולמיים, או הישנים כשה־basis ישן), אחרת ה-basis לא תואם והתשלומים
  // הידניים נזרקים בשקט.
  const players = settlementPlayersFor(session);
  const potOpts = isLegacySettlement(session)
    ? {}
    : {
        potAmount: potRecordedFor(session),
        potSinkName: POT_SINK_NAME,
        edenName: edenNameIn(session),
      };
  const previous = paymentPlan(session);
  const currentSaved = savedSettlement(players, cps, session.manualSettlement, potOpts);
  const preferCreditors = Object.prototype.hasOwnProperty.call(opts, "preferCreditors")
    ? opts.preferCreditors
    : currentSaved.preferCreditors;
  const recorded = recordManualPayments(players, cps, manualPayments, { preferCreditors });
  const candidateSaved = savedSettlement(players, cps, recorded, potOpts);
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
 * נתוני דשבורד קופת החיסכון (אדמין בלבד) — מודל 25.10:
 * לכל ערב שני מספרי קופה נפרדים — "רשום" (ה־5% הרשמי, session.savingsPot)
 * ו"בפועל" (session.savingsPotActual, ברירת מחדל = הרשום) — ופער הערב
 * (סכום הנטו) כשורה נפרדת בשמו, שלעולם לא מתקזז מול הקופה.
 * היתרה הראשית (balance) עוקבת אחרי ה"בפועל"; balanceRecorded משנית.
 * edenPaid/edenWon נגזרים מתוכנית ההעברות בפועל (אחרי חלוקת החוסר).
 * @returns {{ evenings, totalRecorded, totalActual, withdrawn, balance, balanceRecorded }}
 */
export function potOverview(db) {
  const sessions = [...(db?.sessions || [])].sort((a, b) =>
    String(b.iso || "").localeCompare(String(a.iso || ""))
  );
  const withdrawals = Array.isArray(db?.savingsWithdrawals) ? db.savingsWithdrawals : [];
  const withdrawn = withdrawals.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const evenings = sessions.map((s) => {
    const cps = sessionHasBuyinChips(s) ? s.cps || CPS : 1;
    const recorded = potRecordedFor(s);
    const actual = potActualFor(s);
    const gap = nightGap(s);
    const raw = playersFromSession(s);
    const rawEden = raw.find((p) => canon(p.name, DEFAULT_ALIASES) === "עדן גיל");
    const edenGross = rawEden ? Math.round(netOf(rawEden, cps)) : 0;
    let edenPaid = Math.max(0, -edenGross);
    let edenWon = Math.max(0, edenGross);
    try {
      const resolved = resolveSettlement(s);
      const edenExp = (resolved.expected || []).find(
        (p) => canon(p.name, DEFAULT_ALIASES) === "עדן גיל"
      );
      if (edenExp) {
        edenPaid = Math.max(0, Math.round(-edenExp.net));
        edenWon = Math.max(0, Math.round(edenExp.net));
      }
    } catch {
      /* ערב ישן/חריג — נשארים עם הגולמי */
    }
    return {
      id: s.id,
      date: `${s.d}.${s.mo}.${s.y}`,
      recorded,
      actual,
      gap,
      edenGross,
      edenPaid,
      edenWon,
    };
  });
  const totalRecorded = evenings.reduce((s, e) => s + e.recorded, 0);
  const totalActual = evenings.reduce((s, e) => s + e.actual, 0);
  return {
    evenings,
    totalRecorded: r2(totalRecorded),
    totalActual: r2(totalActual),
    withdrawn: r2(withdrawn),
    balance: r2(totalActual - withdrawn),
    balanceRecorded: r2(totalRecorded - withdrawn),
  };
}
