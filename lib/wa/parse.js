/* פירוק פקודות מוואטסאפ. לא שולח ולא משנה את הלייב. */

import { DEFAULT_ALIASES } from "../poker/helpers.js";
import { BOT_MARK } from "../botMark.js";

export { BOT_MARK };

/* ============================ כינויים ============================
   אותה מפה כמו באפליקציה (DEFAULT_ALIASES / AL): "אופיר" → אופיר סנה,
   "שגיא" → שגיא גיל, וכו'. מפה נפרדת כאן השאירה שמות פרטיים בלייב.
   DEFAULT קובע; כינוי שהמשתמש הוסיף ב-db.aliases מגיע דרך opts.aliases.
   ================================================================ */
export const ALIASES = DEFAULT_ALIASES;

export function resolveAlias(rawName, aliases = ALIASES) {
  const trimmed = String(rawName || "").trim();
  return (aliases && aliases[trimmed]) || trimmed;
}

export function aliasesOf(opts) {
  const extra = opts?.aliases || {};
  const o = { ...ALIASES };
  for (const [k, v] of Object.entries(extra)) if (!(k in ALIASES)) o[k] = v;
  return o;
}

/* --------------------------- פירוק פקודות ---------------------------
   רק מילים בעברית. + ו-− היו תופסים גם שורות מתוך הדוח של הבוט עצמו.
   -------------------------------------------------------------------- */
const RE_ADD = /^(.+?)\s+(?:עוד|נכנס|נכנסת|פלוס|הוסף|כניסה)\s*(\d+)?\s*₪?\s*$/;
const RE_SUB = /^(.+?)\s+(?:פחות|מינוס|בטל)\s*(\d+)?\s*₪?\s*$/;
const CHIPS = "(?:ג'?יטונים|ג'?|צ'יפים)?";
/* כל צורות היציאה — גם נקבה. "אורן יצאה 250" בלי הצורה הנקבית היה נופל
   לתבנית החופשית "שם + סכום" ונרשם ככניסה של 250₪. באג אמיתי מהקבוצה. */
const OUT_VERBS = "(?:יצא|יצאה|יוצא|יוצאת|סיים|סיימה|קאשאאוט)";
const RE_OUT = new RegExp(`^(.+?)\\s+${OUT_VERBS}\\s+(\\d+)\\s*${CHIPS}\\s*$`);
const RE_STATUS = /^\s*(?:קופה|מצב|סטטוס|טבלה)\s*$/;
/* מספר הכניסות שהוכנו — בשני הסדרים: "כניסות 20" וגם "20 כניסות". */
const RE_ENTRIES = /^\s*כניסות\s+(\d+)\s*$/;
const RE_ENTRIES_REV = /^\s*(\d+)\s+כניסות\s*$/;
/* תוספת למלאי: "עוד 5 כניסות" מגדיל את הספירה במקום לדרוס אותה. */
const RE_ENTRIES_ADD = /^\s*(?:עוד|הוסף)\s+(\d+)\s+כניסות\s*$|^\s*כניסות\s+(?:עוד|הוסף)\s+(\d+)\s*$/;
/* הסרת שחקן שנוסף בטעות — "הסר דן" וגם "דן הסר". */
const RE_REMOVE = /^\s*(?:הסר|מחק|הורד)\s+(.+?)\s*$/;
const RE_REMOVE_REV = /^\s*(.+?)\s+(?:הסר|מחק|הורד)\s*$/;
/* ביטול יציאה — "דן חוזר" מוחק את הג'יטונים שנרשמו ומחזיר אותו לשולחן.
   לעדכון בלי ביטול פשוט רושמים שוב: "דן יצא 350" דורס את הערך הקודם. */
