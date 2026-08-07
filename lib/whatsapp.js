/* ============================================================================
   שכבת הוואטסאפ — פירוק פקודות ושליחה חזרה דרך Whapi.

   במהלך משחק אתה לא רוצה לפתוח אפליקציה. אתה כותב בקבוצה "דן עוד 50",
   והקבוצה מקבלת בחזרה את מצב השולחן המלא.
   ============================================================================ */

import { buildReport, settleLine, netOf, CPS } from "./report";

const WHAPI_BASE = "https://gate.whapi.cloud";

// כל תשובה של הבוט מתחילה בסימן הזה, וכל הודעה שמתחילה בו מסוננת בכניסה.
// בלעדיו הבוט היה מפרסר את התשובות של עצמו ונכנס ללולאה.
export const BOT_MARK = "🤖";

const r2 = (v) => Math.round(v * 100) / 100;

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

  let el = line.match(RE_ENTRIES_LEFT);
  if (el) return { kind: "entries_left", left: +(el[1] || el[2]) };

  let ea = line.match(RE_ENTRIES_ADD);
  if (ea) return { kind: "entries_add", delta: +(ea[1] || ea[2]) };

  let e = line.match(RE_ENTRIES) || line.match(RE_ENTRIES_REV);
  if (e) return { kind: "entries", count: +e[1] };

  let rm = line.match(RE_REMOVE) || line.match(RE_REMOVE_REV);
  if (rm) return { kind: "remove", name: rm[1].trim() };

  let num = line.match(RE_NUMBER);
  if (num) return { kind: "answer", chips: +num[1] };

  let ask = line.match(RE_OUT_ASK);
  if (ask) return { kind: "ask", name: ask[1].trim() };

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
    }
  }
  // הסרה מוחזרת בסוף, אחרי שכל השאר חזר למקומו
  for (const e of [...entries].reverse()) {
    if (e.t === "remove") state.players.splice(e.at, 0, e.player);
    if (e.t === "entries") state.entriesCount = e.before;
  }
}

export function applyCommands(live, cmds, msgId, cps = CPS) {
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

    if (!state.players.length) return { live, reply: `${BOT_MARK} אין משחק פעיל.` };

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
    return { live: state, reply: `${BOT_MARK} חשבון סופי · קופה ${pot}₪\n\n${settleSummary(state, cps)}` };
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
        const open = openPlayers(state);
        return {
          live: state,
          reply: `${BOT_MARK} ${p.name} כבר סגור.\nנשארו פתוחים: ${open.map((x) => x.name).join(", ")}`,
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

    if (cmd.kind === "cashout") {
      if (found.index === -1) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const p = state.players[found.index];
      record.push({ t: "out", name: p.name, before: p.cashout ?? "" });
      const closed = { ...p, cashout: String(cmd.chips) };
      state.players[found.index] = closed;
      if (state.pending === p.name) state.pending = null;
      acks.push(`${p.name} יצא עם ${cmd.chips} ג\'יטונים · ${settleLine(closed, cps)}`);
      continue;
    }

    // הוספה או הפחתה
    if (found.index === -1) {
      if (cmd.amount <= 0) {
        problems.push(`${cmd.name} לא בשולחן`);
        continue;
      }
      const name = found.resolved || cmd.name;
      state.players.push({ name, buyin: cmd.amount, cashout: "" });
      state.startedAt = state.startedAt || Date.now();
      record.push({ t: "add", name, delta: cmd.amount, created: true });
      acks.push(`${name} נכנס ב-${cmd.amount}₪`);
      continue;
    }

    const p = state.players[found.index];
    const buyin = Math.max(0, r2((+p.buyin || 0) + cmd.amount));
    const delta = r2(buyin - (+p.buyin || 0));
    state.players[found.index] = { ...p, buyin };
    record.push({ t: "add", name: p.name, delta });
    acks.push(`${p.name} ${cmd.amount > 0 ? "+" : ""}${cmd.amount}₪ · סה״כ ${buyin}₪`);
  }

  if (!acks.length && !problems.length) return { live, reply: null };

  if (msgId) state.applied[msgId] = record;
  state.ts = Date.now();

  /* גם האזהרות מקבלות את סימן הבוט. תשובה שכולה אזהרות התחילה פעם ב-⚠️,
     עברה את פילטר ההד (שבודק רק את תחילת ההודעה) ופורסרה מחדש — ככה
     נהרס סיום הערב של 6.8.26. */
  const head = [...acks.map((a) => `${BOT_MARK} ${a}`), ...problems.map((x) => `${BOT_MARK} ⚠️ ${x}`)].join("\n");

  /* סגירה מודרכת: אחרי כל סגירה שואלים מי הבא, וכשנסגר האחרון —
     החשבון הסופי יוצא לקבוצה לבד, בלי שביקשו "סיכום" שוב. */
  if (state.closing) {
    const open = openPlayers(state);
    if (!open.length) {
      state.closing = false;
      state.pending = null;
      const pot = r2(state.players.reduce((t, p) => t + (+p.buyin || 0), 0));
      return {
        live: state,
        reply: `${head}\n\n${BOT_MARK} כולם סגורים! חשבון סופי · קופה ${pot}₪\n\n${settleSummary(state, cps)}\n\nלשמירת הערב וחלוקת ההעברות — האפליקציה.`,
      };
    }
    return {
      live: state,
      reply: `${head}\n\n${closingStatus(state, cps)}\n\nמי הבא? נשארו: ${open.map((p) => p.name).join(", ")}`,
    };
  }

  return { live: state, reply: `${head}\n\n${report()}` };
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
  const lines = state.players.map((p) =>
    p.cashout !== "" && p.cashout != null
      ? `✅ ${p.name} · נכנס ${r2(+p.buyin || 0)}₪ · יצא ${r2(+p.cashout || 0)} ג׳ · ${netWord(p)}`
      : `⏳ ${p.name} · נכנס ${r2(+p.buyin || 0)}₪`
  );
  return [`קופה ${pot}₪ · ${r2(pot * cps)} ג'יטונים`, ...lines].join("\n");
}

/* -------------------------- חשבון סופי --------------------------
   קודם החייבים (הגדול קודם), אחריהם מי שסגר באפס, ובסוף מי שמגיע לו
   (הגדול קודם) — עם שורת רווח בין הקבוצות, שיהיה ברור מי מעביר ומי מקבל. */
function settleSummary(state, cps = CPS) {
  const withNet = state.players.map((p) => ({ p, net: netOf(p, cps) }));
  const owe = withNet.filter((x) => x.net < 0).sort((a, b) => a.net - b.net);
  const even = withNet.filter((x) => x.net === 0);
  const win = withNet.filter((x) => x.net > 0).sort((a, b) => b.net - a.net);
  return [owe, even, win]
    .filter((g) => g.length)
    .map((g) => g.map((x) => settleLine(x.p, cps)).join("\n"))
    .join("\n\n");
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
    "",
    "מלאי כניסות",
    "כניסות 30 · עוד 5 כניסות",
    "נשארו 3 כניסות — תיקון המונה למה שבקופסה",
    "",
    "בוט (רק המנהל)",
    "בוט · בוט הדלק · בוט כבה",
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
  return res.json().catch(() => ({}));
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
