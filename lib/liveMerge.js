/* מיזוג מצב לייב בין האפליקציה לבוט בוואטסאפ.
   בלי זה, flush מקומי (debounce / מעבר לרקע) היה דורס יציאות
   שהבוט כבר כתב לשרת — והאפליקציה נשארה בלי ג'יטונים. */

/** טביעת אצבע בלי ts — שינוי חותמת זמן לא נחשב שינוי אמיתי. */
export function liveFingerprint(live) {
  if (live == null) return "";
  let obj = live;
  if (typeof live === "string") {
    if (live === "" || live === "null") return "";
    try {
      obj = JSON.parse(live);
    } catch {
      return live;
    }
  }
  if (obj && typeof obj === "object") {
    const { ts: _ts, ...rest } = obj;
    return JSON.stringify(rest);
  }
  return JSON.stringify(obj);
}

function appliedKeys(live) {
  return Object.keys(live?.applied || {});
}

/** השרת (בוט) מקדים אם יש לו מזהי הודעה שעוד לא אצלנו. */
export function remoteLiveAhead(local, remote) {
  if (!remote) return false;
  if (!local) return true;
  const localIds = new Set(appliedKeys(local));
  return appliedKeys(remote).some((id) => !localIds.has(id));
}

function pickBuyinEvents(a, b) {
  const ae = Array.isArray(a?.buyinEvents) ? a.buyinEvents : [];
  const be = Array.isArray(b?.buyinEvents) ? b.buyinEvents : [];
  if (ae.length >= be.length) return ae.length ? ae : be;
  return be;
}

/**
 * ממזג לייב מקומי עם מה שבשרת.
 * כשהבוט מקדים (applied חדשים) — cashout/closing/pending מהשרת;
 * buyin נשאר המקסימום כדי לא לאבד כניסה שעוד ב-debounce.
 */
export function mergeLiveStates(local, remote) {
  if (!remote) return local ?? null;
  if (!local) return remote;

  const botAhead = remoteLiveAhead(local, remote);
  const localPlayers = Array.isArray(local.players) ? local.players : [];
  const remotePlayers = Array.isArray(remote.players) ? remote.players : [];
  const byLocal = new Map(localPlayers.map((p) => [p.name, p]));
  const byRemote = new Map(remotePlayers.map((p) => [p.name, p]));
  const names = new Set([...byLocal.keys(), ...byRemote.keys()]);

  const order = (remotePlayers.length ? remotePlayers : localPlayers).map((p) => p.name);
  const mergedPlayers = [];
  for (const name of names) {
    const lp = byLocal.get(name);
    const rp = byRemote.get(name);
    if (lp && rp) {
      mergedPlayers.push({
        ...rp,
        ...lp,
        name,
        buyin: Math.max(+lp.buyin || 0, +rp.buyin || 0),
        cashout: botAhead ? (rp.cashout ?? "") : (lp.cashout ?? ""),
        tipsGiven: Math.max(+lp.tipsGiven || 0, +rp.tipsGiven || 0),
        buyinEvents: pickBuyinEvents(lp, rp),
      });
    } else {
      mergedPlayers.push(lp || rp);
    }
  }
  mergedPlayers.sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const localTips = Array.isArray(local.tips) ? local.tips : [];
  const remoteTips = Array.isArray(remote.tips) ? remote.tips : [];
  const localFills = Array.isArray(local.coupleFills) ? local.coupleFills : [];
  const remoteFills = Array.isArray(remote.coupleFills) ? remote.coupleFills : [];

  return {
    ...local,
    ...remote,
    players: mergedPlayers,
    applied: { ...(local.applied || {}), ...(remote.applied || {}) },
    pending: botAhead ? (remote.pending ?? null) : (local.pending ?? remote.pending ?? null),
    closing: botAhead ? !!remote.closing : !!(local.closing || remote.closing),
    pendingApprovals: botAhead
      ? [...(remote.pendingApprovals || [])]
      : (remote.pendingApprovals?.length
          ? [...remote.pendingApprovals]
          : [...(local.pendingApprovals || [])]),
    approvedNames: [
      ...new Set([...(local.approvedNames || []), ...(remote.approvedNames || [])]),
    ],
    tips: remoteTips.length >= localTips.length ? remoteTips : localTips,
    /* מילוי זוגי רק מהאפליקציה — לא לדרוס מהשרת ריק */
    coupleFills: localFills.length >= remoteFills.length ? localFills : remoteFills,
    entriesCount:
      remote.entriesCount !== "" && remote.entriesCount != null
        ? remote.entriesCount
        : local.entriesCount,
    startedAt: local.startedAt || remote.startedAt || null,
    addAmt: local.addAmt || remote.addAmt || 50,
    tipComplimentBag: Array.isArray(remote.tipComplimentBag)
      ? remote.tipComplimentBag
      : local.tipComplimentBag,
    tipComplimentLast: remote.tipComplimentLast ?? local.tipComplimentLast ?? null,
  };
}
