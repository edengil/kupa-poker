/* לוח ריבאיים חי — חישוב טהור מתוך שחקני הלייב.
   ריבאי = כל כניסה אחרי הראשונה. buyinEvents נשמר בלייב לכל הוספה. */

import { r2, canon } from "./helpers.js";

/**
 * @param players [{ name, buyin, buyinEvents?: [{ amount, at, total }] }]
 * @returns {{
 *   rows: Array<{ name: string, buyin: number, entries: number|null, rebuys: number|null }>,
 *   totalPot: number, totalRebuys: number, totalEntries: number,
 *   topRebuyer: object | null, knownEvents: boolean,
 * }}
 * entries/rebuys הם null כשאין buyinEvents לשחקן (אי אפשר לדעת מהעבר).
 */
export function computeLiveRebuys(players, aliases = {}) {
  const rows = [];
  let totalPot = 0;
  let totalRebuys = 0;
  let totalEntries = 0;
  let knownEvents = false;

  for (const p of players || []) {
    const buyin = r2(+p?.buyin || 0);
    const events = Array.isArray(p?.buyinEvents) ? p.buyinEvents : null;
    totalPot = r2(totalPot + buyin);
    if (!p?.name && buyin <= 0) continue;
    const name = canon(p?.name || "", aliases);
    let entries = null;
    let rebuys = null;
    if (events && events.length) {
      knownEvents = true;
      entries = events.length;
      rebuys = Math.max(0, entries - 1);
      totalRebuys += rebuys;
      totalEntries += entries;
    }
    rows.push({ name, buyin, entries, rebuys });
  }

  rows.sort(
    (a, b) =>
      (b.rebuys ?? -1) - (a.rebuys ?? -1) ||
      b.buyin - a.buyin ||
      a.name.localeCompare(b.name, "he")
  );

  const topRebuyer = rows.find((r) => (r.rebuys ?? 0) > 0) || null;
  return { rows, totalPot, totalRebuys, totalEntries, topRebuyer, knownEvents };
}
