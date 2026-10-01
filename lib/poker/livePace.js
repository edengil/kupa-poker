/* קצב הערב בלייב — חישוב טהור.
   פעולות לשעה מיומן הפעולות החי; סיום משוער = התחלה + משך ערב ממוצע
   מההיסטוריה (אם יש). בלי היסטוריה — אין שעת סיום משוערת, לא ממציאים. */

const HOUR_MS = 3600000;

/**
 * @param {{ startedAt: number|null, actionCount: number, now: number, avgNightMs: number|null }} input
 * @returns {null | { actionsPerHour: number, actionCount: number, elapsedMs: number,
 *   projectedEnd: number|null, remainingMs: number|null }}
 */
export function computeLivePace({ startedAt, actionCount = 0, now = Date.now(), avgNightMs = null } = {}) {
  if (!startedAt || !Number.isFinite(startedAt)) return null;
  const elapsedMs = Math.max(0, now - startedAt);
  if (elapsedMs < 60000) return null;
  const hours = elapsedMs / HOUR_MS;
  const actionsPerHour = Math.round((actionCount / hours) * 10) / 10;
  const hasAvg = typeof avgNightMs === "number" && Number.isFinite(avgNightMs) && avgNightMs > 0;
  const projectedEnd = hasAvg ? startedAt + avgNightMs : null;
  return {
    actionsPerHour,
    actionCount,
    elapsedMs,
    projectedEnd,
    remainingMs: projectedEnd != null ? projectedEnd - now : null,
  };
}

/** משך ערב ממוצע מההיסטוריה — רק ערבים עם התחלה וסיום תקינים. */
export function averageNightMs(sessions) {
  const durations = [];
  for (const s of sessions || []) {
    const start = typeof s?.startedAt === "number" ? s.startedAt : null;
    const end = typeof s?.endedAt === "number" ? s.endedAt : null;
    if (start && end && end > start) durations.push(end - start);
  }
  if (!durations.length) return null;
  durations.sort((a, b) => a - b);
  return durations[Math.floor(durations.length / 2)];
}

/** שעת סיום משוערת בפורמט HH:MM. */
export function formatClock(ts) {
  if (ts == null || !Number.isFinite(ts)) return null;
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
