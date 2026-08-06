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
};

/* --------------------------- פירוק פקודות ---------------------------
   רק מילים בעברית. + ו-− היו תופסים גם שורות מתוך הדוח של הבוט עצמו.
   -------------------------------------------------------------------- */
const RE_ADD = /^(.+?)\s+(?:עוד|נכנס|נכנסת|פלוס|הוסף|כניסה)\s*(\d+)?\s*₪?\s*$/;
const RE_SUB = /^(.+?)\s+(?:פחות|מינוס|בטל)\s*(\d+)?\s*₪?\s*$/;
const CHIPS = "(?:ג'?יטונים|ג'?|צ'יפים)?";
const RE_OUT = new RegExp(`^(.+?)\\s+(?:יצא|יוצא|סיים|סיימה|קאשאאוט)\\s+(\\d+)\\s*${CHIPS}\\s*$`);
const RE_STATUS = /^\s*(?:קופה|מצב|סטטוס|טבלה)\s*$/;
/* מספר הכניסות שהוכנו. עד היום אפשר היה לקבוע אותו רק באפליקציה. */
const RE_ENTRIES = /^\s*כניסות\s+(\d+)\s*$/;
/* הסרת שחקן שנוסף בטעות. "פחות" רק מאפס לו את הקנייה ומשאיר אותו בשולחן. */
const RE_REMOVE = /^\s*(?:הסר|מחק|הורד)\s+(.+?)\s*$/;
/* "דן יצא" בלי מספר — הבוט שואל כמה ג'יטונים ומחכה לתשובה. */
const RE_OUT_ASK = /^\s*(.+?)\s+(?:יצא|יוצא|סיים|סיימה|קאשאאוט)\s*$/;
/* תשובה שהיא רק מספר. נחשבת פקודה רק אם הבוט באמת שאל משהו. */
const RE_NUMBER = /^\s*(\d+)\s*(?:ג'?יטונים|ג'?|צ'יפים)?\s*$/;
const RE_HELP = /^\s*(?:עזרה|פקודות|help|\?)\s*$/;
const RE_LINK = /^\s*(?:לינק|קישור|טבלה שלנו)\s*$/;
/* בודקת ומדווחת נטו. חלוקת ההעברות עצמה לא יוצאת מכאן — היא מוצגת
   באפליקציה, ונשלחת לקבוצה רק אחרי שאישרת אותה. */
const RE_SETTLE = /^\s*(?:סיכום|סגירה|סיום|חלוקה|חשבון סופי)(?:\s+משחק)?\s*$/;

/* פקודות שרק קוראות. הן לא נכנסות ללולאת השינויים ולא נרשמות ל-undo. */
const READ_ONLY = new Set(["status", "help", "link", "settle"]);

/* צורה חשופה: "דוד בני 50" בלי פועל. שימושית מאוד באמצע משחק, אבל גם רחבה
   מספיק כדי לתפוס שיחה רגילה ("מתחילים ב 21"), ולכן היא מותרת רק כשמשחק
   פעיל. לפני שהמשחק התחיל היא מתעלמת. */
const RE_BARE = /^(.+?)\s+(\d+)\s*₪?\s*$/;

function parseLine(text, defaultAmt, gameActive) {
  const line = (text || "").trim();
  if (!line || line.startsWith(BOT_MARK)) return null;

  if (RE_HELP.test(line)) return { kind: "help" };
  if (RE_LINK.test(line)) return { kind: "link" };
  if (RE_SETTLE.test(line)) return { kind: "settle" };
  if (RE_STATUS.test(line)) return { kind: "status" };

  let e = line.match(RE_ENTRIES);
  if (e) return { kind: "entries", count: +e[1] };

  let rm = line.match(RE_REMOVE);
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
    if (m) return { kind: "add", name: m[1].trim(), amount: +m[2] };
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
  };
}

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

    // סיכום — רק כשכולם סגרו, אחרת המספרים משקרים
    const open = state.players.filter((p) => p.cashout === "" || p.cashout == null);
    if (open.length) {
      return {
        live,
        reply: `${BOT_MARK} עוד לא סגרו: ${open.map((p) => p.name).join(", ")}\n\nתכתוב "<שם> יצא <ג\'יטונים>" לכל אחד, ואז סיכום שוב.`,
      };
    }
    const pot = r2(state.players.reduce((t, p) => t + (+p.buyin || 0), 0));
    const lines = [...state.players]
      .sort((a, b) => netOf(b, cps) - netOf(a, cps))
      .map((p) => settleLine(p, cps));
    return { live, reply: `${BOT_MARK} חשבון סופי · קופה ${pot}₪\n\n${lines.join("\n")}` };
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

    if (cmd.kind === "entries") {
      record.push({ t: "entries", before: state.entriesCount });
      state.entriesCount = String(cmd.count);
      acks.push(`הוכנו ${cmd.count} כניסות`);
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

  const head = [...acks.map((a) => `${BOT_MARK} ${a}`), ...problems.map((x) => `⚠️ ${x}`)].join("\n");
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

/* ------------------------------ עזרה ------------------------------ */
export function helpText() {
  return [
    `${BOT_MARK} מה אני יודע לעשות`,
    "",
    "הוספת כניסה",
    "  דן 50             (הקצר ביותר, כשמשחק פעיל)",
    "  דן עוד 50",
    "  דן נכנס 50",
    "  דן פלוס 50",
    "  דן עוד            (סכום ברירת המחדל)",
    "",
    "מספר הכניסות שהוכנו",
    "  כניסות 30",
    "",
    "הסרת שחקן שנוסף בטעות",
    "  הסר דן",
    "  מחק דן",
    "",
    "ביטול כניסה שנרשמה בטעות",
    "  דן פחות 50",
    "  דן מינוס 50",
    "",
    "סגירת שחקן",
    "  דן יצא 300 ג",
    "  דן יצא            (ואז אשאל כמה, ותכתוב מספר)",
    "  דן סיים 300",
    "",
    "מידע",
    "  קופה        מצב השולחן עכשיו",
    "  סיכום       חשבון סופי, אחרי שכולם סגרו",
    "  לינק        הקישור לצפייה",
    "  עזרה        ההודעה הזאת",
    "",
    "שם חלקי מספיק — דן תופס את דן ינקלויץ.",
    "שם שלא בשולחן מצטרף כשחקן חדש.",
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
