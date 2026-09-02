/* מיזוג מצב לייב בין האפליקציה לבוט בוואטסאפ.
   בלי זה, flush מקומי (debounce / מעבר לרקע) היה דורס יציאות
   שהבוט כבר כתב לשרת — והאפליקציה נשארה בלי ג'יטונים. */

import { DEFAULT_ALIASES } from "../components/poker/helpers.js";

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

const filledCashout = (v) => v !== "" && v != null;

function canonMaybeName(name, aliases) {
  if (name == null || name === "") return name ?? null;
  return livePlayerKey(name, aliases);
}

/** כינוי → שם מלא, כדי ש"אופיר" ו"אופיר סנה" ייחשבו אותו שחקן. */
export function livePlayerKey(name, aliases = DEFAULT_ALIASES) {
  const n = String(name || "").trim();
  return (aliases && aliases[n]) || n;
}

function collapsePlayers(players, aliases) {
  const map = new Map();
  const order = [];
  for (const p of players || []) {
    const key = livePlayerKey(p.name, aliases);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...p, name: key });
      order.push(key);
      continue;
    }
    map.set(key, {
      ...prev,
      ...p,
      name: key,
      buyin: Math.max(+prev.buyin || 0, +p.buyin || 0),
      cashout: filledCashout(p.cashout) ? (p.cashout ?? "") : (prev.cashout ?? ""),
      tipsGiven: Math.max(+prev.tipsGiven || 0, +p.tipsGiven || 0),
      buyinEvents: pickBuyinEvents(prev, p),
    });
  }
  return { map, order };
}

/**
 * ממזג לייב מקומי עם מה שבשרת.
 * כשהבוט מקדים (applied חדשים) — cashout/closing/pending מהשרת;
 * buyin נשאר המקסימום כדי לא לאבד כניסה שעוד ב-debounce.
 * שחקנים ממוזגים לפי כינוי, לא לפי מחרוזת השם הגולמית.
 */
export function mergeLiveStates(local, remote, aliases = DEFAULT_ALIASES) {
  if (!remote) return local ?? null;
  if (!local) {
    const { map, order } = collapsePlayers(remote.players, aliases);
    return { ...remote, players: order.map((k) => map.get(k)) };
  }

  const botAhead = remoteLiveAhead(local, remote);
  const localC = collapsePlayers(local.players, aliases);
  const remoteC = collapsePlayers(remote.players, aliases);
  const keys = new Set([...localC.map.keys(), ...remoteC.map.keys()]);

  const order = (remoteC.order.length ? remoteC.order : localC.order).slice();
  for (const k of keys) if (!order.includes(k)) order.push(k);

  const mergedPlayers = [];
  for (const key of keys) {
    const lp = localC.map.get(key);
    const rp = remoteC.map.get(key);
    if (lp && rp) {
      mergedPlayers.push({
        ...rp,
        ...lp,
        name: key,
        buyin: Math.max(+lp.buyin || 0, +rp.buyin || 0),
        cashout: botAhead ? (rp.cashout ?? "") : (lp.cashout ?? ""),
        tipsGiven: Math.max(+lp.tipsGiven || 0, +rp.tipsGiven || 0),
        buyinEvents: pickBuyinEvents(lp, rp),
      });
    } else {
      mergedPlayers.push({ ...(lp || rp), name: key });
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

  const canonList = (list) =>
    (list || []).map((item) => {
      if (typeof item === "string") return livePlayerKey(item, aliases);
      if (item && typeof item === "object" && item.name) {
        return { ...item, name: livePlayerKey(item.name, aliases) };
      }
      return item;
    });

  return {
    ...local,
    ...remote,
    players: mergedPlayers,
    applied: { ...(local.applied || {}), ...(remote.applied || {}) },
    pending: botAhead
      ? canonMaybeName(remote.pending, aliases)
      : canonMaybeName(local.pending, aliases) ?? canonMaybeName(remote.pending, aliases) ?? null,
    closing: botAhead ? !!remote.closing : !!(local.closing || remote.closing),
    pendingApprovals: botAhead
      ? canonList(remote.pendingApprovals || [])
      : canonList(
          remote.pendingApprovals?.length ? remote.pendingApprovals : local.pendingApprovals || []
        ),
    approvedNames: [
      ...new Set(
        canonList([...(local.approvedNames || []), ...(remote.approvedNames || [])])
      ),
    ],
    tips:
      remoteTips.length >= localTips.length ? canonList(remoteTips) : canonList(localTips),
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

/**
 * לפני flush מקומי: אם הבוט כבר כתב applied חדשים, מאמצים את השרת
 * ומסמנים adopted כדי שהמסך יעלה מחדש (אחרת React נשאר עם יצא ריק).
 */
export function adoptRemoteLiveOnFlush(local, remote, aliases = DEFAULT_ALIASES) {
  if (!local) return { live: remote ?? null, adopted: !!remote };
  if (!remote) return { live: local, adopted: false };
  if (liveFingerprint(local) === liveFingerprint(remote)) {
    return { live: local, adopted: false };
  }
  if (remoteLiveAhead(local, remote)) {
    return { live: mergeLiveStates(local, remote, aliases), adopted: true };
  }
  return { live: local, adopted: false };
}
