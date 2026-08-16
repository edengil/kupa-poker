/* מילוי זוגי (couple stack-help) — כשבן/בת זוג מעבירים ג'יטונים מהערימה
   שלהם לשותף במקום כניסה חדשה. לא לחשוף בקבוצה; רק באפליקציית המנהל.
   השם בתצוגה: "מילוי זוגי" — לא תרומה/תורם.
   כל פעולה = DEFAULT_FILL_CHIPS (30) ג'יטונים, לא +1. */

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

/** תווית כיוון ברורה: נותן → מקבל */
export function fillDirectionLabel(from, to) {
  return `${shortCoupleName(from)} → ${shortCoupleName(to)}`;
}

/** שם קצר לתצוגה עדינה (שם פרטי אם יש משפחה) */
export function shortCoupleName(name) {
  const n = canonCoupleName(name);
  const sp = n.indexOf(" ");
  return sp > 0 ? n.slice(0, sp) : n;
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

/** מילויים של הזוג של השחקן בערב הנוכחי */
export function fillsForCouple(coupleFills, name) {
  const partner = partnerOf(name);
  if (!partner) return [];
  const key = coupleKey(name, partner);
  return (coupleFills || []).filter((f) => coupleKey(f.from, f.to) === key);
}

/**
 * סיכום לפי כיוון לערב: [{ from, to, label, chips, count, total, lastAt }]
 * count = מספר אירועי מילוי (כל אחד DEFAULT_FILL_CHIPS אלא אם צוין אחרת).
 */
export function summarizeCoupleFills(coupleFills, name) {
  const list = fillsForCouple(coupleFills, name);
  const acc = {};
  for (const f of list) {
    const from = f.from;
    const to = f.to;
    const k = `${canonCoupleName(from)}|${canonCoupleName(to)}`;
    const chips = +f.chips || FILL_CHIPS;
    const cur = acc[k] || {
      from,
      to,
      label: fillDirectionLabel(from, to),
      chips,
      count: 0,
      total: 0,
      lastAt: 0,
      ats: [],
    };
    cur.count += 1;
    cur.total += chips;
    cur.chips = chips;
    if (f.at) {
      cur.ats.push(f.at);
      if (f.at > cur.lastAt) cur.lastAt = f.at;
    }
    acc[k] = cur;
  }
  return Object.values(acc).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
}

/** כמה אירועי מילוי נרשמו לזוג של השחקן בערב (לא סכום ג'יטונים) */
export function fillCountFor(coupleFills, name) {
  return fillsForCouple(coupleFills, name).length;
}

function fmtFillTime(at) {
  if (!at) return "";
  try {
    return new Date(at).toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** שורת תצוגה עדינה ללייב, למשל: "אורן → עדן · 30×2 · 21:04" */
export function formatFillBadge(summaryRow) {
  if (!summaryRow) return "";
  const { label, chips, count, lastAt } = summaryRow;
  const amt = chips || FILL_CHIPS;
  const body = count > 1 ? `${label} · ${amt}×${count}` : `${label} · ${amt}`;
  const t = fmtFillTime(lastAt);
  return t ? `${body} · ${t}` : body;
}

/** שיא מילוי זוגי לחודש / כל הזמנים — לפי כיוון (נותן→מקבל) וסך ג'יטונים */
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
      const from = f.from;
      const to = f.to;
      const key = `${canonCoupleName(from)}|${canonCoupleName(to)}`;
      const cur = acc[key] || {
        key,
        label: fillDirectionLabel(from, to),
        couple: coupleLabel(from, to),
        from,
        to,
        chips: 0,
        count: 0,
      };
      cur.chips += +f.chips || FILL_CHIPS;
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
    monthTop3: month[2] || null,
    allTop: all[0] || null,
    allTop2: all[1] || null,
    allTop3: all[2] || null,
    // לא מייצאים ל-WhatsApp — רגיש
  };
}
