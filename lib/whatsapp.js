/* ============================================================================
   שכבת הוואטסאפ — פירוק פקודות ושליחה חזרה דרך Whapi.

   במהלך משחק אתה לא רוצה לפתוח אפליקציה. אתה כותב בקבוצה "דן עוד 50",
   והקבוצה מקבלת בחזרה את מצב השולחן המלא.
   ============================================================================ */

import { buildReport, settleLine, netOf, CPS, partitionByNet } from "./report";
import { nextTipCompliment, formatTipCompliment } from "./tipCompliments";
import { isFemaleName } from "./settlement";
import { tipSummaryForSession } from "./nightShare";
import { BOT_MARK } from "./botMark";
import { assignPodiumMedals } from "./podiumMedals";

const WHAPI_BASE = "https://gate.whapi.cloud";

// כל תשובה של הבוט מתחילה בסימן הזה, וכל הודעה שמתחילה בו מסוננת בכניסה.
// בלעדיו הבוט היה מפרסר את התשובות של עצמו ונכנס ללולאה.
export { BOT_MARK };

const r2 = (v) => Math.round(v * 100) / 100;

/** CTA לראות חלוקה באפליקציה — בלי לשלוח את רשימת ההעברות לקבוצה. */
function appSettlementCta(cmds) {
  const hit = (cmds || []).find((c) => c.siteUrl && c.slug);
  if (!hit) return "";
  return `\n\n📱 לראות את החלוקה באפליקציה:\n${hit.siteUrl}/g/${hit.slug}`;
}

/* ============================ כינויים ============================
   "דן" בקבוצה זה דן ינקלויץ. דן ויסמן הוא "דן הספר".
   בלי המפה הזאת התאמה לפי תחילית הייתה בוחרת את הראשון ברשימה — כלומר
   מזכה את השחקן הלא נכון, וזו שגיאה שמתגלה רק בסוף הערב.
   להוספת כינוי — שורה אחת כאן.
   ================================================================ */
export const ALIASES = {
  "דן": "דן ינקלויץ",
  "דן הספר": "דן ויסמן",
  "הספר": "דן ויסמן",
  /* "עדן" לבד הוא תמיד עדן גיל — בערב 6.8.26 "עדן 50" נתקע על שאלת
     הבהרה שאף אחד לא ענה עליה, וכניסה שלמה נעלמה מהרישום. */
  "עדן": "עדן גיל",
  "עדן ל": "עדן לירז",
  "עדן של דור": "עדן לירז",
  "עדן גורשומוב": "עדן לירז",
  "עדן גושמרוב": "עדן לירז",
  /* "דור בני" זו טעות כתיב נפוצה ל־דוד בני */
  "דור בני": "דוד בני גיל",
};

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
const RE_SETTLE = /^\s*(?:סיכום|סגירה|סיום|חלוקה|חשבון סופי)(?:\s+משחק)?\s*$/;
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
const READ_ONLY = new Set(["status", "help", "link", "settle"]);

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
export function findPlayer(players, rawName) {
  const name = (ALIASES[rawName.trim()] || rawName).trim();

  const exact = players.findIndex((p) => p.name === name);
  if (exact !== -1) return { index: exact };

  const starts = [];
  players.forEach((p, i) => {
    if (p.name.startsWith(name) || name.startsWith(p.name)) starts.push(i);
  });
  if (starts.length === 1) return { index: starts[0] };
  if (starts.length > 1) {
    return { index: -1, ambiguous: starts.map((i) => players[i].name) };
  }
  return { index: -1, resolved: name };
}

function knownSetOf(list) {
  if (!list) return null;
  if (list instanceof Set) return list.size ? list : null;
  if (Array.isArray(list)) return list.length ? new Set(list) : null;
  return null;
}

function isKnownName(raw, known, extra = []) {
  const set = knownSetOf(known);
  if (!set) return true; // בלי רשימה (בדיקות ישנות) — לא חוסמים
  const trimmed = String(raw || "").trim();
  const name = ALIASES[trimmed] || trimmed;
  const pool = new Set([...set, ...extra]);
  if (pool.has(name) || pool.has(trimmed)) return true;
  if (name.length < 2) return false;
  const hits = [...pool].filter((n) => n.startsWith(name) || name.startsWith(n));
  return hits.length === 1;
}

function pickPending(list, rawName) {
  if (!list.length) return -1;
  if (!rawName) return list.length === 1 ? 0 : -2; // -2 = צריך לדייק
  const name = (ALIASES[rawName.trim()] || rawName).trim();
  const exact = list.findIndex((p) => p.name === name || p.name === rawName);
  if (exact !== -1) return exact;
  const starts = list
    .map((p, i) => (p.name.startsWith(name) || name.startsWith(p.name) ? i : -1))
    .filter((i) => i !== -1);
  if (starts.length === 1) return starts[0];
  return -1;
}

function stampBuyin(player, delta, at = Date.now()) {
  if (!(delta > 0)) return player;
  const events = [...(player.buyinEvents || [])];
  events.push({ amount: delta, at, total: r2(+player.buyin || 0) });
  return { ...player, buyinEvents: events };
}

