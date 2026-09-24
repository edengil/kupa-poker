import { canon, DEFAULT_ALIASES } from "./poker/helpers.js";
import { COUPLES } from "./settlement.js";

const ADMIN_EMAILS = new Set(["edengil94@gmail.com", "eden.gil@grunitech.com"]);

/** המנהל — לפי מייל או לפי השם בטבלה. */
export function isGroupAdmin({ email, name, aliases = DEFAULT_ALIASES } = {}) {
  const mail = String(email || "").trim().toLowerCase();
  if (mail && ADMIN_EMAILS.has(mail)) return true;
  if (!name) return false;
  return canon(name, aliases) === "עדן גיל";
}

/** בן/בת הזוג הקנוני, או null. */
export function couplePartner(name, aliases = DEFAULT_ALIASES) {
  if (!name) return null;
  const me = canon(name, aliases);
  for (const [a, b] of COUPLES) {
    if (me === a) return b;
    if (me === b) return a;
  }
  return null;
}

/**
 * מי רשאי לסמן העברה כשולמה.
 * כולם רואים את הסטטוס. סימון: המעביר, בן/בת זוגו, או המנהל.
 */
export function canMarkTransfer({
  viewerName,
  transfer,
  isAdmin = false,
  aliases = DEFAULT_ALIASES,
} = {}) {
  if (isAdmin) return true;
  if (!viewerName || !transfer?.from) return false;
  const me = canon(viewerName, aliases);
  const from = canon(transfer.from, aliases);
  if (me === from) return true;
  const partner = couplePartner(me, aliases);
  return partner != null && partner === from;
}
