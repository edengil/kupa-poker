import { canon, DEFAULT_ALIASES } from "./poker/helpers.js";
import { couplePartner } from "./paymentAccess.js";
import { latestSession } from "./lastSession.js";
import { paymentPlan } from "./paymentTracking.js";

/** שורות אישור מתוך תוכנית ההעברות של הערב — אותו מקור כמו «שולם» בכרטיס החלוקה. */
function confirmationRows(session) {
  const { transfers, paid } = paymentPlan(session);
  return transfers.map((transfer, index) => ({
    index,
    from: transfer.from,
    to: transfer.to,
    amount: transfer.amount,
    manual: !!transfer.manual,
    confirmed: !!paid[index],
  }));
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
  return {
    session,
    rows,
    confirmedCount,
    pendingCount: rows.length - confirmedCount,
  };
}

function ownsTransfer(from, viewerName, aliases) {
  const me = canon(viewerName, aliases);
  if (!me) return false;
  const payer = canon(from, aliases);
  if (payer === me) return true;
  const partner = couplePartner(me, aliases);
  return partner != null && payer === partner;
}

/** העברות של הצופה (או בן/בת הזוג) שעדיין לא סומנו כשולמו. */
export function unconfirmedOwnTransfers(session, viewerName, aliases = DEFAULT_ALIASES) {
  if (!session || !viewerName) return [];
  return confirmationRows(session).filter(
    (row) => !row.confirmed && ownsTransfer(row.from, viewerName, aliases)
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