/* --------------------------- החלת הפקודות ---------------------------
   כל הודעה נרשמת ב-live.applied לפי מזהה ההודעה, יחד עם מה שהיא עשתה.
   זה פותר שני דברים בבת אחת:

   עריכה — הודעה שנערכה מגיעה עם אותו מזהה. מבטלים את מה שהיא עשתה קודם
   ומחילים מחדש את הגרסה החדשה.

   כפילות — Whapi חוזרת לפעמים על שליחה שנכשלה. בלי הרישום הזה כניסה
   הייתה נספרת פעמיים, וזה באג ששקט ומגלים אותו רק בסוף הערב.
   -------------------------------------------------------------------- */

function blank(live) {
  return {
    entriesCount: live?.entriesCount ?? "",
    addAmt: live?.addAmt || 50,
    startedAt: live?.startedAt || null,
    players: [...(live?.players || [])],
    applied: { ...(live?.applied || {}) },
    pending: live?.pending ?? null,
    closing: live?.closing ?? false, // סגירה מודרכת בעיצומה
    pendingApprovals: [...(live?.pendingApprovals || [])],
    approvedNames: [...(live?.approvedNames || [])],
    pendingRemindedAt: live?.pendingRemindedAt ?? null,
    bitIdleRemindedAt: live?.bitIdleRemindedAt ?? null,
    /* טיפים: יוצאים מערימת השחקן. tipsGiven על השחקן + יומן tips.
       tipComplimentBag — שקית מחמאות בלי חזרה ברצף. */
    tips: [...(live?.tips || [])],
    tipComplimentBag: Array.isArray(live?.tipComplimentBag) ? [...live.tipComplimentBag] : [],
    tipComplimentLast: live?.tipComplimentLast ?? null,
    coupleFills: [...(live?.coupleFills || [])],
  };
}

const openPlayers = (state) => state.players.filter((p) => p.cashout === "" || p.cashout == null);

/** מבטל את מה שהודעה קודמת עם אותו מזהה כבר עשתה. */
function undo(state, entries) {
  for (const e of [...entries].reverse()) {
    const i = state.players.findIndex((p) => p.name === e.name);
    if (i === -1) continue;
    if (e.t === "add") {
      if (e.created) state.players.splice(i, 1);
      else state.players[i] = { ...state.players[i], buyin: r2((+state.players[i].buyin || 0) - e.delta) };
    } else if (e.t === "out") {
      state.players[i] = { ...state.players[i], cashout: e.before };
    } else if (e.t === "tip") {
      const tipsGiven = Math.max(0, r2((+state.players[i].tipsGiven || 0) - e.amount));
      state.players[i] = { ...state.players[i], tipsGiven };
      if (e.tipId != null) {
        state.tips = (state.tips || []).filter((t) => t.id !== e.tipId);
      }
      if (e.bagBefore) {
        state.tipComplimentBag = e.bagBefore;
        state.tipComplimentLast = e.lastBefore ?? null;
      }
    } else if (e.t === "pending") {
      state.pendingApprovals = (state.pendingApprovals || []).filter(
        (p) => !(p.name === e.name && p.amount === e.amount && p.at === e.at)
      );
    } else if (e.t === "approve") {
      const j = state.players.findIndex((p) => p.name === e.name);
      if (e.created && j !== -1) state.players.splice(j, 1);
      if (e.pending) state.pendingApprovals = [...(state.pendingApprovals || []), e.pending];
      state.approvedNames = (state.approvedNames || []).filter((n) => n !== e.name);
    } else if (e.t === "rename") {
      renameEverywhere(state, e.to, e.from);
    }
  }
  // הסרה מוחזרת בסוף, אחרי שכל השאר חזר למקומו
  for (const e of [...entries].reverse()) {
    if (e.t === "remove") state.players.splice(e.at, 0, e.player);
    if (e.t === "entries") state.entriesCount = e.before;
  }
}

export const PENDING_REMIND_MS = 8 * 60 * 1000;
/** כמה זמן בלי עדכון ביט לפני תזכורת (ברירת מחדל: שעתיים). */
export const BIT_IDLE_REMIND_MS = 2 * 60 * 60 * 1000;

function ownerRemindText(state) {
  const list = state.pendingApprovals || [];
  if (!list.length) return null;
  return [
    `${BOT_MARK} תזכורת — עדיין ממתין לאישור`,
    "",
    ...list.map((p) => `• ${p.name} · ${p.amount}₪`),
    "",
    "אשר שם · דחה שם · טעות · לא",
  ].join("\n");
}

function groupPendingNudge(state) {
  const list = state.pendingApprovals || [];
  if (!list.length) return "";
  return `${BOT_MARK} תזכורת: ממתין מחוץ לשולחן — ${list.map((p) => p.name).join(", ")} · אשר / דחה / טעות`;
}

/** חותמת עדכון הביט האחרון: startedAt או buyinEvents.at המאוחר ביותר. */
export function lastBitActivityAt(live) {
  let latest = live?.startedAt || 0;
  for (const p of live?.players || []) {
    for (const e of p.buyinEvents || []) {
      const at = +e?.at || 0;
      if (at > latest) latest = at;
    }
  }
  return latest || null;
}

