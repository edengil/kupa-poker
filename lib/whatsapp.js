/* ============================================================================
   שכבת הוואטסאפ — פירוק פקודות ושליחה חזרה דרך Whapi.

   במהלך משחק אתה לא רוצה לפתוח אפליקציה. אתה כותב בקבוצה "דן עוד 50",
   והקבוצה מקבלת בחזרה את מצב השולחן המלא.
   ============================================================================ */

import { buildReport, settleLine, CPS } from "./report";

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

/* --------------------------- פירוק פקודות --------------------------- */
/* רק מילים בעברית. + ו-− היו תופסים גם שורות מתוך הדוח של הבוט עצמו. */
const RE_ADD = /^(.+?)\s+(?:עוד|נכנס|נכנסת|פלוס|הוסף|כניסה)\s*(\d+)?\s*₪?\s*$/;
const RE_SUB = /^(.+?)\s+(?:פחות|מינוס|בטל)\s*(\d+)?\s*₪?\s*$/;
const CHIPS = "(?:ג'?יטונים|ג'?|צ'יפים|צ'ipim)?";
const RE_OUT = new RegExp(`^(.+?)\\s+(?:יצא|יוצא|סיים|סיימה|קאשאאוט)\\s+(\\d+)\\s*${CHIPS}\\s*$`);
const RE_STATUS = /^\s*(?:קופה|מצב|סטטוס|טבלה)\s*$/;

export function parseCommand(raw, defaultAmt = 50) {
  const text = (raw || "").trim();
  if (!text || text.startsWith(BOT_MARK)) return null;
  if (text.includes("\n")) return null; // פקודה היא תמיד שורה אחת

  if (RE_STATUS.test(text)) return { kind: "status" };

  let m = text.match(RE_OUT);
  if (m) return { kind: "cashout", name: m[1].trim(), chips: +m[2] };

  m = text.match(RE_ADD);
  if (m) return { kind: "add", name: m[1].trim(), amount: m[2] ? +m[2] : defaultAmt };

  m = text.match(RE_SUB);
  if (m) return { kind: "add", name: m[1].trim(), amount: -(m[2] ? +m[2] : defaultAmt) };

  return null;
}

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

/* --------------------------- החלת הפקודה --------------------------- */
export function applyCommand(live, cmd, cps = CPS) {
  const players = [...(live?.players || [])];
  const base = {
    entriesCount: live?.entriesCount ?? "",
    addAmt: live?.addAmt || 50,
    startedAt: live?.startedAt || null,
  };
  const report = (ps, startedAt = base.startedAt) =>
    buildReport({ players: ps, entriesCount: base.entriesCount, startedAt, cps });

  if (cmd.kind === "status") {
    if (!players.length) return { live, reply: `${BOT_MARK} אין משחק פעיל.` };
    return { live, reply: `${BOT_MARK}\n\n${report(players)}` };
  }

  const found = findPlayer(players, cmd.name);
  if (found.ambiguous) {
    return { live, reply: `${BOT_MARK} יש כמה שמתאימים: ${found.ambiguous.join(", ")}. תכתוב שם מלא.` };
  }

  const done = (ps, ack, startedAt) => ({
    live: { ...base, startedAt: startedAt ?? base.startedAt, players: ps, ts: Date.now() },
    reply: `${BOT_MARK} ${ack}\n\n${report(ps, startedAt ?? base.startedAt)}`,
  });

  if (cmd.kind === "cashout") {
    if (found.index === -1) return { live, reply: `${BOT_MARK} לא מצאתי את ${cmd.name} בשולחן.` };
    const p = players[found.index];
    const closed = { ...p, cashout: String(cmd.chips) };
    players[found.index] = closed;
    return done(players, `יצא עם ${cmd.chips} ג'יטונים · ${settleLine(closed, cps)}`);
  }

  if (found.index === -1) {
    if (cmd.amount <= 0) return { live, reply: `${BOT_MARK} לא מצאתי את ${cmd.name} בשולחן.` };
    const name = found.resolved || cmd.name;
    players.push({ name, buyin: cmd.amount, cashout: "" });
    const startedAt = base.startedAt || Date.now();
    return done(players, `${name} נכנס ב-${cmd.amount}₪`, startedAt);
  }

  const p = players[found.index];
  const buyin = Math.max(0, r2((+p.buyin || 0) + cmd.amount));
  players[found.index] = { ...p, buyin };
  return done(players, `${p.name} ${cmd.amount > 0 ? "+" : ""}${cmd.amount}₪ · סה״כ ${buyin}₪`);
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

export function isOwner(msg, ownerPhone) {
  if (msg.fromMe) return true;
  const owner = digits(ownerPhone);
  return owner.length > 0 && msg.from.endsWith(owner.slice(-9));
}
