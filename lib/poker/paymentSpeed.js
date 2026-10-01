/* המשלם המהיר — חישוב טהור מנתוני אישורי התשלום הקיימים.
   זמן פרסום החלוקה: settlementUpdatedAt כשיש, אחרת סיום הערב (endedAt).
   ערב בלי אף אחד מהם מדולג — לא ממציאים זמן פרסום.
   זמן סגירת העברה = אירוע האישור המוקדם ביותר שלה (שולם/התקבל). */

import { paymentPlan } from "../paymentTracking.js";
import { AL, canon, r2 } from "./helpers.js";

const HOUR_MS = 3600000;

function publishTimeMs(session) {
  const updated = session?.manualSettlement?.settlementUpdatedAt;
  if (updated) {
    const t = Date.parse(updated);
    if (Number.isFinite(t)) return t;
  }
  const ended = session?.endedAt;
  if (typeof ended === "number" && Number.isFinite(ended) && ended > 0) return ended;
  if (typeof ended === "string") {
    const t = Date.parse(ended);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** תצוגת משך תשלום בעברית: שעות מתחת ליממה, ימים מעל. */
export function formatPaymentDelay(hours) {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  if (hours < 1) return "פחות משעה";
  if (hours < 24) {
    const h = Math.round(hours * 10) / 10;
    return Number.isInteger(h) ? `${h} שעות` : `${h.toFixed(1)} שעות`;
  }
  const d = Math.round((hours / 24) * 10) / 10;
  return Number.isInteger(d) ? `${d} ימים` : `${d.toFixed(1)} ימים`;
}

/**
 * @returns {{
 *   rows: Array<{ name: string, medianHours: number, samples: number, fastestHours: number }>,
 *   fastest: object | null, slowest: object | null,
 *   nightsUsed: number, totalSamples: number,
 *   byName: Object<string, object>,
 * }}
 */
export function computePaymentSpeed(db, { minSamples = 2 } = {}) {
  const empty = { rows: [], fastest: null, slowest: null, nightsUsed: 0, totalSamples: 0, byName: {} };
  if (!db?.sessions?.length) return empty;
  const A = AL(db);
  const delays = {};
  let nightsUsed = 0;
  let totalSamples = 0;

  for (const session of db.sessions) {
    const publishedAt = publishTimeMs(session);
    if (publishedAt == null) continue;
    let plan;
    try {
      plan = paymentPlan(session);
    } catch {
      continue;
    }
    const { transfers, confirmations } = plan;
    if (!transfers.length || !confirmations.length) continue;
    let used = false;
    transfers.forEach((transfer, index) => {
      const payer = canon(transfer.from || "", A);
      if (!payer) return;
      let earliest = null;
      for (const event of confirmations) {
        if (Number(event?.index) !== index) continue;
        const at = Date.parse(event?.at || "");
        if (!Number.isFinite(at) || at < publishedAt) continue;
        if (earliest == null || at < earliest) earliest = at;
      }
      if (earliest == null) return;
      (delays[payer] = delays[payer] || []).push((earliest - publishedAt) / HOUR_MS);
      totalSamples += 1;
      used = true;
    });
    if (used) nightsUsed += 1;
  }

  const rows = Object.entries(delays)
    .map(([name, arr]) => ({
      name,
      medianHours: Math.round(median(arr) * 10) / 10,
      samples: arr.length,
      fastestHours: Math.round(Math.min(...arr) * 10) / 10,
    }))
    .sort((a, b) => a.medianHours - b.medianHours || b.samples - a.samples || a.name.localeCompare(b.name, "he"));

  const eligible = rows.filter((r) => r.samples >= minSamples);
  const byName = {};
  for (const row of rows) byName[row.name] = row;

  return {
    rows,
    fastest: eligible[0] || null,
    slowest: eligible.length ? eligible[eligible.length - 1] : null,
    nightsUsed,
    totalSamples,
    byName,
  };
}

/** שורת מהירות לשחקן אחד — null כשאין לו אישורי תשלום מתוזמנים. */
export function paymentSpeedForPlayer(db, playerName) {
  if (!db || !playerName) return null;
  const A = AL(db);
  const name = canon(playerName, A);
  return computePaymentSpeed(db, { minSamples: 1 }).byName[name] || null;
}