function ownerBitIdleText(state, now = Date.now()) {
  const players = state?.players || [];
  if (!players.length) return null;
  const pot = r2(players.reduce((t, p) => t + (+p.buyin || 0), 0));
  const last = lastBitActivityAt(state);
  const idleMin = last ? Math.max(1, Math.round((now - last) / 60_000)) : null;
  const idleLabel =
    idleMin == null
      ? ""
      : idleMin >= 120
        ? `${Math.round(idleMin / 60)} שע׳`
        : `${idleMin} דק׳`;
  return [
    `${BOT_MARK} תזכורת — אין עדכון ביט כבר זמן`,
    "",
    `משחק פעיל · ${players.length} שחקנים · קופה ${pot}₪`,
    idleLabel ? `בלי ביט כבר ${idleLabel}` : null,
    "",
    "רשום ביט בקבוצה או באפליקציה.",
  ]
    .filter((line) => line != null)
    .join("\n");
}

function groupBitIdleNudge() {
  return `${BOT_MARK} תזכורת: לא נרשם ביט כבר זמן · יש עדכון?`;
}

/** תזכורת כשיש ממתינים ועבר ה-cooldown. בלי פקודה (שיחה בקבוצה) — רק DM. */
export function maybeRemindPending(live, now = Date.now(), { groupNudge = false } = {}) {
  const pending = live?.pendingApprovals || [];
  if (!pending.length) return null;
  const last = live.pendingRemindedAt || Math.min(...pending.map((p) => p.at || now));
  if (now - last < PENDING_REMIND_MS) return null;
  const next = { ...live, pendingRemindedAt: now };
  return {
    live: next,
    ownerDm: ownerRemindText(next),
    reply: groupNudge ? groupPendingNudge(next) : null,
  };
}

/**
 * תזכורת כשמשחק חי פעיל ואין עדכון ביט זמן רב.
 * בלי פקודה (שיחה בקבוצה) — רק DM; groupNudge מוסיף נדנוד קצר לקבוצה.
 */
export function maybeRemindBitIdle(live, now = Date.now(), { groupNudge = false } = {}) {
  const players = live?.players || [];
  if (!players.length) return null;
  const lastBit = lastBitActivityAt(live);
  if (!lastBit) return null;
  const last = live.bitIdleRemindedAt || lastBit;
  if (now - last < BIT_IDLE_REMIND_MS) return null;
  const next = { ...live, bitIdleRemindedAt: now };
  return {
    live: next,
    ownerDm: ownerBitIdleText(next, now),
    reply: groupNudge ? groupBitIdleNudge() : null,
  };
}

/** מחליף שם בכל מקומות הלייב של ערב פעיל (שולחן, ממתינים, טיפים…). */
function renameEverywhere(state, from, to) {
  for (const p of state.players || []) {
    if (p.name === from) p.name = to;
  }
  if (state.pending === from) state.pending = to;
  state.pendingApprovals = (state.pendingApprovals || []).map((p) =>
    p.name === from ? { ...p, name: to } : p
  );
  state.approvedNames = (state.approvedNames || []).map((n) => (n === from ? to : n));
  state.tips = (state.tips || []).map((t) => (t.name === from ? { ...t, name: to } : t));
  state.coupleFills = (state.coupleFills || []).map((c) => {
    if (!c || typeof c !== "object") return c;
    const next = { ...c };
    if (next.name === from) next.name = to;
    if (next.a === from) next.a = to;
    if (next.b === from) next.b = to;
    return next;
  });
}

function decoratePendingReminder(result, now) {
  if (!result) return result;
  const live = result.live;
  if (!live) return result;
  const pending = live.pendingApprovals || [];
  if (!pending.length) {
    if (live.pendingRemindedAt) {
      const cleared = { ...live };
      delete cleared.pendingRemindedAt;
      return { ...result, live: cleared };
    }
    return result;
  }
  if (result.ownerDm) {
    return { ...result, live: { ...live, pendingRemindedAt: now } };
  }
  const last = live.pendingRemindedAt || Math.min(...pending.map((p) => p.at || 0));
  if (now - last < PENDING_REMIND_MS) return result;
  const nudged = { ...live, pendingRemindedAt: now };
  const nudge = groupPendingNudge(nudged);
  return {
    ...result,
    live: nudged,
    ownerDm: ownerRemindText(nudged),
    reply: result.reply ? `${result.reply}\n\n${nudge}` : nudge,
  };
}

export function applyCommands(live, cmds, msgId, cps = CPS, opts = {}) {
  const now = opts.now ?? Date.now();
  return decoratePendingReminder(applyCommandsCore(live, cmds, msgId, cps, { ...opts, now }), now);
}

