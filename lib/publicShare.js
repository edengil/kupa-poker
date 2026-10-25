/** מגביל מה שצופים רואים לפי הגדרת המנהל. */

import { sessionsForViewer } from "./lastSession.js";
import { projectPaymentsForViewer } from "./paymentTracking.js";

/**
 * ניקוי נתוני קופת החיסכון מערב לצופים (R4 — פרטיות קופה ברמת הנתונים):
 * שדות הקופה (savingsPot / savingsPotActual) הם נתוני מנהל בלבד, והעברת
 * הקופה מוקרנת החוצה גם מהתוכנית השמורה שב־payments. ה־SQL הציבורי מסיר
 * את savingsPot; כאן מסירים את השאר בכל מצבי השיתוף, כדי ששום סכום קופה
 * לא יגיע למכשיר של צופה.
 */
function sessionForViewer(session) {
  if (!session || typeof session !== "object") return session;
  const { savingsPot, savingsPotActual, ...rest } = session;
  const payments = projectPaymentsForViewer(rest.payments);
  return payments === rest.payments ? rest : { ...rest, payments };
}

export function snapshotForViewer(snap) {
  if (!snap) return snap;
  const shareHistory = snap.config?.shareHistory !== false;
  if (shareHistory) {
    const { savingsPot, savingsWithdrawals, ...dataRest } = snap.data || {};
    return {
      ...snap,
      data: {
        ...dataRest,
        sessions: (snap.data?.sessions || []).map(sessionForViewer),
      },
    };
  }
  return {
    ...snap,
    data: {
      plan: snap.data?.plan ?? null,
      roster: [],
      /* כינויים נשארים כדי לזהות את הצופה מול שמות בחלוקה */
      aliases: snap.data?.aliases && typeof snap.data.aliases === "object" ? snap.data.aliases : {},
      sessions: sessionsForViewer(snap.data?.sessions, { shareHistory: false }).map(sessionForViewer),
      yearly: [],
      monthly: [],
    },
  };
}

export function viewerCps(snap, live) {
  const fromLive = live?.cps != null ? +live.cps : null;
  const fromCfg = snap?.config?.chipsPerShekel != null ? +snap.config.chipsPerShekel : null;
  if (Number.isFinite(fromLive) && fromLive > 0) return fromLive;
  if (Number.isFinite(fromCfg) && fromCfg > 0) return fromCfg;
  return 2;
}
