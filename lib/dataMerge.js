/**
 * מיזוג data לפני flush — מונע דריסת ערבים שקיימים רק בשרת
 * כשמטמון מקומי ישן נשמר אחרי עריכה (למשל סימון «שולם»).
 */

import { paymentPlan } from "./paymentTracking.js";

/* --------------------------------------------------------------------------
   מיזוג payments ברמת מפה (ממצא ביקורת 9): עד היום flush בחר עותק ערב
   אחד שלם — וסימוני שרת טריים (צופה שסימן דרך ה־RPC בזמן שהאפליקציה
   החזיקה צילום ישן) נמחקו בשקט. עכשיו, כששני הצדדים נושאים payments
   לאותו ערב, המפות מתמזגות מפתח־מפתח בקואורדינטות התוכנית של העותק
   הזוכה, עם הכרעה לפי אירועי האישור:
   - אירוע (index/action/by/at) שקיים בצד אחד ולא מוכר לצד השני = הסימון
     הגיע אחרי שהצד השני צילם — הערך של בעל האירוע החדש גובר.
   - שני הצדדים עם אירועים חדשים זה מול זה — המאוחר בזמן גובר.
   - שני הצדדים ראו את אותו אירוע אחרון והערכים שונים — ביטול־סימון
     (שלא משאיר אירוע) קרה אחריו, והצד הלא־מסומן גובר.
   - בלי אירועים בכלל (legacy) — המסומן גובר; אחרת הערך של העותק
     הזוכה (העדפת preferSession).
   אירועי האישור מתאחדים (בלי כפילויות), כך שההכרעה נשמרת גם ל־flush הבא.
   -------------------------------------------------------------------------- */

const eventKey = (e) =>
  JSON.stringify([Number(e?.index), e?.action || "", e?.by || "", e?.at || "", Boolean(e?.pot)]);

function latestEventAt(events, index, action, pot = false) {
  let latest = null;
  for (const e of events || []) {
    if (!e) continue;
    if (pot ? !(e.pot || Number(e.index) === -1) : e.pot || Number(e.index) === -1) continue;
    if (!pot && Number(e.index) !== Number(index)) continue;
    if ((e.action || "paid") !== action) continue;
    const at = String(e.at || "");
    if (!latest || at > latest.at) latest = { at, key: eventKey(e) };
  }
  return latest;
}

/** מכריע בין שני ערכי סימון סותרים לפי חידוש אירועי האישור של כל צד. */
function arbitrateMark(winnerVal, loserVal, winnerEvents, loserEvents, index, action, pot = false) {
  const wEv = latestEventAt(winnerEvents, index, action, pot);
  const lEv = latestEventAt(loserEvents, index, action, pot);
  const winnerKeys = new Set((winnerEvents || []).map(eventKey));
  const loserKeys = new Set((loserEvents || []).map(eventKey));
  const wNovel = wEv && !loserKeys.has(wEv.key) ? wEv : null;
  const lNovel = lEv && !winnerKeys.has(lEv.key) ? lEv : null;
  if (lNovel && !wNovel) return loserVal;
  if (wNovel && !lNovel) return winnerVal;
  if (wNovel && lNovel) return lNovel.at > wNovel.at ? loserVal : winnerVal;
  /* שני הצדדים ראו את אותו אירוע אחרון (אותו מפתח) והערכים עדיין שונים:
     אחד מהם שינה את הסימון אחרי האירוע. ביטול־סימון לא משאיר אירוע משלו
     (rememberConfirmation רושם רק סימון), וסימון־מחדש היה משאיר אירוע
     חדש ומאוחר יותר — לכן השינוי שאחרי האירוע הוא בהכרח ביטול, והצד
     הלא־מסומן הוא שפעל אחרון: הוא גובר. (ממצא 9, סבב תיקון — ביטול
     סימון שגוי לא קם לתחייה ב־flush ממכשיר עם עותק ישן.) */
  if (wEv && lEv && wEv.key === lEv.key) {
    return Boolean(winnerVal) ? loserVal : winnerVal;
  }
  /* אין אירועים בכלל (legacy): אי אפשר להוכיח שמישהו ביטל בכוונה —
     סימון שנרשם איפשהו לא נמחק בידי עותק שלא ראה אותו. המסומן גובר. */
  if (!wEv && !lEv) {
    return Boolean(winnerVal) ? winnerVal : loserVal;
  }
  return winnerVal;
}