function applyCommandsCore(live, cmds, msgId, cps = CPS, opts = {}) {
  const now = opts.now ?? Date.now();
  const state = blank(live);
  const report = () =>
    buildReport({ players: state.players, entriesCount: state.entriesCount, startedAt: state.startedAt, cps });

  // פקודות מידע — לא נוגעות בנתונים ולכן יוצאות כאן
  if (cmds.length === 1 && READ_ONLY.has(cmds[0].kind)) {
    const cmd = cmds[0];

    if (cmd.kind === "help") return { live, reply: helpText() };

    if (cmd.kind === "link") {
      const url = cmd.siteUrl && cmd.slug ? `${cmd.siteUrl}/g/${cmd.slug}` : null;
      return {
        live,
        reply: url
          ? `${BOT_MARK} הטבלה של הקבוצה:\n${url}\n\nצריך להתחבר עם Google בכניסה.`
          : `${BOT_MARK} הלינק לא מוגדר.`,
      };
    }

    if (!state.players.length) {
      const waiting = state.pendingApprovals || [];
      if (waiting.length) {
        return {
          live: state,
          reply: `${BOT_MARK} אין עדיין שחקנים בשולחן.\nממתינים לאישור: ${waiting.map((p) => p.name).join(", ")} · אשר / דחה / טעות`,
        };
      }
      return { live, reply: `${BOT_MARK} אין משחק פעיל.` };
    }

    if (cmd.kind === "status") {
      return { live, reply: `${BOT_MARK} תמונת מצב\n\n${snapshot(state, cps)}\n\n${report()}` };
    }

    // סיכום כשיש עוד פתוחים — נכנסים לסגירה מודרכת: שם ← ג'יטונים ← הבא
    const open = openPlayers(state);
    if (open.length) {
      state.closing = true;
      state.pending = null;
      return {
        live: state,
        reply: `${BOT_MARK} סוגרים את הערב 🎯\n\n${closingStatus(state, cps)}\n\nממי מתחילים? תכתוב שם ואני אשאל כמה ג'יטונים.\nאפשר גם ישר: "דן יצא 300".`,
      };
    }
    const pot = r2(state.players.reduce((t, p) => t + (+p.buyin || 0), 0));
    state.closing = false;
    return {
      live: state,
      reply: `${BOT_MARK} חשבון סופי · קופה ${pot}₪\n\n${settleSummary(state, cps)}${appSettlementCta(cmds)}`,
    };
  }

  if (msgId && state.applied[msgId]) {
    undo(state, state.applied[msgId]);
    delete state.applied[msgId];
  }

  const record = [];
  const acks = [];
  const problems = [];

  for (let cmd of cmds) {
    if (READ_ONLY.has(cmd.kind)) continue;

    if (cmd.kind === "settleCancel") {
      if (state.closing) {
        state.closing = false;
        state.pending = null;
        acks.push("סגירת הערב בוטלה — ממשיכים לשחק");
      }
      continue;
    }

    if (cmd.kind === "rename") {
      const fromRaw = cmd.from;
      const toName = (ALIASES[cmd.to.trim()] || cmd.to).trim();
      if (!toName || toName === fromRaw) {
        problems.push("צריך שני שמות שונים: תקן ישן → חדש");
        continue;
      }
      const seated = findPlayer(state.players, fromRaw);
      if (seated.ambiguous) {
        problems.push(`${fromRaw} → ${seated.ambiguous.join(" / ")}`);
        continue;
      }
      const pendingIdx = pickPending(state.pendingApprovals || [], fromRaw);
      const fromSeated = seated.index !== -1 ? state.players[seated.index].name : null;
      const fromPending =
        pendingIdx >= 0 ? state.pendingApprovals[pendingIdx].name : null;
      const fromName = fromSeated || fromPending;
      if (!fromName) {
        problems.push(`${fromRaw} לא בשולחן ולא ממתין לאישור`);
        continue;
      }
      if (fromName === toName) {
        problems.push(`${fromName} כבר נקרא כך`);
        continue;
      }
      const clash = state.players.find(
        (p) => p.name === toName && p.name !== fromName
      );
      if (clash) {
        problems.push(`${toName} כבר בשולחן — לא מחליפים אוטומטית`);
        continue;
      }
      renameEverywhere(state, fromName, toName);
      record.push({ t: "rename", from: fromName, to: toName });
      const where = [
        fromSeated ? "בשולחן" : null,
        fromPending ? "בממתינים" : null,
      ]
        .filter(Boolean)
        .join(" + ");
      acks.push(`תוקן: ${fromName} → ${toName}${where ? ` (${where})` : ""}`);
      continue;
    }

    if (cmd.kind === "approve" || cmd.kind === "reject") {
      const pending = state.pendingApprovals || [];
      const idx = pickPending(pending, cmd.name);
      if (idx === -2) {
        problems.push(`כמה ממתינים — כתוב אשר + שם (${pending.map((p) => p.name).join(", ")})`);
        continue;
      }
      if (idx < 0) {
        if (!pending.length) continue; // "כן" בקבוצה בלי המתנה — מתעלמים
        problems.push(cmd.name ? `${cmd.name} לא ממתין לאישור` : "אין שחקן שממתין לאישור");
        continue;
      }
      const item = pending[idx];
      state.pendingApprovals = pending.filter((_, i) => i !== idx);
      if (cmd.kind === "reject") {
        record.push({ t: "pending", name: item.name, amount: item.amount, at: item.at });
        acks.push(`${item.name} נדחה — לא נכנס לשולחן`);
        continue;
      }
      const already = findPlayer(state.players, item.name);
      if (already.index !== -1) {
        const p = state.players[already.index];
        const buyin = r2((+p.buyin || 0) + item.amount);
        state.players[already.index] = stampBuyin({ ...p, buyin }, item.amount, now);
        record.push({ t: "approve", name: p.name, pending: item, created: false });
        if (!state.approvedNames.includes(p.name)) state.approvedNames.push(p.name);
        acks.push(`${p.name} אושר · +${item.amount}₪ · סה״כ ${buyin}₪`);
        continue;
      }
      const seated = {
        name: item.name,
        buyin: item.amount,
        cashout: "",
        buyinEvents: [{ amount: item.amount, at: now, total: item.amount }],
      };
      state.players.push(seated);
      state.startedAt = state.startedAt || Date.now();
      if (!state.approvedNames.includes(item.name)) state.approvedNames.push(item.name);
      record.push({ t: "approve", name: item.name, pending: item, created: true });
      acks.push(`${item.name} אושר · נכנס ב-${item.amount}₪`);
      continue;
    }

    /* שם בלבד — חלק מהסגירה המודרכת: מסמן את השחקן הבא ושואל כמה ג'יטונים.
       מחוץ למצב סגירה זו סתם הודעה בקבוצה ומתעלמים ממנה בשקט. */
    if (cmd.kind === "nameOnly") {
      if (!state.closing) continue;
      const who = findPlayer(state.players, cmd.name);
      if (who.ambiguous) {
        return { live: state, reply: `${BOT_MARK} מתכוון ל־${who.ambiguous.join(" או ")}? תדייק.` };
      }
      if (who.index === -1) {
        const open = openPlayers(state);
        return {
          live: state,
          reply: `${BOT_MARK} לא מצאתי את "${cmd.name}" בשולחן.\nנשארו פתוחים: ${open.map((p) => p.name).join(", ")}`,
        };
      }
      const p = state.players[who.index];
      if (p.cashout !== "" && p.cashout != null) {
        /* שם של מי שכבר סגור = כנראה תיקון. שואלים שוב במקום לדחות —
           טעויות בספירת ג'יטונים מתגלות בדיוק בשלב הזה. */
        state.pending = p.name;
        return {
          live: state,
          reply: `${BOT_MARK} ${p.name} כבר רשום עם ${p.cashout} ג'יטונים — כמה במקום?\n("${p.name} חוזר" מחזיר אותו למשחק)`,
        };
      }
      state.pending = p.name;
      return { live: state, reply: `${BOT_MARK} כמה ג'יטונים ל${p.name}?` };
    }

    // תשובה למה שהבוט שאל. בלי שאלה פתוחה מספר בודד הוא סתם הודעה בקבוצה.
    if (cmd.kind === "answer") {
      if (!state.pending) continue;
      cmd = { kind: "cashout", name: state.pending, chips: cmd.chips };
    }

    if (cmd.kind === "ask") {
      const who = findPlayer(state.players, cmd.name);
      if (who.ambiguous) {
        problems.push(`${cmd.name} → ${who.ambiguous.join(" / ")}`);
        continue;
      }
      if (who.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      state.pending = state.players[who.index].name;
      return { live: state, reply: `${BOT_MARK} כמה ג'יטונים ל${state.pending}?` };
    }

    if (cmd.kind === "entries_left") {
      record.push({ t: "entries", before: state.entriesCount });
      const pot = state.players.reduce((t, p) => t + (+p.buyin || 0), 0);
      const next = r2(pot / 50 + cmd.left);
      state.entriesCount = String(next);
      acks.push(`המלאי תוקן: ${cmd.left} בחוץ · סה״כ ${next} כניסות`);
      continue;
    }

    if (cmd.kind === "entries") {
      record.push({ t: "entries", before: state.entriesCount });
      state.entriesCount = String(cmd.count);
      acks.push(`הוכנו ${cmd.count} כניסות`);
      continue;
    }

    if (cmd.kind === "entries_add") {
      record.push({ t: "entries", before: state.entriesCount });
      const next = (+state.entriesCount || 0) + cmd.delta;
      state.entriesCount = String(next);
      acks.push(`נוספו ${cmd.delta} כניסות · סה״כ ${next}`);
      continue;
    }

    const found = findPlayer(state.players, cmd.name);
    if (found.ambiguous) {
      problems.push(`${cmd.name} → ${found.ambiguous.join(" / ")}`);
      continue;
    }

    if (cmd.kind === "remove") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      record.push({ t: "remove", name: p.name, at: found.index, player: p });
      state.players.splice(found.index, 1);
      acks.push(`${p.name} הוסר מהשולחן`);
      continue;
    }

    if (cmd.kind === "reopen") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      if (p.cashout === "" || p.cashout == null) {
        problems.push(`${p.name} בכלל לא סגור`);
        continue;
      }
      record.push({ t: "out", name: p.name, before: p.cashout });
      state.players[found.index] = { ...p, cashout: "" };
      acks.push(`${p.name} חזר לשולחן — היציאה בוטלה`);
      continue;
    }

    /* טיפ מג'יטונים של השחקן (לא מהקופה).
       tipsGiven מצטבר לסטטיסטיקה; cashout ב־₪ נשאר כפי שנרשם.
       אם כבר יש cashout מספרי — מורידים מהערימה שנרשמה (הטיפ יצא ממנה).
       שיאי ג'יטונים ביציאה משתמשים ב-cashout אחרי ההורדה. */
    if (cmd.kind === "tip") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      const amount = Math.max(0, +cmd.chips || 0);
      if (!amount) {
        problems.push(`טיפ של 0 לא נספר`);
        continue;
      }
      const tipId = `${msgId || "tip"}_${record.length}_${Date.now()}`;
      const bagBefore = [...(state.tipComplimentBag || [])];
      const lastBefore = state.tipComplimentLast;
      const female = isFemaleName(p.name);
      const { template, bag, last, bagKey, lastKey } = nextTipCompliment(state, { female });
      state[bagKey] = bag;
      state[lastKey] = last;
      // תאימות לאחור לשדות הישנים
      if (!female) {
        state.tipComplimentBag = bag;
        state.tipComplimentLast = last;
      }
      const tipsGiven = r2((+p.tipsGiven || 0) + amount);
      let next = { ...p, tipsGiven };
      if (p.cashout !== "" && p.cashout != null) {
        next.cashout = String(Math.max(0, (+p.cashout || 0) - amount));
      }
      state.players[found.index] = next;
      state.tips = [...(state.tips || []), { id: tipId, name: p.name, amount, at: Date.now() }];
      record.push({
        t: "tip",
        name: p.name,
        amount,
        tipId,
        bagBefore,
        lastBefore,
        female,
      });
      // BOT_MARK מתווסף אוטומטית על כל ack
      acks.push(formatTipCompliment(template, p.name, amount));
      continue;
    }

    if (cmd.kind === "cashout") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      // סגירה חוזרת = עדכון. דורסים את הערך הקודם ואומרים את זה במפורש
      const wasClosed = p.cashout !== "" && p.cashout != null;
      record.push({ t: "out", name: p.name, before: p.cashout ?? "" });
      const closed = { ...p, cashout: String(cmd.chips) };
      state.players[found.index] = closed;
      if (state.pending === p.name) state.pending = null;
      acks.push(
        `${wasClosed ? "עודכן: " : ""}${p.name} יצא עם ${cmd.chips} ג\'יטונים · ${settleLine(closed, cps)}`
      );
      continue;
    }

    // הוספה או הפחתה
    if (found.index === -1) {
      if (cmd.amount <= 0) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const name = found.resolved || cmd.name;
      const extras = [
        ...(state.players || []).map((p) => p.name),
        ...(state.approvedNames || []),
      ];
      if (!isKnownName(name, opts.knownNames, extras)) {
        const at = now;
        const existing = (state.pendingApprovals || []).find((p) => p.name === name);
        if (existing) {
          existing.amount = r2(existing.amount + cmd.amount);
          existing.at = at;
          record.push({ t: "pending", name, amount: cmd.amount, at });
          acks.push(`${name} עדיין ממתין לאישור עדן · ${existing.amount}₪`);
        } else {
          state.pendingApprovals = [...(state.pendingApprovals || []), { name, amount: cmd.amount, at }];
          record.push({ t: "pending", name, amount: cmd.amount, at });
          acks.push(`שחקן חדש — מחכה לאישור עדן: ${name} · ${cmd.amount}₪`);
        }
        continue;
      }
      const seated = {
        name,
        buyin: cmd.amount,
        cashout: "",
        buyinEvents: [{ amount: cmd.amount, at: now, total: cmd.amount }],
      };
      state.players.push(seated);
      state.startedAt = state.startedAt || Date.now();
      record.push({ t: "add", name, delta: cmd.amount, created: true });
      acks.push(`${name} נכנס ב-${cmd.amount}₪`);
      continue;
    }

    const p = state.players[found.index];
    const buyin = Math.max(0, r2((+p.buyin || 0) + cmd.amount));
    const delta = r2(buyin - (+p.buyin || 0));
    let next = { ...p, buyin };
    if (delta > 0) next = stampBuyin(next, delta, now);
    state.players[found.index] = next;
    record.push({ t: "add", name: p.name, delta });
    acks.push(`${p.name} ${cmd.amount > 0 ? "+" : ""}${cmd.amount}₪ · סה״כ ${buyin}₪`);
  }

  if (!acks.length && !problems.length) return { live, reply: null };

  if (msgId) state.applied[msgId] = record;
  state.ts = Date.now();
  /* ביט חדש מאפס את תזכורת השקט — השעון מתחיל מחדש מפעילות אמיתית. */
  if (record.some((e) => e.t === "add" || e.t === "approve")) {
    delete state.bitIdleRemindedAt;
  }

  /* גם האזהרות מקבלות את סימן הבוט. תשובה שכולה אזהרות התחילה פעם ב-⚠️,
     עברה את פילטר ההד (שבודק רק את תחילת ההודעה) ופורסרה מחדש — ככה
     נהרס סיום הערב של 6.8.26. */
  const head = [...acks.map((a) => `${BOT_MARK} ${a}`), ...problems.map((x) => `${BOT_MARK} ⚠️ ${x}`)].join("\n");
  let ownerDm = null;
  if (record.some((e) => e.t === "pending")) ownerDm = ownerAskText(state);
  else if (record.some((e) => e.t === "rename")) {
    const renames = record.filter((e) => e.t === "rename");
    ownerDm = [
      `${BOT_MARK} תיקון שם בלייב`,
      "",
      ...renames.map((e) => `• ${e.from} → ${e.to}`),
      "",
      "הערב ממשיך — רק השם עודכן.",
    ].join("\n");
  }

  /* סגירה מודרכת: אחרי כל סגירה שואלים מי הבא, וכשנסגר האחרון —
     החשבון הסופי יוצא לקבוצה לבד, בלי שביקשו "סיכום" שוב. */
  if (state.closing) {
    const open = openPlayers(state);
    if (!open.length) {
      state.closing = false;
      state.pending = null;
      const pot = r2(state.players.reduce((t, p) => t + (+p.buyin || 0), 0));
      const cta =
        appSettlementCta(cmds) ||
        "\n\nלשמירת הערב וחלוקת ההעברות — האפליקציה.";
      return {
        live: state,
        reply: `${head}\n\n${BOT_MARK} כולם סגורים! חשבון סופי · קופה ${pot}₪\n\n${settleSummary(state, cps)}${cta}`,
        ownerDm,
      };
    }
    return {
      live: state,
      reply: `${head}\n\n${closingStatus(state, cps)}\n\nמי הבא? נשארו: ${open.map((p) => p.name).join(", ")}`,
      ownerDm,
    };
  }

  /* טיפ בלבד — רק משפט המחמאה, בלי דוח הכניסות. */
  const onlyTips = record.length > 0 && record.every((e) => e.t === "tip") && !problems.length;
  if (onlyTips) return { live: state, reply: head, ownerDm };

  return { live: state, reply: `${head}\n\n${report()}`, ownerDm };
}

