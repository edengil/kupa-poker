/* ============================================================================
   מפרמט הדוח לקבוצה.

   הקובץ הזה משותף בכוונה: גם כפתור השיתוף באפליקציה וגם הבוט בוואטסאפ
   קוראים לו. אחרת שני הטקסטים היו נפרדים ובתוך חודש היו מתחילים להיראות שונה.
   ============================================================================ */

export const ENTRY = 50; // כניסה אחת = 50₪
export const CPS = 2; // 50₪ = 100 ג'יטונים

const r2 = (v) => Math.round(v * 100) / 100;
const pad = (v) => String(v).padStart(2, "0");

/* התאריך והשעה חייבים להיות בשעון ישראל תמיד — לא בשעון של מי שמריץ את
   הקוד. האפליקציה רצה בדפדפן (ישראל) והבוט רץ על Vercel (UTC), כך שאותה
   פונקציה הייתה מציגה שעה אחרת בכל צד: הבוט הראה שעת התחלה מוקדמת ב-3 שעות
   מהאפליקציה. Intl עם timeZone קבוע מיישר את שניהם. */
const IL_TZ = "Asia/Jerusalem";

export const fullDate = (d = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IL_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d instanceof Date ? d : new Date(d));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("day")}/${get("month")}/${get("year")}`;
};

export const hhmm = (ts) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: IL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ts));

export function durWords(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} דק׳`;
  return m === 0 ? `${h} שעות` : `${h}:${pad(m)} שעות`;
}

const hasCashout = (p) => p.cashout !== "" && p.cashout != null;

/** נטו מול הקנייה. חיובי = מגיע לו, שלילי = הוא חייב לקופה. */
export const netOf = (p, cps = CPS) => r2((+p.cashout || 0) / cps - (+p.buyin || 0));

/** שורת סגירה לשחקן שיצא. הוא כבר לא ברשימת הביט, אז מסתדרים רק על ההפרש. */
export function settleLine(p, cps = CPS) {
  const net = netOf(p, cps);
  if (net === 0) return `${p.name} סגר באפס`;
  return net > 0 ? `${p.name} מגיע ${net}₪` : `${p.name} חייב ${-net}₪`;
}

/**
 * הדוח המלא שנשלח לקבוצה.
 *
 * מבנה: תאריך ושעה למעלה, אחר כך מי שעדיין בשולחן עם הקנייה שלו, ואז מונה
 * הכניסות. מי שיצא עובר לשורה נפרדת בתחתית עם מה שמגיע לו — כי מהרגע שהוא
 * קיבל את הכסף הוא כבר לא חלק מהקופה שעל השולחן.
 */
export function buildReport({ players = [], entriesCount = "", startedAt = null, now = Date.now(), cps = CPS } = {}) {
  const active = players.filter((p) => !hasCashout(p) && +p.buyin > 0);
  const out = players.filter(hasCashout);

  const head = [fullDate(new Date(now))];
  if (startedAt) head.push(`🕐 התחלנו ${hhmm(startedAt)} · ${durWords(now - startedAt)} במשחק`);

  const parts = [head.join("\n")];

  // "ביט" ולא "₪" — זו רשימת מי שמעביר כסף פנימה, וכך הקבוצה רגילה לקרוא אותה
  if (active.length) parts.push(active.map((p) => `${p.name} ${r2(+p.buyin || 0)} ביט`).join("\n"));

  const pot = r2(players.reduce((s, p) => s + (+p.buyin || 0), 0));
  const used = r2(pot / ENTRY);
  const prepared = entriesCount === "" || entriesCount == null ? null : +entriesCount || 0;
  if (prepared !== null) parts.push(`(${prepared} כניסות מתוכם ${r2(prepared - used)} בחוץ)`);

  if (out.length) parts.push(out.map((p) => settleLine(p, cps)).join("\n"));

  return parts.join("\n\n").trim();
}

/* ============================================================================
   טקסט חלוקת התשלומים.
   ============================================================================ */

/** @param {ReturnType<import("./settlement").settle>} result */
export function buildSettlement(result, { now = Date.now(), isCashOnly, transferVerb } = {}) {
  const { transfers, shortfall } = result;
  const parts = [`${fullDate(new Date(now))} · חלוקה`];

  if (!transfers.length) {
    parts.push("אין העברות — כולם סגורים.");
    return parts.join("\n\n");
  }

  // הפורמט שהקבוצה רגילה אליו: "שגיא מעביר 180 לקובי"
  // זוגות משותפים: "דור לירז ועדן לירז מעבירים 160 לעדן גיל"
  const verb = typeof transferVerb === "function" ? transferVerb : () => "מעביר";
  parts.push(
    transfers
      .map((t) => `${t.from} ${verb(t.from)} ${t.amount} ל${t.to}`)
      .join("\n")
  );

  if (shortfall > 0) {
    parts.push(`⚠️ חסרו ${shortfall}₪ · חולקו בין המרוויחים לפי גודל הזכייה`);
  }

  // מי שמקבל ולא לוקח ביט — שורה אחת, רק אם הוא באמת מופיע בהעברות
  if (typeof isCashOnly === "function") {
    const cash = [...new Set(transfers.map((t) => t.to).filter(isCashOnly))];
    if (cash.length) {
      const who = cash.length === 1 ? `${cash[0]} מקבל` : `${cash.join(" ו")} מקבלים`;
      parts.push(`💵 ${who} פייבוקס או מזומן בלבד`);
    }
  }

  return parts.join("\n\n");
}
