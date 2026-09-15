/**
 * מיזוג data לפני flush — מונע דריסת ערבים שקיימים רק בשרת
 * כשמטמון מקומי ישן נשמר אחרי עריכה (למשל סימון «שולם»).
 */

function sessionScore(s) {
  if (!s || typeof s !== "object") return 0;
  let score = 0;
  if (s.payments) score += 100;
  score += Math.min((s.entries || []).length, 50);
  score += Number(s.endedAt) > 0 ? 10 : 0;
  if (s.manualSettlement) score += 5;
  if (s.tips?.length) score += 3;
  return score;
}

/** אותו id — מעדיפים את העותק העשיר יותר; בתיקו — local (כתיבה נוכחית). */
export function preferSession(remote, local) {
  if (!remote) return local;
  if (!local) return remote;
  const rs = sessionScore(remote);
  const ls = sessionScore(local);
  if (ls !== rs) return ls > rs ? local : remote;
  /* סימוני תשלום / עריכה ידנית מהמכשיר הנוכחי */
  if (local.payments && !remote.payments) return local;
  if (JSON.stringify(local.payments || null) !== JSON.stringify(remote.payments || null)) {
    return local;
  }
  if (local.manualSettlement && !remote.manualSettlement) return local;
  return local;
}

/**
 * @param {object} local — data שנשלח מהמכשיר
 * @param {object|null} remote — data נוכחי בשרת
 * @returns {{ data: object, adopted: boolean, rescuedIds: string[] }}
 */
export function mergeGroupDataOnFlush(local, remote) {
  if (!local || typeof local !== "object") {
    return { data: remote && typeof remote === "object" ? remote : local, adopted: Boolean(remote), rescuedIds: [] };
  }
  if (!remote || typeof remote !== "object") {
    return { data: local, adopted: false, rescuedIds: [] };
  }

  const deleted = new Set([
    ...(Array.isArray(remote.deletedSessionIds) ? remote.deletedSessionIds : []),
    ...(Array.isArray(local.deletedSessionIds) ? local.deletedSessionIds : []),
  ].map(String));

  const byId = new Map();
  for (const s of Array.isArray(remote.sessions) ? remote.sessions : []) {
    if (!s?.id || deleted.has(String(s.id))) continue;
    byId.set(String(s.id), s);
  }

  const rescuedIds = [];
  for (const s of Array.isArray(local.sessions) ? local.sessions : []) {
    if (!s?.id || deleted.has(String(s.id))) continue;
    const id = String(s.id);
    if (!byId.has(id)) {
      byId.set(id, s);
    } else {
      byId.set(id, preferSession(byId.get(id), s));
    }
  }

  /* ערבים שקיימים רק בשרת — חובה לשמור (זה מה שנמחק ב־15.9) */
  for (const s of Array.isArray(remote.sessions) ? remote.sessions : []) {
    if (!s?.id || deleted.has(String(s.id))) continue;
    const id = String(s.id);
    if (![...(Array.isArray(local.sessions) ? local.sessions : [])].some((x) => String(x?.id) === id)) {
      rescuedIds.push(id);
    }
  }

  const sessions = [...byId.values()].sort((a, b) =>
    String(a.iso || "").localeCompare(String(b.iso || ""))
  );

  const roster = [
    ...new Set([
      ...(Array.isArray(remote.roster) ? remote.roster : []),
      ...(Array.isArray(local.roster) ? local.roster : []),
    ]),
  ];

  return {
    data: {
      ...remote,
      ...local,
      sessions,
      roster,
      deletedSessionIds: [...deleted],
      aliases: { ...(remote.aliases || {}), ...(local.aliases || {}) },
    },
    adopted: rescuedIds.length > 0,
    rescuedIds,
  };
}
