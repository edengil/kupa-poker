/* מילוי זוגי (couple stack-help) — כשבן/בת זוג מעבירים ג'יטונים מהערימה
   שלהם לשותף במקום כניסה חדשה. לא לחשוף בקבוצה; רק באפליקציית המנהל.
   השם בתצוגה: "מילוי זוגי" — לא תרומה/תורם. */

import { COUPLES } from "../../lib/settlement.js";
import { r2 } from "./helpers.js";
import { MONTHS } from "./format.js";

const FILL_CHIPS = 30;

/** כינויים קצרים כמו ב-settlement */
const COUPLE_ALIASES = {
  עדן: "עדן גיל",
  אורן: "אורן גיל",
  דור: "דור לירז",
  "עדן ל": "עדן לירז",
  "עדן של דור": "עדן לירז",
  "עדן גורשומוב": "עדן לירז",
  "עדן גושמרוב": "עדן לירז",
};

export function canonCoupleName(name) {
  const n = String(name || "").trim();
  return COUPLE_ALIASES[n] || n;
}

/** מחזיר את בן/בת הזוג אם השם בזוג ידוע, אחרת null */
export function partnerOf(name) {
  const n = canonCoupleName(name);
  for (const [a, b] of COUPLES) {
    if (n === a) return b;
    if (n === b) return a;
  }
  return null;
}

/** מזהה זוג יציב (שני השמות ממוינים) */
export function coupleKey(a, b) {
  return [canonCoupleName(a), canonCoupleName(b)].sort((x, y) => x.localeCompare(y, "he")).join("|");
}

export function coupleLabel(a, b) {
  const [x, y] = [canonCoupleName(a), canonCoupleName(b)].sort((p, q) => p.localeCompare(q, "he"));
  return `${x} ↔ ${y}`;
}

/**
 * רושם מילוי זוגי: from מעביר chips ל-to.
 * אם יש cashout מספרי — מעדכן את הערימות; אחרת stackAdj.
 * UX מומלץ ב-LiveTab: לחיצה ארוכה על שם בן/בת זוג → מילוי 30.
 */
export function applyCoupleFill(players, fromName, chips = FILL_CHIPS, at = Date.now()) {
  const fromCanon = canonCoupleName(fromName);
  const toName = partnerOf(fromCanon);
  if (!toName) return { ok: false, reason: "not_couple" };

  const fromIdx = players.findIndex((p) => canonCoupleName(p.name) === fromCanon);
  const toIdx = players.findIndex((p) => canonCoupleName(p.name) === toName);
  if (fromIdx === -1 || toIdx === -1) return { ok: false, reason: "missing_partner" };

  const next = players.map((p) => ({ ...p }));
  const from = next[fromIdx];
  const to = next[toIdx];
  const amt = Math.max(0, +chips || FILL_CHIPS);

  const adjCash = (p, delta) => {
    if (p.cashout !== "" && p.cashout != null) {
      const cur = +p.cashout || 0;
      return { ...p, cashout: String(Math.max(0, cur + delta)) };
    }
    return { ...p, stackAdj: r2((+p.stackAdj || 0) + delta) };
  };

  next[fromIdx] = adjCash(from, -amt);
  next[toIdx] = adjCash(to, amt);

  const event = {
    couple: [fromCanon, toName].sort((a, b) => a.localeCompare(b, "he")),
    from: from.name,
    to: to.name,
    chips: amt,
    at,
  };
  return { ok: true, players: next, event };
}

export const DEFAULT_FILL_CHIPS = FILL_CHIPS;

/** שיא מילוי זוגי לחודש / כל הזמנים */
export function computeCoupleFillRecords(db) {
  const sessions = [...(db.sessions || [])].sort((a, b) => a.iso.localeCompare(b.iso));
  const fills = [];
  for (const s of sessions) {
    for (const f of s.coupleFills || []) {
      fills.push({ ...f, d: s.d, mo: s.mo, y: s.y, iso: s.iso });
    }
  }
  if (!fills.length) return null;

  const last = sessions[sessions.length - 1];
  const monthFills = fills.filter((f) => f.y === last.y && f.mo === last.mo);

  const rank = (list) => {
    const acc = {};
    for (const f of list) {
      const key = coupleKey(f.from, f.to);
      const cur = acc[key] || { key, label: coupleLabel(f.from, f.to), chips: 0, count: 0 };
      cur.chips += +f.chips || 0;
      cur.count += 1;
      acc[key] = cur;
    }
    return Object.values(acc).sort((a, b) => b.chips - a.chips || b.count - a.count);
  };

  const month = rank(monthFills);
  const all = rank(fills);

  return {
    monthLabel: `${MONTHS[last.mo - 1]} ${last.y}`,
    monthTop: month[0] || null,
    monthTop2: month[1] || null,
    allTop: all[0] || null,
    // לא מייצאים ל-WhatsApp — רגיש
  };
}

/** כמה מילויים נרשמו לשחקן בערב הנוכחי (לסימון עדין ב-UI) */
export function fillCountFor(coupleFills, name) {
  const n = canonCoupleName(name);
  return (coupleFills || []).filter(
    (f) => canonCoupleName(f.from) === n || canonCoupleName(f.to) === n
  ).length;
}
