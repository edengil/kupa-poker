/* מיזוג מצב לייב בין האפליקציה לבוט בוואטסאפ.
   בלי זה, flush מקומי (debounce / מעבר לרקע) היה דורס יציאות
   שהבוט כבר כתב לשרת — והאפליקציה נשארה בלי ג'יטונים. */

import { DEFAULT_ALIASES } from "./poker/helpers.js";
import { pickActionLog } from "./liveActionLog.js";

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

const r2 = (v) => Math.round(v * 100) / 100;

function tipKey(t, aliases) {
  if (t?.id != null && t.id !== "") return `id:${t.id}`;
  const name = livePlayerKey(t?.name, aliases);
  return `ev:${name}:${+t?.amount || 0}:${+t?.at || 0}`;
}

/** מאחד יומני טיפים לפי id (או שם+סכום+זמן) — לא מאבדים טיפים מאוחרים של הבוט. */
export function mergeTipLogs(a, b, aliases = DEFAULT_ALIASES) {
  const map = new Map();
  for (const t of [...(a || []), ...(b || [])]) {
    if (!t || typeof t !== "object") continue;
    const k = tipKey(t, aliases);
    if (map.has(k)) continue;
    map.set(k, { ...t, name: livePlayerKey(t.name, aliases) });
  }
  return [...map.values()].sort((x, y) => (+x.at || 0) - (+y.at || 0));
}

/** סכום טיפים לפי שחקן מיומן האירועים — כמו מצטבר הבוט, לא Math.max על טיפ ראשון. */
export function tipsSumByPlayer(tips, aliases = DEFAULT_ALIASES) {
  const sums = new Map();
  for (const t of tips || []) {
    const key = livePlayerKey(t?.name, aliases);
    if (!key) continue;
    sums.set(key, r2((sums.get(key) || 0) + (+t.amount || 0)));
  }
  return sums;
}

export function applyTipTotalsToPlayers(players, tips, aliases = DEFAULT_ALIASES) {
  const sums = tipsSumByPlayer(tips, aliases);
  return (players || []).map((p) => {
    const key = livePlayerKey(p.name, aliases);
    if (!sums.has(key)) return p;
    return { ...p, name: key, tipsGiven: sums.get(key) };
  });
}

/** מה שמוצג בלייב: סכום היומן אם יש אירועים לשחקן, אחרת tipsGiven. */
export function tipShownFor(player, tips, aliases = DEFAULT_ALIASES) {
  const key = livePlayerKey(player?.name, aliases);
  const sums = tipsSumByPlayer(tips, aliases);
  if (sums.has(key)) return sums.get(key);
  return +player?.tipsGiven || 0;
}