function ownerAskText(state) {
  const list = state.pendingApprovals || [];
  if (!list.length) return null;
  return [
    `${BOT_MARK} שחקן חדש מחכה לאישור`,
    "",
    ...list.map((p) => `• ${p.name} · ${p.amount}₪`),
    "",
    "אשר שם",
    "דחה שם · טעות · לא",
    "אפשר גם בקבוצה.",
  ].join("\n");
}

/** תאימות לאחור — פקודה בודדת. */
export function applyCommand(live, cmd, cps = CPS) {
  return applyCommands(live, [cmd], null, cps);
}

/* --------------------------- תמונת מצב ---------------------------
   מה שאי אפשר לקרוא מרשימת הביט לבד: כמה עוד בשולחן, כמה מהמלאי יצא,
   וכמה זמן משחקים.
   ---------------------------------------------------------------- */
function snapshot(state, cps = CPS) {
  const ps = state.players;
  const closed = ps.filter((p) => p.cashout !== "" && p.cashout != null);
  const pot = r2(ps.reduce((t, p) => t + (+p.buyin || 0), 0));
  const prepared = state.entriesCount === "" || state.entriesCount == null ? null : +state.entriesCount || 0;

  // רק מה שאין בדוח שמתחתיו — התאריך, השעון ומונה הכניסות כבר שם
  const rows = [
    `${ps.length} שחקנים · ${ps.length - closed.length} בשולחן · ${closed.length} סגרו`,
    `קופה ${pot}₪ · ${r2(pot * cps)} ג'יטונים`,
  ];
  if (prepared !== null && prepared - pot / 50 <= 3) rows.push(`⚠️ נשארו ${r2(prepared - pot / 50)} כניסות בלבד`);
  if (state.pending) rows.push(`⏳ מחכה לג'יטונים של ${state.pending}`);
  return rows.join("\n");
}

