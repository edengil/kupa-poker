/* לוח פערים למנהל — נתונים טהורים בלבד (בלי המצאות). */
import { AL, canon } from "./helpers.js";
import { playerBalanceBreakdown } from "./totals.js";
import { CHAT_SPAN_META } from "./chatNightSpans.js";

/** פער מינימלי (₪) כדי להיחשב «גדול» בלוח. */
export const DEFAULT_LARGE_GAP = 50;

/**
 * שחקנים עם פער גדול בין סכום ערבים לסיכום שנתי רשמי בטבלה.
 * @returns {{ name, sessionsNet, tableNet, gap, absGap, adjustments }[]}
 */
export function largePlayerGaps(db, { minAbsGap = DEFAULT_LARGE_GAP } = {}) {
  const A = AL(db);
  const names = new Set();
  for (const s of db?.sessions || []) {
    for (const e of s.entries || []) names.add(canon(e.name, A));
  }
  for (const row of db?.yearly || []) {
    for (const e of row.entries || []) names.add(canon(e.name, A));
  }
  const out = [];
  for (const name of names) {
    const b = playerBalanceBreakdown(db, name);
    const absGap = Math.abs(b.gap);
    if (absGap + 1e-9 < minAbsGap) continue;
    out.push({
      name: b.name,
      sessionsNet: b.sessionsNet,
      tableNet: b.tableNet,
      gap: b.gap,
      absGap,
      adjustments: b.adjustments,
    });
  }
  out.sort((a, b) => b.absGap - a.absGap || a.name.localeCompare(b.name, "he"));
  return out;
}

/**
 * לילות מהצ'אט עם התחלה בלי סיכום — רק מ־CHAT_SPAN_META (לא ממציאים).
 * @returns {{ iso, startedAt, lastBuyinAt, hasSession }[]}
 */
export function nightsWithoutSummary({
  meta = CHAT_SPAN_META,
  sessions = [],
  limit = null,
} = {}) {
  const sessionIsos = new Set((sessions || []).map((s) => s?.iso).filter(Boolean));
  const raw = Array.isArray(meta?.startOnlyNights) ? meta.startOnlyNights : [];
  const list = raw
    .filter((n) => n && n.iso && n.s != null)
    .map((n) => ({
      iso: n.iso,
      startedAt: n.s,
      lastBuyinAt: n.lb ?? null,
      hasSession: sessionIsos.has(n.iso),
    }))
    .sort((a, b) => b.iso.localeCompare(a.iso));
  if (limit == null || limit < 0) return list;
  return list.slice(0, limit);
}

/**
 * כינויים חשודים בקלות: זהות, שרשרת, ריק.
 * בודקים כינויי משתמש בלבד (לא ברירות מחדל).
 * @returns {{ kind, from, to, via?, note }[]}
 */
export function suspiciousAliases(db) {
  const user = db?.aliases || {};
  const all = AL(db);
  const issues = [];
  for (const [fromRaw, toRaw] of Object.entries(user)) {
    const from = String(fromRaw || "").trim();
    const to = String(toRaw || "").trim();
    if (!from || !to) {
      issues.push({
        kind: "empty",
        from: fromRaw,
        to: toRaw,
        note: "כינוי ריק — כדאי למחוק או להשלים",
      });
      continue;
    }
    if (from === to) {
      issues.push({
        kind: "identity",
        from,
        to,
        note: "הכינוי זהה לשם — לא משנה כלום",
      });
    }
    const next = all[to];
    if (next && next !== to) {
      issues.push({
        kind: "chain",
        from,
        to,
        via: next,
        note: `שרשרת: «${from}» ← «${to}» ← «${next}» — עדיף ישירות ל־«${next}»`,
      });
    }
  }
  return issues;
}

/**
 * דוח מאוחד ללוח הפערים.
 */
export function buildGapsReport(db, opts = {}) {
  const minAbsGap = opts.minAbsGap ?? DEFAULT_LARGE_GAP;
  const nightLimit = opts.nightLimit ?? 20;
  const meta = opts.meta ?? CHAT_SPAN_META;
  const playerGaps = largePlayerGaps(db, { minAbsGap });
  const openNights = nightsWithoutSummary({
    meta,
    sessions: db?.sessions || [],
    limit: nightLimit,
  });
  const openNightsTotal = Array.isArray(meta?.startOnlyNights)
    ? meta.startOnlyNights.length
    : openNights.length;
  const aliases = suspiciousAliases(db);
  return {
    playerGaps,
    openNights,
    openNightsTotal,
    aliases,
    hasItems: playerGaps.length > 0 || openNightsTotal > 0 || aliases.length > 0,
  };
}