function playerTipTotal(player, tips, aliases) {
  return tipShownFor(player, tips, aliases);
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

/** שמות מלאים מיד — בלי לחכות להודעת וואטסאפ. */
export function canonLivePlayers(players, aliases = DEFAULT_ALIASES) {
  const { map, order } = collapsePlayers(players, aliases);
  return order.map((k) => map.get(k));
}

/**
 * הטאב המקומי מפגר אחרי השרת בטיפים (יומן אירועים ארוך יותר בשרת).
 */
export function tipLogBehind(local, remote, aliases = DEFAULT_ALIASES) {
  if (!remote) return false;
  if (!local) return true;
  const localTipCount = mergeTipLogs(local.tips, [], aliases).length;
  const unionTipCount = mergeTipLogs(local.tips, remote.tips, aliases).length;
  return unionTipCount > localTipCount;
}

/**
 * קנייה בשרת גבוהה יותר — אבל לא כשהמסך ערך אחרי השרת (ביטול / מינוס).
 * editedAt מתעדכן בכל שמירה מקומית מ-LiveTab.
 */
export function buyinBehind(local, remote, aliases = DEFAULT_ALIASES) {
  if (!remote) return false;
  if (!local) return true;
  const localEdit = +local.editedAt || 0;
  const remoteEdit = +remote.editedAt || 0;
  if (localEdit > remoteEdit) return false;

  const localC = collapsePlayers(local.players, aliases);
  const remoteC = collapsePlayers(remote.players, aliases);
  for (const [key, rp] of remoteC.map) {
    const lp = localC.map.get(key);
    if (!lp) continue;
    if ((+rp.buyin || 0) > (+lp.buyin || 0)) return true;
    if (playerTipTotal(rp, remote.tips, aliases) > playerTipTotal(lp, local.tips, aliases)) {
      return true;
    }
  }
  return false;
}

/**
 * הטאב המקומי מפגר אחרי השרת: קנייה/טיפ ישנים, או יומן טיפים חסר.
 * שחקן שקיים רק בשרת ≠ פיגור: זה יכול להיות הסרה מכוונת במסך (איקס / ביטול).
 * הוספות מהבוט מגיעות עם applied חדש → remoteLiveAhead.
 */
export function localLiveBehind(local, remote, aliases = DEFAULT_ALIASES) {
  if (!remote) return false;
  if (!local) return true;
  return tipLogBehind(local, remote, aliases) || buyinBehind(local, remote, aliases);
}

function shouldTakeRemoteCashout(local, remote, aliases) {
  /* טיפים חסרים לבד לא צריכים לדרוס יצא מקומי — רק בוט מקדים או קנייה ישנה. */
  return remoteLiveAhead(local, remote) || buyinBehind(local, remote, aliases);
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
    const tips = mergeTipLogs([], remote.tips, aliases);
    return {
      ...remote,
      tips,
      players: applyTipTotalsToPlayers(
        order.map((k) => map.get(k)),
        tips,
        aliases
      ),
    };
  }

  const takeRemoteCashout = shouldTakeRemoteCashout(local, remote, aliases);
  const botAhead = remoteLiveAhead(local, remote);
  const localEdit = +local.editedAt || 0;
  const remoteEdit = +remote.editedAt || 0;
  const localIsNewer = localEdit > remoteEdit;
  const remoteIsNewer = remoteEdit > localEdit;
  const preferRemoteEdits = takeRemoteCashout || remoteIsNewer;
  const localC = collapsePlayers(local.players, aliases);
  const remoteC = collapsePlayers(remote.players, aliases);
  const keys = new Set([...localC.map.keys(), ...remoteC.map.keys()]);

  /* כשהמסך מוביל (הסרה / עריכה מקומית) — שומרים על סדר השחקנים המקומי כדי לא לקפוץ. */
  const order = (
    preferRemoteEdits && remoteC.order.length
      ? remoteC.order
      : localC.order.length
        ? localC.order
        : remoteC.order
  ).slice();
  for (const k of keys) if (!order.includes(k)) order.push(k);

  const mergedPlayers = [];
  for (const key of keys) {
    const lp = localC.map.get(key);
    const rp = remoteC.map.get(key);
    if (lp && rp) {
      const buyin = botAhead
        ? Math.max(+lp.buyin || 0, +rp.buyin || 0)
        : localIsNewer
          ? +lp.buyin || 0
          : remoteIsNewer
            ? +rp.buyin || 0
            : Math.max(+lp.buyin || 0, +rp.buyin || 0);
      mergedPlayers.push({
        ...rp,
        ...lp,
        name: key,
        buyin,
        cashout: preferRemoteEdits ? (rp.cashout ?? "") : (lp.cashout ?? ""),
        tipsGiven: Math.max(+lp.tipsGiven || 0, +rp.tipsGiven || 0),
        buyinEvents: pickBuyinEvents(lp, rp),
      });
    } else if (lp) {
      /* שחקן רק במסך — נשמר אלא אם מכשיר אחר כבר מחק אותו (editedAt חדש יותר). */
      if (!remoteIsNewer) mergedPlayers.push({ ...lp, name: key });
    } else if (rp && (botAhead || remoteIsNewer)) {
      /* שחקן חדש מהבוט או ממכשיר אחר. */
      mergedPlayers.push({ ...rp, name: key });
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

  const tips = mergeTipLogs(local.tips, remote.tips, aliases);
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

  const pickEntries = () => {
    if (preferRemoteEdits) {
      return remote.entriesCount !== "" && remote.entriesCount != null
        ? remote.entriesCount
        : local.entriesCount;
    }
    return local.entriesCount !== "" && local.entriesCount != null
      ? local.entriesCount
      : remote.entriesCount;
  };

  return {
    ...local,
    ...remote,
    players: applyTipTotalsToPlayers(mergedPlayers, tips, aliases),
    applied: { ...(local.applied || {}), ...(remote.applied || {}) },
    pending: preferRemoteEdits
      ? canonMaybeName(remote.pending, aliases)
      : canonMaybeName(local.pending, aliases) ?? canonMaybeName(remote.pending, aliases) ?? null,
    closing: preferRemoteEdits ? !!remote.closing : !!local.closing,
    pendingApprovals: preferRemoteEdits
      ? canonList(remote.pendingApprovals || [])
      : canonList(
          remote.pendingApprovals?.length ? remote.pendingApprovals : local.pendingApprovals || []
        ),
    approvedNames: [
      ...new Set(
        canonList([...(local.approvedNames || []), ...(remote.approvedNames || [])])
      ),
    ],
    tips,
    /* מילוי זוגי רק מהאפליקציה — בביטול לא לאמץ מהשרת רשימה ארוכה יותר */
    coupleFills: remoteIsNewer
      ? remoteFills.length ? remoteFills : localFills
      : !takeRemoteCashout || localFills.length >= remoteFills.length
        ? localFills
        : remoteFills,
    actionLog: pickActionLog(local.actionLog, remote.actionLog, preferRemoteEdits),
    entriesCount: pickEntries(),
    startedAt: local.startedAt || remote.startedAt || null,
    addAmt: local.addAmt || remote.addAmt || 50,
    editedAt: Math.max(localEdit, remoteEdit) || null,
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
  if (remoteLiveAhead(local, remote) || localLiveBehind(local, remote, aliases)) {
    return { live: mergeLiveStates(local, remote, aliases), adopted: true };
  }
  const localEdit = +local.editedAt || 0;
  const remoteEdit = +remote.editedAt || 0;
  if (remoteEdit > localEdit) {
    return { live: mergeLiveStates(local, remote, aliases), adopted: true };
  }
  return { live: local, adopted: false };
}

/**
 * סקר לייב: משווים את הסנאפשוט שעל המסך (pending/cache) לשרת,
 * לא את lastLiveFpRef. lastLiveFp עלול כבר להיות "מזוהה עם השרת"
 * אחרי flush שאימץ יציאות למטמון בלי remount — ואז skip+flush
 * דורס את השרת בסנאפשוט ריק/ישן.
 *
 * action: record | flush | remount
 */
export function decideLivePoll(localSnap, remote, lastFp) {
  const remoteFp = liveFingerprint(remote);
  if (localSnap === undefined) {
    if (lastFp === undefined) return { action: "record" };
    if (lastFp === remoteFp) return { action: "flush" };
    return { action: "remount", merge: false };
  }
  /* ביטול משחק / ניקוי לייב מקומי — דוחפים null לשרת, לא מחזירים את המשחק ברענון. */
  if (localSnap === null) return { action: "flush" };
  const snapFp = liveFingerprint(localSnap);
  if (snapFp === remoteFp) return { action: "flush" };
  if (remoteLiveAhead(localSnap, remote) || localLiveBehind(localSnap, remote)) {
    return { action: "remount", merge: true };
  }
  /* מכשיר אחר שמר מאוחר יותר — לא לדרוס אותו ב־flush של סנאפשוט ישן. */
  const localEdit = +localSnap?.editedAt || 0;
  const remoteEdit = +remote?.editedAt || 0;
  if (remoteEdit > localEdit) {
    return { action: "remount", merge: true };
  }
  /* שינוי מקומי (הסרת שחקן, יומן, יצא, ביטול קנייה) — דוחפים לשרת בלי remount. */
  return { action: "flush" };
}
