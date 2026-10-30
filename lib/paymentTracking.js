import {
  playersFromSession,
  sessionHasBuyinChips,
  sessionHasPot,
  settlementPlayersFor,
  isLegacySettlement,
  edenNameIn,
  potRecordedFor,
  potActualFor,
  potPlanFor,
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

/** זהות של העברה לצורך סימונים: מי, למי, כמה — בלי דגלים.
    manual/pair אינם חלק מהזהות: אותה העברה מופיעה בתוכנית השמורה של
    24.10 כ־manual ובתוכנית המחושבת כ־pair, והסימון שייך להעברה עצמה.
    כשהדגל היה חלק מהמפתח, הסימונים על נתנאל→אופיר 150 אבדו בתצוגה
    ו־rpcMarkTarget החזיר null (פסילת בודק B, סבב 2). */
const transferMarkKey = (t) =>
  JSON.stringify([t?.from, t?.to, Math.round(Number(t?.amount) || 0)]);

/**
 * ההעברות של התוכנית השמורה ב־payments.plan — ה־fingerprint הוא ה־JSON
 * של רשימת ההעברות עצמה, אז אפשר לשחזר ממנו את התוכנית הישנה.
 * מחזיר null כשהמחרוזת השמורה אינה רשימת העברות (פורמט לא מוכר).
 */
export function storedPlanTransfers(plan) {
  if (typeof plan !== "string" || !plan) return null;
  try {
    const parsed = JSON.parse(plan);
    if (!Array.isArray(parsed)) return null;
    const ok = parsed.every(
      (t) => t && typeof t === "object" && typeof t.from === "string" && typeof t.to === "string"
    );
    return ok ? parsed : null;
  } catch {
    return null;
  }
}

/** מיפוי אינדקס־בתוכנית־ישנה → אינדקס־בתוכנית־חדשה לפי זהות העברה; כל העברה נצרכת פעם אחת. */
function matchTransferIndexes(oldTransfers, newTransfers) {
  const queues = new Map();
  newTransfers.forEach((t, i) => {
    const k = transferMarkKey(t);
    if (!queues.has(k)) queues.set(k, []);
    queues.get(k).push(i);
  });
  const map = new Map();
  oldTransfers.forEach((t, i) => {
    const queue = queues.get(transferMarkKey(t));
    if (queue && queue.length) map.set(i, queue.shift());
  });
  return map;
}

/**
 * סימונים שמורים מתוכנית קודמת, מועברים לתוכנית הנוכחית לפי זהות העברה.
 * העברה זהה (from/to/amount) שומרת את ה־✓ שלה גם כשהתוכנית סביבה השתנתה
 * (תיקון קופה, מפת חוסר, שינוי בקוד החלוקה); העברה שונה לא מקבלת וי של אחרת.
 * תוכניות ישנות כוללות גם את העברת הקופה ברשימה — סימון עליה משוחזר
 * כ־potPaid (היא כבר לא חלק מרשימת ההעברות הקנונית). אירועי אישור של
 * הקופה (pot) עוברים כמו שהם.
 */
function carryStoredPayments(storedPayments, newTransfers) {
  const paid = {};
  const received = {};
  const confirmations = [];
  let potPaid = false;
  const oldTransfers = storedPlanTransfers(storedPayments?.plan);
  if (!oldTransfers) return { paid, received, confirmations, potPaid };
  const indexMap = matchTransferIndexes(oldTransfers, newTransfers);
  oldTransfers.forEach((t, oldIndex) => {
    if (t?.pot && (storedPayments.paid?.[oldIndex] || storedPayments.received?.[oldIndex])) {
      potPaid = true;
    }
  });
  for (const [oldIndex, newIndex] of indexMap) {
    if (storedPayments.paid?.[oldIndex]) paid[newIndex] = true;
    if (storedPayments.received?.[oldIndex]) received[newIndex] = true;
  }
  for (const event of storedPayments.confirmations || []) {
    if (!event) continue;
    if (event.pot || Number(event.index) === -1) {
      confirmations.push({ ...event });
      continue;
    }
    /* אישור שנרשם על שורת הקופה בתוכנית ישנה כאינדקס רגיל (בלי דגל pot —
       כך שמרו ה־RPC והלקוחות שלפני המודל הנוכחי; בייצור 24.10: אירוע
       index 5) מומר לצורת הקופה הקנונית. הדגל potPaid שרד גם קודם דרך
       מפות ה־paid/received, אבל שורת המי/מתי נפלה כי לשורת הקופה אין
       אינדקס בתוכנית החדשה (ממצא בודק A). */
    if (oldTransfers[Number(event.index)]?.pot) {
      confirmations.push({ ...event, index: -1, pot: true });
      continue;
    }
    const newIndex = indexMap.get(Number(event.index));
    if (newIndex !== undefined) confirmations.push({ ...event, index: newIndex });
  }
  return { paid, received, confirmations, potPaid };
}

/* החלוקה נפתרת דרך resolveSettlement (מודל הקופה 25.10): חייבים משלמים
   מלא, זוכים מקבלים אחרי חלוקת חוסר יחסית, והקופה ממומנת במלואה דרך
   העברות פנימיות מסומנות (pot/residual) שאינן מוצגות לשחקנים.
   כשהתוכנית משתנה, סימוני «שולם»/«התקבל» על העברות זהות עוברים אליה
   (carryStoredPayments) — לא נמחקים, ולא מדביקים וי על העברות אחרות. */
export function paymentPlan(session) {
  const resolved = resolveSettlement(session);
  const allTransfers = resolved.transfers;
  const expected = resolved.expected;
  // הוולידציה המחמירה חלה על ערבי קופה בלבד: בערבים שלפני 10.10.2026 עודף
  // ברישום הוא חלק מההיסטוריה (הכסף נסגר אז בפועל) — לא שגיאה לתפוס.
  const problems = sessionHasPot(session) ? validateTransfers(expected, allTransfers) : [];
  /* התוכנית הקנונית לסימונים = העברות־שחקנים בלבד. העברת הקופה והעברות
     ה"עודף" הפנימיות הן נתוני מנהל: הן לא חלק מה־fingerprint (שינוי סכום
     קופה לא פוסל סימונים — R3), לא נספרות בסגירת הערב אצל שחקנים, ולא
     יוצאות לצופים (R4). הקופה חוזרת בנפרד כ־potTransfer עם סימון משלה
     (potPaid) שרק המנהל רואה ומסמן. */
  const transfers = allTransfers.filter((t) => !t.pot && !t.residual);
  const potTransfer = allTransfers.find((t) => t.pot) || null;
  // ה-fingerprint לא כולל fromSplit (מטא-דאטה פנימי) כדי לא לאפס סימוני «שולם» קיימים
  const fingerprint = JSON.stringify(transfers.map(({ fromSplit, ...rest }) => rest));
  const samePlan = session.payments?.plan === fingerprint;
  let paid;
  let received;
  let confirmations;
  let carriedPotPaid = false;
  if (samePlan) {
    paid = { ...(session.payments.paid || {}) };
    received = { ...(session.payments.received || {}) };
    confirmations = Array.isArray(session.payments?.confirmations)
      ? session.payments.confirmations.map((event) => ({ ...event }))
      : [];
  } else {
    ({ paid, received, confirmations, potPaid: carriedPotPaid } = carryStoredPayments(
      session.payments,
      transfers
    ));
  }
  const potPaid = Boolean(session.payments?.potPaid || carriedPotPaid);
  transfers.forEach((t, i) => {
    if (t.manual) {
      paid[i] = true;
      received[i] = true;
    }
  });
  return { transfers, potTransfer, potPaid, fingerprint, paid, received, confirmations, problems };
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
  const { transfers, fingerprint, paid, received, confirmations, potPaid } = paymentPlan(session);
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
      ...(potPaid ? { potPaid: true } : {}),
      confirmations: rememberConfirmation(confirmations, index, "paid", by, isPaid),
    },
  };
}

