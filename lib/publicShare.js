/** מגביל מה שצופים רואים לפי הגדרת המנהל. */

import { sessionsForViewer } from "./lastSession.js";
import { projectPaymentsForViewer } from "./paymentTracking.js";

/**
 * ניקוי נתוני קופת החיסכון מערב לצופים (R4 — פרטיות קופה ברמת הנתונים):
 * שדות הקופה (savingsPot / savingsPotActual) הם נתוני מנהל בלבד, והעברת
 * הקופה מוקרנת החוצה גם מהתוכנית השמורה שב־payments. גם
 * manualSettlement.frozenActual מוסר — הוא סכום ה«בפועל» עצמו. ה־SQL
 * הציבורי מסיר את savingsPot; כאן מסירים את השאר בכל מצבי השיתוף, כדי
 * ששום סכום קופה לא יגיע למכשיר של צופה.
 */
function sessionForViewer(session) {
  if (!session || typeof session !== "object") return session;
  /* coupleFills — מפת המילויים הזוגיים — היא נתון מנהל ("לא לחשוף בקבוצה")
     ואסור שתגיע למכשיר צופה, גם לא בתוך ערב שמור. */
  const { savingsPot, savingsPotActual, coupleFills, ...rest } = session;
  let out = rest;
  /* frozenActual שב־manualSettlement הוא עצמו סכום הקופה בפועל — נתון
     מנהל שחייב להישאר מחוץ לנתוני הצופה (F4). מפת החוסר הקפואה נשארת:
     היא נדרשת כדי שהצופה יחשב אותם סכומי שחקנים כמו המנהל, ואין בה
     סכום קופה. frozenActual אינו נקרא בשום חישוב — רק בדשבורד המנהל. */
  if (out.manualSettlement && typeof out.manualSettlement === "object" && "frozenActual" in out.manualSettlement) {
    const { frozenActual, ...msRest } = out.manualSettlement;
    out = { ...out, manualSettlement: msRest };
  }
  const payments = projectPaymentsForViewer(out.payments);
  return payments === out.payments ? out : { ...out, payments };
}

/**
 * הקרנת הלייב לצופה (גל 1): עד היום ההקרנה נגעה רק ב־data, והלייב הגולמי —
 * כולל coupleFills ושדות הקופה — עבר לצופה כמו שהוא ונשמר במכשירו. מעכשיו
 * גם הלייב מוקרן: שדות הקופה ומפת המילויים הזוגיים יוצאים, כל השאר נשאר
 * (שחקנים, cps, מצב המשחק).
 */
export function liveForViewer(live) {
  if (!live || typeof live !== "object") return live;
  const { savingsPot, savingsPotActual, savingsWithdrawals, potDraft, frozenActual, potPaid, coupleFills, ...rest } = live;
  return rest;
}

export function snapshotForViewer(snap) {
  if (!snap) return snap;
  const withLive = (out) => ("live" in snap ? { ...out, live: liveForViewer(snap.live) } : out);
  const shareHistory = snap.config?.shareHistory !== false;
  if (shareHistory) {
    const { savingsPot, savingsWithdrawals, ...dataRest } = snap.data || {};
    return withLive({
      ...snap,
      data: {
        ...dataRest,
        sessions: (snap.data?.sessions || []).map(sessionForViewer),
      },
    });
  }
  return withLive({
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
  });
}

export function viewerCps(snap, live) {
  const fromLive = live?.cps != null ? +live.cps : null;
  const fromCfg = snap?.config?.chipsPerShekel != null ? +snap.config.chipsPerShekel : null;
  if (Number.isFinite(fromLive) && fromLive > 0) return fromLive;
  if (Number.isFinite(fromCfg) && fromCfg > 0) return fromCfg;
  return 2;
}
