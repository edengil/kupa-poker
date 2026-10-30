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
/* מזהה החותמת הפנימי של הבוט (sid = מזהה הודעת וואטסאפ + אינדקס פקודה)
   חי על אירועי הקנייה באחסון, אבל הוא מזהה של הודעה חיצונית — לא נתון
   שצופה צריך לקבל. שאר שדות האירוע (סכום/זמן/סך/pot) כבר חשופים לצופה
   היום; רק ה־sid יוצא, בשחקני הלייב ובשורות הערבים השמורים. */
function stripEventSids(rows) {
  if (!Array.isArray(rows)) return rows;
  let changed = false;
  const out = rows.map((row) => {
    if (!row || typeof row !== "object" || !Array.isArray(row.buyinEvents)) return row;
    if (!row.buyinEvents.some((e) => e && typeof e === "object" && "sid" in e)) return row;
    changed = true;
    return {
      ...row,
      buyinEvents: row.buyinEvents.map((e) => {
        if (!e || typeof e !== "object" || !("sid" in e)) return e;
        const { sid, ...evRest } = e;
        return evRest;
      }),
    };
  });
  return changed ? out : rows;
}

function sessionForViewer(session) {
  if (!session || typeof session !== "object") return session;
  /* coupleFills — מפת המילויים הזוגיים — היא נתון מנהל ("לא לחשוף בקבוצה")
     ואסור שתגיע למכשיר צופה, גם לא בתוך ערב שמור. */
  const { savingsPot, savingsPotActual, coupleFills, ...rest } = session;
  let out = rest;
  if (Array.isArray(out.entries)) out = { ...out, entries: stripEventSids(out.entries) };
  if (Array.isArray(out.players)) out = { ...out, players: stripEventSids(out.players) };
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
 * גם applied יוצא כולו (גל 2ב סבב 5): זה יומן הביטולים הפנימי של הבוט —
 * רשומות לפי מזהה הודעת וואטסאפ, עם צילומי ev שנושאים sid. לצופה אין בו
 * שום שימוש, ואסור שמזהי ההודעות יגיעו למכשירו. הלייב הגולמי באחסון שומר
 * את applied — הבוט צריך אותו למסירות חוזרות; רק ההקרנה מסירה.
 */
export function liveForViewer(live) {
  if (!live || typeof live !== "object") return live;
  const { savingsPot, savingsPotActual, savingsWithdrawals, potDraft, frozenActual, potPaid, coupleFills, applied, ...rest } = live;
  if (Array.isArray(rest.players)) return { ...rest, players: stripEventSids(rest.players) };
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
