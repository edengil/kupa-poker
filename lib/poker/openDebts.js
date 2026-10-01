/* חובות פתוחים חוצה־ערבים — חישוב טהור ללוח המנהל.
   חוב פתוח = העברה בחלוקה שאף צד לא סגר (לא «שולם» ולא «התקבל»),
   בדיוק כמו בתזכורות התשלום. הגיל נמדד מתאריך הערב עד היום. */

import { paymentPlan } from "../paymentTracking.js";
import { AL, canon, r2 } from "./helpers.js";

const DAY_MS = 86400000;

function openTransfersOf(session) {
  let plan;
  try {
    plan = paymentPlan(session);
  } catch {
    return [];
  }
  const { transfers, paid, received } = plan;
  return transfers
    .map((t, index) => ({ ...t, index }))
    .filter((t) => !paid[t.index] && !received[t.index]);
}

/**
 * @returns {{
 *   debtors: Array<{ name: string, total: number, nights: number, oldestIso: string, ageDays: number, transfers: number }>,
 *   nights: Array<{ id: string, iso: string, ageDays: number, openCount: number, total: number, isLatest: boolean }>,
 *   totalOpen: number,
 * }}
 */
export function computeOpenDebts(db, { now = Date.now() } = {}) {
  const empty = { debtors: [], nights: [], totalOpen: 0 };
  const sessions = [...(db?.sessions || [])].filter((s) => s?.id && s?.iso);
  if (!sessions.length) return empty;
  const A = AL(db);
  sessions.sort((a, b) => a.iso.localeCompare(b.iso));
  const latestId = sessions[sessions.length - 1]?.id;

  const byName = {};
  const nights = [];
  let totalOpen = 0;

  for (const session of sessions) {
    const open = openTransfersOf(session);
    if (!open.length) continue;
    const nightTotal = r2(open.reduce((s, t) => s + (+t.amount || 0), 0));
    const ageDays = Math.max(
      0,
      Math.floor((now - Date.parse(`${session.iso}T12:00:00Z`)) / DAY_MS)
    );
    nights.push({
      id: session.id,
      iso: session.iso,
      ageDays,
      openCount: open.length,
      total: nightTotal,
      isLatest: session.id === latestId,
    });
    totalOpen = r2(totalOpen + nightTotal);
    for (const t of open) {
      const name = canon(t.from || "", A);
      if (!name) continue;
      const cur = (byName[name] = byName[name] || {
        name,
        total: 0,
        nights: 0,
        oldestIso: session.iso,
        ageDays,
        transfers: 0,
      });
      cur.total = r2(cur.total + (+t.amount || 0));
      cur.transfers += 1;
    }
    for (const name of new Set(open.map((t) => canon(t.from || "", A)).filter(Boolean))) {
      byName[name].nights += 1;
      if (session.iso < byName[name].oldestIso) {
        byName[name].oldestIso = session.iso;
        byName[name].ageDays = ageDays;
      }
    }
  }

  const debtors = Object.values(byName).sort(
    (a, b) => b.ageDays - a.ageDays || b.total - a.total || a.name.localeCompare(b.name, "he")
  );
  nights.sort((a, b) => a.iso.localeCompare(b.iso));

  return { debtors, nights, totalOpen };
}