const RE_REOPEN = /^\s*(.+?)\s+(?:חוזר|חוזרת|ממשיך|ממשיכה)\s*$|^\s*(?:החזר|בטל יציאה)\s+(.+?)\s*$/;
/* "דן יצא" בלי מספר — הבוט שואל כמה ג'יטונים ומחכה לתשובה. */
const RE_OUT_ASK = new RegExp(`^\\s*(.+?)\\s+${OUT_VERBS}\\s*$`);
/* תשובה שהיא רק מספר. נחשבת פקודה רק אם הבוט באמת שאל משהו. */
const RE_NUMBER = /^\s*(\d+)\s*(?:ג'?יטונים|ג'?|צ'יפים)?\s*$/;
const RE_HELP = /^\s*(?:עזרה|פקודות|help|\?)\s*$/;
const RE_LINK = /^\s*(?:לינק|קישור|טבלה שלנו)\s*$/;
/* בודקת ומדווחת נטו. חלוקת ההעברות עצמה לא יוצאת מכאן — היא מוצגת
   באפליקציה, ונשלחת לקבוצה רק אחרי שאישרת אותה.
   כשיש שחקנים פתוחים, הפקודה מתחילה סגירה מודרכת: הבוט שואל ממי להתחיל,
   כמה ג'יטונים, מי הבא — ובסוף שולח חשבון סופי לבד. */
/* גם "שלח סיכום" / "שלח חלוקה" — ניסוח טבעי אחרי שכולם יצאו (1.9.2026). */
const RE_SETTLE =
  /^\s*(?:שלח\s+)?(?:סיכום|סגירה|סיום|חלוקה|חשבון סופי)(?:\s+משחק)?\s*$/;
const RE_SETTLE_CANCEL = /^\s*(?:בטל|עצור)\s+(?:סיום|סגירה|סיכום)\s*$/;
/* טיפ מג'יטונים של השחקן (לא מהקופה):
   "אופיר טיפ 10" / "אופיר נתן טיפ 10" / "אופיר 10 טיפ" */
const RE_TIP = /^(.+?)\s+(?:נתן(?:ה)?\s+)?טיפ(?:ים)?\s+(\d+)\s*$/;
const RE_TIP_AMT_FIRST = /^(.+?)\s+(\d+)\s+טיפ(?:ים)?\s*$/;
/* אישור / דחייה של שחקן חדש — עדן מאשר לפני שהשם נכנס לרוסטר. */
const RE_APPROVE = /^\s*(?:אשר|מאשר)(?:\s+שחקן(?:\s+חדש)?)?(?:\s+(.+?))?\s*$/;
const RE_APPROVE_YES = /^\s*כן(?:\s+(.+?))?\s*$/;
const RE_REJECT = /^\s*(?:דחה|לא מאשר|טעות)(?:\s+(.+?))?\s*$/;
/* "לא" לבד = דחייה (טעות הקלדה). לא תופס "לא יכול" באמצע שיחה. */
const RE_REJECT_NO = /^\s*לא\s*$/;
/* תיקון שם בלייב — בלי לבטל את הערב:
   "תקן אופיר → אופיר סנה" / "תקן אופיר -> אופיר סנה" / "תקן אופיר ל-אופיר סנה" / "תקן אופיר ל אופיר סנה" */
const RE_RENAME =
  /^\s*תקן\s+(.+?)\s*(?:→|->|←|=>|ל-)\s*(.+?)\s*$|^\s*תקן\s+(.+?)\s+ל\s+(.+?)\s*$/;
/* שם בלבד, בלי מספרים — משמעותי רק בזמן סגירה מודרכת, אחרת מתעלמים. */
const RE_NAME_ONLY = /^[\u0590-\u05FF][\u0590-\u05FF\s'"׳״.\-]{0,24}$/;

/* פקודות שרק קוראות. הן לא נכנסות ללולאת השינויים ולא נרשמות ל-undo. */
export const READ_ONLY = new Set(["status", "help", "link", "settle"]);

/* צורה חשופה: "דוד בני 50" בלי פועל, וגם הפוך — "50 דן". שימושית מאוד
   באמצע משחק, אבל גם רחבה מספיק כדי לתפוס שיחה רגילה ("מתחילים ב 21"),
   ולכן היא מותרת רק כשמשחק פעיל. לפני שהמשחק התחיל היא מתעלמת. */
const RE_BARE = /^(.+?)\s+(\d+)\s*₪?\s*$/;
const RE_BARE_REV = /^(\d+)\s*₪?\s+(.+?)\s*$/;

/* מילים משורות דוח וסיכום — שם שנגמר בהן הוא לעולם לא פקודה. ההגנה
   נולדה מערב 6.8.26: הודעת אזהרה של הבוט (שהתחילה ב-⚠️ ולא ב-🤖) חזרה
   דרך ה-webhook, ושורות כמו "אורן גיל מגיע 525₪" נקראו כ"אורן גיל +525".
   כל הקופה התנפחה ב-1,620₪ בשנייה אחת. */
const RE_REPORT_WORDS = /(?:מגיע|מגיעה|חייב|חייבת|סגר|סגרה|באפס|מעביר|מעבירה|מקבל|מקבלת|ביט|כניסות|קופה|בחוץ|סה["״׳']?כ)\s*$/;

/* תיקון מלאי לפי מה שרואים בקופסה: "נשארו 3 כניסות" מכוון את הסך הכולל
   כך שהמונה בדוח יראה בדיוק 3 בחוץ — בלי לחשב כמה נקנו עד עכשיו. */
const RE_ENTRIES_LEFT = /^\s*נשאר(?:ו)?\s+(\d+(?:\.\d+)?)\s+כניסות(?:\s+בחוץ)?\s*$|^\s*(\d+(?:\.\d+)?)\s+כניסות\s+בחוץ\s*$/;

function parseLine(text, defaultAmt, gameActive) {
  const line = (text || "").trim();
  if (!line || line.startsWith(BOT_MARK)) return null;

  if (RE_HELP.test(line)) return { kind: "help" };
  if (RE_LINK.test(line)) return { kind: "link" };
  if (RE_SETTLE_CANCEL.test(line)) return { kind: "settleCancel" };
  if (RE_SETTLE.test(line)) return { kind: "settle" };
  if (RE_STATUS.test(line)) return { kind: "status" };

  let ap = line.match(RE_APPROVE) || line.match(RE_APPROVE_YES);
  if (ap) return { kind: "approve", name: (ap[1] || "").trim() };
  let rj = line.match(RE_REJECT) || line.match(RE_REJECT_NO);
  if (rj) return { kind: "reject", name: (rj[1] || "").trim() };

  let rn = line.match(RE_RENAME);
  if (rn) {
    const from = (rn[1] || rn[3] || "").trim();
    const to = (rn[2] || rn[4] || "").trim();
    if (from && to && from !== to) return { kind: "rename", from, to };
  }

  let el = line.match(RE_ENTRIES_LEFT);
  if (el) return { kind: "entries_left", left: +(el[1] || el[2]) };

  let ea = line.match(RE_ENTRIES_ADD);
  if (ea) return { kind: "entries_add", delta: +(ea[1] || ea[2]) };

  let e = line.match(RE_ENTRIES) || line.match(RE_ENTRIES_REV);
  if (e) return { kind: "entries", count: +e[1] };

  let rm = line.match(RE_REMOVE) || line.match(RE_REMOVE_REV);
  if (rm) return { kind: "remove", name: rm[1].trim() };

  let ro = line.match(RE_REOPEN);
  if (ro) return { kind: "reopen", name: (ro[1] || ro[2]).trim() };

  let num = line.match(RE_NUMBER);
  if (num) return { kind: "answer", chips: +num[1] };

  let ask = line.match(RE_OUT_ASK);
  if (ask) return { kind: "ask", name: ask[1].trim() };

  let tip = line.match(RE_TIP) || line.match(RE_TIP_AMT_FIRST);
  if (tip) return { kind: "tip", name: tip[1].trim(), chips: +tip[2] };

  let m = line.match(RE_OUT);
  if (m) return { kind: "cashout", name: m[1].trim(), chips: +m[2] };

  m = line.match(RE_ADD);
  if (m) return { kind: "add", name: m[1].trim(), amount: m[2] ? +m[2] : defaultAmt };

  m = line.match(RE_SUB);
  if (m) return { kind: "add", name: m[1].trim(), amount: -(m[2] ? +m[2] : defaultAmt) };

  if (gameActive) {
    m = line.match(RE_BARE);
    if (m && !RE_REPORT_WORDS.test(m[1].trim())) return { kind: "add", name: m[1].trim(), amount: +m[2] };
    m = line.match(RE_BARE_REV);
    if (m && !RE_REPORT_WORDS.test(m[2].trim())) return { kind: "add", name: m[2].trim(), amount: +m[1] };
    // שם בלבד — נבדק אחרון, ומטופל רק כשסגירה מודרכת פעילה
    if (RE_NAME_ONLY.test(line) && !RE_REPORT_WORDS.test(line)) return { kind: "nameOnly", name: line };
  }
  return null;
}

/** הודעה אחת יכולה להכיל כמה פקודות, שורה לשורה. */
export function parseCommands(raw, defaultAmt = 50, gameActive = false) {
  const text = (raw || "").trim();
  if (!text || text.startsWith(BOT_MARK)) return [];
  return text
    .split(/\r?\n/)
    .map((line) => parseLine(line, defaultAmt, gameActive))
    .filter(Boolean);
}

// נשמר לתאימות ולבדיקות
export const parseCommand = (raw, defaultAmt = 50, gameActive = true) =>
  parseCommands(raw, defaultAmt, gameActive)[0] || null;

/* ------------------------- התאמת שם לשחקן -------------------------
   סדר: כינוי מפורש → התאמה מדויקת → תחילית יחידה.
   אם תחילית מתאימה ליותר מאחד — לא מנחשים, מבקשים לדייק.
   ---------------------------------------------------------------- */
export function findPlayer(players, rawName, aliases = ALIASES) {
  const name = resolveAlias(rawName, aliases);

  const exact = players.findIndex((p) => p.name === name);
  if (exact !== -1) return { index: exact, resolved: name };

  const byCanon = [];
  players.forEach((p, i) => {
    if (resolveAlias(p.name, aliases) === name) byCanon.push(i);
  });
  if (byCanon.length === 1) return { index: byCanon[0], resolved: name };
  if (byCanon.length > 1) {
    return { index: -1, ambiguous: byCanon.map((i) => players[i].name), resolved: name };
  }

  const starts = [];
  players.forEach((p, i) => {
    if (p.name.startsWith(name) || name.startsWith(p.name)) starts.push(i);
  });
  if (starts.length === 1) return { index: starts[0], resolved: name };
  if (starts.length > 1) {
    return { index: -1, ambiguous: starts.map((i) => players[i].name), resolved: name };
  }
  return { index: -1, resolved: name };
}

