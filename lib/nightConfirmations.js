import { canon, DEFAULT_ALIASES } from "./poker/helpers.js";
import { couplePartner } from "./paymentAccess.js";
import { latestSession } from "./lastSession.js";
import { paymentPlan } from "./paymentTracking.js";

function closingInfo(index, paid, received, confirmations) {
  const events = (confirmations || []).filter((event) => event && Number(event.index) === index && event.by);
  const latest = (action) => [...events].reverse().find((event) => event.action === action);
  if (paid[index] && !received[index]) {
    return { action: "paid", by: latest("paid")?.by || null };
  }
  if (received[index] && !paid[index]) {
    return { action: "received", by: latest("received")?.by || null };
  }
  if (paid[index] && received[index]) {
    const first = events.find((event) => event.action === "paid" || event.action === "received");
    if (first) return { action: first.action, by: first.by };
    return { action: null, by: null };
  }
  return { action: null, by: null };
}

/** שורות אישור מתוך תוכנית ההעברות של הערב — אותו מקור כמו «שולם» בכרטיס החלוקה. */
function confirmationRows(session) {
  const { transfers, paid, received, confirmations } = paymentPlan(session);
  return transfers.map((transfer, index) => {
    const closed = !!paid[index] || !!received[index];
    const info = closingInfo(index, paid, received, confirmations);
    return {
      index,
      from: transfer.from,
      to: transfer.to,
      amount: transfer.amount,
      manual: !!transfer.manual,
      confirmed: !!paid[index],
      received: !!received[index],
      closed,
      action: closed ? info.action : null,
      by: closed ? info.by : null,
    };
  });
}

/** מצב אחד לשורה: ממתין, או סגירה עם הפעולה ומי שביצע אותה. בלי רישום — נסגר. */
export function confirmationStatusText(row) {
  if (!row?.closed) return "ממתין";
  if (row.by && row.action === "paid") return `שולם · ${row.by}`;
  if (row.by && row.action === "received") return `התקבל · ${row.by}`;
  return "נסגר";
}

/** כרטיס האישורים נפתח כשיש העברה שממתינה, ומתחיל מכווץ כשכולן סגורות. */
export function confirmationsStartOpen(view) {
  return Boolean(view && view.pendingCount > 0);
}

/** אותה רשימת סגירה כמו במסך הניהול, לערב אחד. «התקבל» סוגר כמו «שולם». */
export function sessionConfirmations(session) {
  if (!session) return null;
  const rows = confirmationRows(session);
  const closedCount = rows.filter((row) => row.closed).length;
  return {
    rows,
    closedCount,
    pendingCount: rows.length - closedCount,
  };
}

/** שורת הסיכום בלינק לקבוצה. כשכולן סגורות אין יתרה שמחכה לתשלום. */
export function settlementLinkSummary(rows) {
  const list = rows || [];
  if (list.length === 0) return "אין העברות — כולם סגורים.";
  const closedCount = list.filter((row) => row.closed).length;
  if (closedCount === list.length) return `נסגרו ${closedCount} מתוך ${list.length}`;
  const outstanding = list.reduce((sum, row) => sum + (row.closed ? 0 : Number(row.amount) || 0), 0);
  return `נסגרו ${closedCount} מתוך ${list.length} · נותרו ${outstanding.toLocaleString("he-IL")}₪ · כולם רואים מי העביר`;
}

/**
 * הערב האחרון ורשימת האישורים שלו.
 * @returns {{ session: object, rows: object[], confirmedCount: number, pendingCount: number } | null}
 */
export function latestNightConfirmations(sessions) {
  const session = latestSession(sessions);
  if (!session) return null;
  const rows = confirmationRows(session);
  const confirmedCount = rows.filter((row) => row.confirmed).length;
  const receivedCount = rows.filter((row) => row.received).length;
  const closedCount = rows.filter((row) => row.closed).length;
  return {
    session,
    rows,
    confirmedCount,
    receivedCount,
    closedCount,
    pendingCount: rows.length - closedCount,
  };
}

function ownsSide(name, viewerName, aliases) {
  const me = canon(viewerName, aliases);
  if (!me) return false;
  const side = canon(name, aliases);
  if (side === me) return true;
  const partner = couplePartner(me, aliases);
  return partner != null && side === partner;
}

/** העברות של הצופה (או בן/בת הזוג) שאף צד עדיין לא סגר. */
export function unconfirmedOwnTransfers(session, viewerName, aliases = DEFAULT_ALIASES) {
  if (!session || !viewerName) return [];
  return confirmationRows(session).filter(
    (row) => !row.closed && ownsSide(row.from, viewerName, aliases)
  );
}

/** העברות שהצופה (או בן/בת הזוג) אמור לקבל, ואף צד עדיין לא סגר. */
export function unconfirmedOwnReceipts(session, viewerName, aliases = DEFAULT_ALIASES) {
  if (!session || !viewerName) return [];
  return confirmationRows(session).filter(
    (row) => !row.closed && ownsSide(row.to, viewerName, aliases)
  );
}

/**
 * חלון למי שפותח שוב את האפליקציה ועדיין לא אישר העברה בערב האחרון.
 * @returns {{ session: object, rows: object[] } | null}
 */
export function transferConfirmPrompt(sessions, viewerName, aliases = DEFAULT_ALIASES) {
  const latest = latestNightConfirmations(sessions);
  if (!latest || !viewerName) return null;
  const rows = unconfirmedOwnTransfers(latest.session, viewerName, aliases);
  if (!rows.length) return null;
  return { session: latest.session, rows };
}

/**
 * חלון למי שפותח שוב ועדיין לא אישר שקיבל כסף בערב האחרון.
 * @returns {{ session: object, rows: object[] } | null}
 */
export function receiptConfirmPrompt(sessions, viewerName, aliases = DEFAULT_ALIASES) {
  const latest = latestNightConfirmations(sessions);
  if (!latest || !viewerName) return null;
  const rows = unconfirmedOwnReceipts(latest.session, viewerName, aliases);
  if (!rows.length) return null;
  return { session: latest.session, rows };
}