/** סימון «התקבל» אצל מי שאמור לקבל — אותו אובייקט payments, מפה נפרדת. */
export function markReceipt(session, index, isReceived, by = null) {
  const { transfers, fingerprint, paid, received, confirmations, potPaid } = paymentPlan(session);
  if (!transfers[index]) return session;
  if (transfers[index].manual) return session;
  return {
    ...session,
    payments: {
      plan: fingerprint,
      paid,
      received: { ...received, [index]: isReceived },
      ...(potPaid ? { potPaid: true } : {}),
      confirmations: rememberConfirmation(confirmations, index, "received", by, isReceived),
    },
  };
}

/**
 * סימון ההפקדה לקופת החיסכון (מנהל בלבד). ההעברה לקופה אינה חלק מרשימת
 * ההעברות הקנונית, ולכן הסימון חי בשדה נפרד (payments.potPaid) עם אירוע
 * אישור משלו (pot: true) — לא תלוי באינדקסים של העברות השחקנים.
 */
export function markPotPaid(session, isPaid, by = null) {
  const plan = paymentPlan(session);
  if (!plan.potTransfer) return session;
  const name = actorName(by);
  const confirmations =
    isPaid && name
      ? [
          ...plan.confirmations,
          { index: -1, pot: true, action: "paid", by: name, at: new Date().toISOString() },
        ]
      : plan.confirmations;
  return {
    ...session,
    payments: {
      plan: plan.fingerprint,
      paid: plan.paid,
      received: plan.received,
      ...(isPaid ? { potPaid: true } : {}),
      confirmations,
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
        potAmount: potPlanFor(session),
        potSinkName: POT_SINK_NAME,
        edenName: edenNameIn(session),
      };
  const previous = paymentPlan(session);
  const currentSaved = savedSettlement(players, cps, session.manualSettlement, potOpts);
  const preferCreditors = Object.prototype.hasOwnProperty.call(opts, "preferCreditors")
    ? opts.preferCreditors
    : currentSaved.preferCreditors;
  const recorded = recordManualPayments(players, cps, manualPayments, {
    preferCreditors,
    ...potOpts,
    shortfall: currentSaved.shortfall,
  });
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
  const key = transferMarkKey;
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
    if (event?.pot || Number(event?.index) === -1) {
      confirmations.push({ ...event });
      continue;
    }
    const old = previous.transfers[event?.index];
    if (!old) continue;
    const idx = plan.transfers.findIndex((candidate) => key(candidate) === key(old));
    if (idx !== -1) confirmations.push({ ...event, index: idx });
  }
  return {
    ...next,
    payments: {
      plan: plan.fingerprint,
      paid,
      received,
      ...(previous.potPaid ? { potPaid: true } : {}),
      confirmations,
    },
  };
}