/* ------------------------ מצב ביניים בסגירה ------------------------
   נשלח עם "סיום משחק" ואחרי כל שחקן שנסגר: כמה כל אחד נכנס, מי כבר סגור
   ועם מה, ומי עוד פתוח — כדי שאפשר יהיה להמשיך בלי לגלול אחורה. */
function closingStatus(state, cps = CPS) {
  const pot = r2(state.players.reduce((t, p) => t + (+p.buyin || 0), 0));
  const netWord = (p) => {
    const net = netOf(p, cps);
    if (net === 0) return "סגר באפס";
    return net > 0 ? `מגיע ${net}₪` : `חייב ${-net}₪`;
  };
  const { winners, even, losers, open } = partitionByNet(state.players, cps);
  const closedLine = (x) =>
    `✅ ${x.p.name} · נכנס ${r2(+x.p.buyin || 0)}₪ · יצא ${r2(+x.p.cashout || 0)} ג׳ · ${netWord(x.p)}`;
  const openLine = (p) => `⏳ ${p.name} · נכנס ${r2(+p.buyin || 0)}₪`;
  const groups = [
    winners.map(closedLine),
    even.map(closedLine),
    losers.map(closedLine),
    open.map(openLine),
  ].filter((g) => g.length);
  const lines = groups.flatMap((g, i) => (i ? ["", ...g] : g));
  return [`קופה ${pot}₪ · ${r2(pot * cps)} ג'יטונים`, ...lines].join("\n");
}

