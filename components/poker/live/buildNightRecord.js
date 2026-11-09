import { r2 } from "@/lib/poker/helpers";
import { nightDateParts } from "@/lib/report";
import { buildAttendanceSnapshot } from "@/lib/poker/attendance";
import { matchViewerToPlayer } from "@/lib/poker/personalHighlights";
import { effectivePot } from "@/lib/liveView";
import {
  checkNightBalance,
  confirmSaveIfUnbalanced,
  deductChipsShortage,
} from "@/lib/poker/nightBalance";

/* בניית רשומת הערב השמור מתוך מצב הלייב — ליבת החישוב של saveNight
   ב־LiveTab, חולצה לכאן כפונקציה נטולת־מצב (גל 8, 8.2): אותו חישוב
   בדיוק, שורה מול שורה. תופעות הלוואי של הקומפוננטה (commit, ניקוי
   מצב, הודעות) נשארו ב־LiveTab; כאן רק בונים את הרשומה.
   מחזירה:
   - { status: "empty" } — אין רשומות לשמירה
   - { status: "aborted" } — המשתמש לא אישר שמירה לא־מאוזנת
   - { status: "ok", rec, roster, endedAt, dateParts } — מוכן לשמירה */
export function buildNightRecord({
  players,
  cps,
  cashSumChips,
  potChips,
  startedAt,
  planSnap,
  db,
  aliases,
  tips,
  coupleFills,
  actionLog,
  handOfNight,
  savings5,
  savingsPot,
  potDraft,
  nowMs,
}) {
  /* נטו ב־₪ כמו תמיד; בנוסף chips / tipsGiven על כל רשומה כדי ששיאי
     ג'יטונים וטיפים יעבדו מכאן והלאה. */
  const entries = players
    .filter((p) => p.cashout !== "")
    .map((p) => {
      const chips = +p.cashout || 0;
      const buyin = +p.buyin || 0;
      const net = r2(chips / cps - buyin);
      return {
        name: p.name,
        amount: net,
        chips,
        buyin,
        tipsGiven: +p.tipsGiven || 0,
        buyinEvents: Array.isArray(p.buyinEvents) && p.buyinEvents.length ? p.buyinEvents : undefined,
      };
    });
  /* כולל מי שסגר באפס — קודם סוננו החוצה כש־chips=0 */
  if (!entries.length) return { status: "empty" };
  /* אזהרה רכה לפני שמירה לא־מאוזנת — לא חוסם קניות/ישיבה באמצע המשחק */
  const balCheck = checkNightBalance({
    entries,
    cashSumChips,
    potChips,
    cps,
  });
  if (!confirmSaveIfUnbalanced(balCheck)) return { status: "aborted" };
  /* חוסר בגיטונים — יורד מהמרוויחים באופן יחסי, בשקלים שלמים (לפי עדן).
     החיתוך חל על הג'יטונים עצמם (לא רק על amount) דרך deductChipsShortage
     — אותה חלוקה יחסית כמו במנוע החלוקה, ובלי סכומים שליליים (ממצא 7) */
  const chipsShortage = balCheck.chipsGapShekels != null && balCheck.chipsGapShekels < -0.01
    ? Math.round(-balCheck.chipsGapShekels)
    : 0;
  if (chipsShortage > 0) {
    deductChipsShortage(entries, chipsShortage, cps);
  }
  /* תאריך הערב = תחילת המשחק בשעון ישראל (לא חצות אחרי סגירה מאוחרת). */
  const endedAt = nowMs();
  const { d, mo, y, iso } = nightDateParts(startedAt, endedAt);
  /* צילום נוכחות: אישורי הגעה מול מי שבאמת ישב. שמות הצופים ממופים
     לשמות שחקנים; מי שלא זוהה נשאר עם שם ההתחברות ופשוט לא נספר. */
  const attendance = planSnap
    ? buildAttendanceSnapshot({
        rsvpRows: (planSnap.rsvpRows || []).map((r) => ({
          status: r.status,
          playerName:
            matchViewerToPlayer(db, { name: r.name, email: r.email }) || r.name,
        })),
        actualNames: players.map((p) => p.name),
        aliases,
      })
    : undefined;
  const potFinal = effectivePot(savingsPot, potDraft);
  const rec = {
    id: "live_" + nowMs(),
    iso,
    d,
    mo,
    y,
    entries,
    tips: tips.length ? tips.map(({ name, amount, at }) => ({ name, amount, at })) : undefined,
    cps,
    coupleFills: coupleFills.length ? coupleFills : undefined,
    startedAt: startedAt || null,
    endedAt,
    location: planSnap?.location || db.plan?.location || undefined,
    placeNote: planSnap?.note || db.plan?.note || undefined,
    /* יומן הפעולות נשמר עם הערב — רק ממנו מחשבים שיאי יציאה, רק לערבי לייב */
    actionLog: actionLog.length ? actionLog : undefined,
    handOfNight: handOfNight.trim() || undefined,
    attendance,
    savings5: savings5 || undefined,
    /* סכום הקופה שהמנהל אישר/ערך בסוף הערב — הוא מה שנרשם ומה שמצטבר (עדן, 19.10) */
    savingsPot: potFinal > 0 ? potFinal : undefined,
  };
  const roster = [...new Set([...(db.roster || []), ...players.map((p) => p.name)])];
  return { status: "ok", rec, roster, endedAt, dateParts: { d, mo, y } };
}