function mergeMarkMap(winnerMap, loserMap, winnerEvents, loserEvents, action) {
  const out = {};
  const keys = new Set([...Object.keys(winnerMap || {}), ...Object.keys(loserMap || {})]);
  for (const k of keys) {
    const wHas = Object.prototype.hasOwnProperty.call(winnerMap || {}, k);
    const lHas = Object.prototype.hasOwnProperty.call(loserMap || {}, k);
    if (wHas && !lHas) out[k] = winnerMap[k];
    else if (lHas && !wHas) out[k] = loserMap[k];
    else if (Boolean(winnerMap[k]) === Boolean(loserMap[k])) out[k] = winnerMap[k];
    else {
      out[k] = arbitrateMark(
        winnerMap[k], loserMap[k], winnerEvents, loserEvents, Number(k), action
      );
    }
  }
  return out;
}

/**
 * ממזג את payments של עותק מפסיד לתוך payments של העותק הזוכה של אותו ערב.
 * הסימונים של המפסיד מועברים לקואורדינטות התוכנית של הזוכה לפי זהות
 * העברה (אותו מנגנון carry של paymentPlan), ואז מתמזגים ברמת מפה.
 * על כל כשל חישוב — נופלים ל־payments של הזוכה כמו שהם (התנהגות הקודמת).
 */
export function mergeSessionPayments(winnerSession, loserSession) {
  const winnerPayments = winnerSession?.payments;
  const loserPayments = loserSession?.payments;
  if (!winnerPayments || !loserPayments) return winnerPayments;
  try {
    const wPlan = paymentPlan({ ...winnerSession, payments: winnerPayments });
    const lPlan = paymentPlan({ ...winnerSession, payments: loserPayments });
    const confirmations = [];
    const seen = new Set();
    for (const e of [...(wPlan.confirmations || []), ...(lPlan.confirmations || [])]) {
      if (!e) continue;
      const k = eventKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      confirmations.push(e);
    }
    confirmations.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
    let potPaid = Boolean(wPlan.potPaid) === Boolean(lPlan.potPaid)
      ? Boolean(wPlan.potPaid)
      : arbitrateMark(
          Boolean(wPlan.potPaid), Boolean(lPlan.potPaid),
          wPlan.confirmations, lPlan.confirmations, -1, "paid", true
        );
    return {
      plan: wPlan.fingerprint,
      paid: mergeMarkMap(wPlan.paid, lPlan.paid, wPlan.confirmations, lPlan.confirmations, "paid"),
      received: mergeMarkMap(wPlan.received, lPlan.received, wPlan.confirmations, lPlan.confirmations, "received"),
      ...(potPaid ? { potPaid: true } : {}),
      confirmations,
    };
  } catch {
    return winnerPayments;
  }
}

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
      const remoteSession = byId.get(id);
      const winner = preferSession(remoteSession, s);
      /* גוף הערב מהזוכה — אבל סימוני התשלום מתמזגים ברמת מפה, כדי שסימון
         טרי מהשרת לא יימחק בגלל שעותק אחר של הערב ניצח בציון. */
      if (remoteSession?.payments && s?.payments) {
        const loser = winner === remoteSession ? s : remoteSession;
        byId.set(id, { ...winner, payments: mergeSessionPayments(winner, loser) });
      } else {
        byId.set(id, winner);
      }
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