/* -------------------------- חשבון סופי --------------------------
   זוכים קודם (הגדול קודם + מדליות 1–3), אחריהם מי שסגר באפס, ובסוף
   החייבים (החוב הקטן קודם, הגדול אחרון) — עם שורת רווח בין הקבוצות.
   בסוף בלוק טיפים: שבח למי שנתן, צחוק על מי שלא. */
function settleSummary(state, cps = CPS) {
  const withNet = state.players.map((p) => ({ p, net: netOf(p, cps) }));
  const winSorted = withNet.filter((x) => x.net > 0).sort((a, b) => b.net - a.net);
  const win = assignPodiumMedals(winSorted, (x) => x.net).map(({ item: x, medal }) => {
    const line = settleLine(x.p, cps);
    return medal ? `${medal} ${line}` : line;
  });
  const even = withNet.filter((x) => x.net === 0).map((x) => settleLine(x.p, cps));
  /* חייבים: חוב קטן קודם (−50 לפני −150) */
  const owe = withNet
    .filter((x) => x.net < 0)
    .sort((a, b) => b.net - a.net)
    .map((x) => settleLine(x.p, cps));
  const body = [win, even, owe].filter((g) => g.length).map((g) => g.join("\n")).join("\n\n");

  const tipLines = tipSummaryForSession(state, withNet);
  if (!tipLines) return body;
  return `${body}\n\n${tipLines}`;
}