/**
 * הקרנת payments לתצוגת צופה (R4): העברת הקופה וסכומיה הם נתוני מנהל —
 * הם לא יוצאים לצופים, גם לא בתוך מחרוזת התוכנית השמורה. מחזיר payments
 * עם plan מוקרן להעברות־שחקנים בלבד, סימונים ממופים מחדש לפי זהות העברה,
 * וללא potPaid ואירועי הקופה. payments בלי תוכנית שמורה / בלי קופה בתוכה
 * חוזר כמו שהוא (אותה הפניה).
 */
export function projectPaymentsForViewer(payments) {
  if (!payments || typeof payments !== "object") return payments;
  const stored = storedPlanTransfers(payments.plan);
  if (!stored || !stored.some((t) => t.pot || t.residual)) return payments;
  const projected = stored.filter((t) => !t.pot && !t.residual);
  const indexMap = matchTransferIndexes(stored, projected);
  const remap = (map) => {
    const out = {};
    for (const [oldIndex, newIndex] of indexMap) {
      if (map?.[oldIndex]) out[newIndex] = true;
    }
    return out;
  };
  return {
    plan: JSON.stringify(projected),
    paid: remap(payments.paid),
    received: remap(payments.received),
    confirmations: (payments.confirmations || [])
      .filter((event) => event && !event.pot && Number(event.index) !== -1)
      .map((event) => ({ ...event, index: indexMap.get(Number(event.index)) }))
      .filter((event) => event.index !== undefined),
  };
}

/**
 * יעד הסימון ל־RPC של הלינק הציבורי. אם התוכנית השמורה שונה מהמחושבת,
 * מתרגמים את ההעברה שנלחצה לאינדקס שלה בתוכנית השמורה (לפי זהות
 * from/to/amount) ושולחים לשרת את מחרוזת התוכנית שהלקוח מחזיק; התצוגה
 * ממפה את הסימון חזרה לתוכנית הנוכחית דרך carryStoredPayments.
 * אצל צופה, המחרוזת שבידו היא ההקרנה של התוכנית השמורה (בלי שורת
 * הקופה — פרטיות מנהל): פונקציית השרת מזהה את ההקרנה מול התוכנית
 * הגולמית שבמסד, מתרגמת את האינדקס לקואורדינטות הגולמיות ושומרת את
 * המחרוזת הגולמית (ראה mark_group_payment ב־schema.sql) — כך סימון
 * ציבורי עובד גם בלי אימוץ מנהל קודם, והתוכנית הגולמית (עם סכום
 * הקופה) לעולם לא יוצאת לצופים.
 * מחזיר null כשההעברה לא קיימת בתוכנית השמורה — אין דרך לסמן אותה מהלינק
 * עד שהתוכנית החדשה תאומץ בשמירה של המנהל.
 */
export function rpcMarkTarget(session, index) {
  const { transfers, fingerprint } = paymentPlan(session);
  if (!transfers[index]) return null;
  const storedPlan = session.payments?.plan;
  if (!storedPlan || storedPlan === fingerprint) return { fingerprint, index };
  const storedTransfers = storedPlanTransfers(storedPlan);
  if (!storedTransfers) return null;
  const key = transferMarkKey(transfers[index]);
  const storedIndex = storedTransfers.findIndex((t) => transferMarkKey(t) === key);
  return storedIndex === -1 ? null : { fingerprint: storedPlan, index: storedIndex };
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
