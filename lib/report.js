/* ============================================================================
   מפרמט הדוח לקבוצה.

   הקובץ הזה משותף בכוונה: גם כפתור השיתוף באפליקציה וגם הבוט בוואטסאפ
   קוראים לו. אחרת שני הטקסטים היו נפרדים ובתוך חודש היו מתחילים להיראות שונה.
   ============================================================================ */

export const ENTRY = 50; // כניסה אחת = 50₪
export const CPS = 2; // 50₪ = 100 ג'יטונים

const r2 = (v) => Math.round(v * 100) / 100;
const pad = (v) => String(v).padStart(2, "0");

export const fullDate = (d = new Date()) =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

export const hhmm = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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