/* ------------------------------ עזרה ------------------------------ */
export function helpText() {
  return [
    `${BOT_MARK} מה אני יודע לעשות`,
    "",
    "כניסה 💰",
    "*דן 50* — הכי מהיר (כשמשחק פעיל)",
    "דן עוד 50 · דן נכנס 50",
    "דן עוד — סכום ברירת המחדל",
    "",
    "סגירת שחקן 🎯",
    "*דן יצא 300* — יצא עם 300 ג'יטונים",
    "דן יצא — ואז אשאל כמה",
    "",
    "טיפים 💸",
    "*אופיר טיפ 10* — טיפ מג'יטונים (מהערימה שלו)",
    "אופיר נתן טיפ 10 · אופיר 10 טיפ",
    "",
    "סיום הערב 🏁",
    "*סיום משחק* — מראה מי נכנס בכמה ומי עוד פתוח,",
    "וסוגרים אחד־אחד עד חשבון סופי אוטומטי",
    "בטל סיום — יציאה מהסגירה",
    "",
    "מצב 📊",
    "*קופה* — תמונת מצב של השולחן",
    "לינק — הקישור לצפייה",
    "",
    "תיקונים 🛠",
    "דן פחות 50 — ביטול כניסה",
    "הסר דן — הסרת שחקן",
    "*תקן אופיר → אופיר סנה* — תיקון שם בלייב",
    "תקן אופיר ל-אופיר סנה · תקן אופיר -> אופיר סנה",
    "*דן יצא 350* — תיקון ג'יטונים אחרי סגירה (דורס)",
    "דן חוזר — ביטול יציאה, חוזר לשולחן",
    "",
    "מלאי כניסות",
    "כניסות 30 · עוד 5 כניסות",
    "נשארו 3 כניסות — תיקון המונה למה שבקופסה",
    "",
    "בוט (רק המנהל)",
    "בוט · בוט הדלק · בוט כבה",
    "",
    "שחקן חדש",
    "אשר שם · דחה שם · טעות · לא",
    "שם לא מוכר מחכה בחוץ עד שאישור — הבוט מזכיר אם שכחת",
  ].join("\n");
}

/* ---------------------------- שליחה ל-Whapi ---------------------------- */
export async function sendToGroup(text, { token, groupId }) {
  const res = await fetch(`${WHAPI_BASE}/messages/text`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: groupId, body: text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Whapi send failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const out = await res.json().catch(() => ({}));
  // שליחה מסמנת את המספר כ"מחובר", ואז הטלפון מפסיק לקבל התראות.
  // מאפסים מיד — ההתראות של עדן שוות יותר מהחיווי "אונליין" של הבוט.
  await setPresenceOffline(token);
  return out;
}

/* ------------------------------------------------------------------
   סטטוס "לא מחובר" ל-WhatsApp.

   כשערוץ ה-API מדווח נוכחות online, וואטסאפ מניח שאתה פעיל במכשיר אחר
   ומפסיק לשלוח התראות דחיפה לטלפון. הקריאה הזאת מאפסת את הנוכחות.
   נקראת אחרי כל שליחה של הבוט ואחרי כל הודעה שעדן שולח מהטלפון.
   כישלון כאן לא מפיל שום דבר — במקרה הגרוע ההתראות יתאחרו.
   ------------------------------------------------------------------ */
export async function setPresenceOffline(token) {
  try {
    await fetch(`${WHAPI_BASE}/presences/me`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ presence: "offline" }),
    });
  } catch {}
}

export async function listGroups(token) {
  const res = await fetch(`${WHAPI_BASE}/groups?count=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Whapi groups failed (${res.status})`);
  return res.json();
}

/* --------------------------- עזרי הודעה נכנסת --------------------------- */
const digits = (v) => String(v || "").replace(/\D/g, "");

export function extractMessage(body) {
  const list = Array.isArray(body?.messages) ? body.messages : [];
  for (const m of list) {
    const text = m?.text?.body ?? (typeof m?.text === "string" ? m.text : null);
    if (!text) continue;
    return {
      text,
      chatId: m.chat_id || m.chatId || "",
      from: digits(m.from),
      fromMe: m.from_me === true || m.fromMe === true,
      id: m.id,
    };
  }
  return null;
}

/* מי רשאי לפקד.
   בחרתי רשימה מפורשת ולא "מנהלי הקבוצה" משתי סיבות: משיכת רשימת המנהלים
   מ-Whapi עולה בקשה בכל הודעה ותאכל את המכסה, ומנהל בקבוצה הוא לא בהכרח מי
   שאתה רוצה שיזיז לך כסף. להוספה — WHATSAPP_ALLOWED ב-Vercel, מספרים
   מופרדים בפסיק. */
export function isAllowed(msg, ownerPhone, allowedList = "") {
  if (msg.fromMe) return true;
  const numbers = [ownerPhone, ...String(allowedList).split(",")]
    .map(digits)
    .filter((n) => n.length >= 9);
  return numbers.some((n) => msg.from.endsWith(n.slice(-9)));
}

// שם ישן, נשמר כדי לא לשבור קוד קיים
export const isOwner = isAllowed;
