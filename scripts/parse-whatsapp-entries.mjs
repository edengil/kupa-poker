/**
 * מפרק ייצוא וואטסאפ לרשימות ביט מצטברות, ומפיק קובץ קומפקטי של
 * חותמות זמן לכניסות. לא ממציא זמנים — רק כשמופיעה עלייה בסכום.
 *
 * שימוש:
 *   node scripts/parse-whatsapp-entries.mjs [path-to-_chat.txt]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_ALIASES, r2 } from "../components/poker/helpers.js";
import { hostPlayerFromLocation } from "../components/poker/hosts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ENTRY = 50;
const SESSION_GAP_MS = 10 * 3600 * 1000;
const NIGHT_CUTOFF_HOUR = 8;

const EXTRA_ALIASES = {
  פריצי: "פריצי",
  פריצו: "פריצי",
  משה: "משה אלבז",
  "משה אלבז": "משה אלבז",
  נועם: "נועם",
  לאון: "לאון",
  אוראל: "אוראל",
  הדר: "הדר",
  מייקי: "מייקי",
  אור: "אור",
  אריאל: "אריאל",
  איתי: "איתי",
  דולב: "דולב",
  מתן: "מתן",
  "דן ויסמן": "דן ויסמן",
  "דן וייסמן": "דן ויסמן",
  "אורן גיל": "אורן גיל",
  "עדן גיל": "עדן גיל",
  "עדן לירז": "עדן לירז",
  "עדן גורשמוב": "עדן לירז",
  "דוד בני גיל": "דוד בני גיל",
  "נתנאל כהן": "נתנאל כהן",
  "אופיר סנה": "אופיר סנה",
  "קובי סעדה": "קובי סעדה",
  "שגיא גיל": "שגיא גיל",
  "דור לירז": "דור לירז",
  "איציק תפילין": "איציק תפילין",
  "דן ינקלויץ": "דן ינקלויץ",
  "עדן שפאק": "עדן שפאק",
};

const ALIASES = { ...EXTRA_ALIASES, ...DEFAULT_ALIASES };
const KNOWN_FULL = new Set([...Object.values(ALIASES), ...Object.keys(EXTRA_ALIASES)]);

const SKIP_NAME = /^(?:כניסות|התחלנו|קופה|סה["״]?כ|מתוכם|חשבון|ביט|מזומן|מוזמן|שעות|דק)$/;
const SKIP_NAME_PART = /העביר|הרוויח|קיבל|לקח|מינוס|צריך|שילמתי|תעביר|פלוס|מינוס/;
const SKIP_LINE = /(?:מגיע|מגיעה|חייב|חייבת|סגר|סגרה|מעביר|מעבירה|מקבל|מקבלת|העביר|הרוויח|התחלנו|כניסות מתוכם|https?:\/\/)/;
const PLAYER_LINE =
  /^([\u0590-\u05FF][\u0590-\u05FF\s'"׳״.\-]{0,28}?)\s+(\d+)\s*(?:ב?ביט|ב?מזומן|מוזמן)(?:\s+(\d+)\s*(?:ב?ביט|ב?מזומן|מוזמן))?\s*$/;
const HEADER =
  /^[\u00a0\u200b-\u200f\u202a-\u202e\ufeff]*\[(\d{1,2})\.(\d{1,2})\.(\d{4}),\s+(\d{1,2}):(\d{2}):(\d{2})\]\s(.+?): ?/;

function pad(n) {
  return String(n).padStart(2, "0");
}

function stripMarks(s) {
  return String(s || "")
    .replace(/[\u00a0\u200b-\u200f\u202a-\u202e\ufeff]/g, "")
    .replace(/\s*‏?<ההודעה נערכה>\s*/g, "")
    .replace(/🤖\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonChatName(raw) {
  const t = stripMarks(raw).replace(/\s+/g, " ");
  if (!t) return "";
  if (ALIASES[t]) return ALIASES[t];
  if (KNOWN_FULL.has(t)) return t;
  const hits = [...KNOWN_FULL].filter((n) => n.startsWith(t) || t.startsWith(n));
  if (hits.length === 1) return hits[0];
  return t;
}

export function parsePlayerLine(line) {
  const clean = stripMarks(line);
  if (!clean || SKIP_LINE.test(clean)) return null;
  const m = clean.match(PLAYER_LINE);
  if (!m) return null;
  const nameRaw = m[1].trim();
  if (nameRaw.length < 2 || SKIP_NAME.test(nameRaw) || SKIP_NAME_PART.test(nameRaw)) return null;
  if (nameRaw.split(/\s+/).length > 3) return null;
  const amount = +m[2] + (m[3] ? +m[3] : 0);
  if (!Number.isFinite(amount) || amount < 10 || amount > 2500) return null;
  return { name: canonChatName(nameRaw), amount };
}

export function parseWhatsAppMessages(text) {
  const lines = String(text || "").split(/\r?\n/);
  const messages = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(HEADER);
    if (m) {
      if (cur) messages.push(cur);
      const d = +m[1],
        mo = +m[2],
        y = +m[3],
        h = +m[4],
        mi = +m[5],
        s = +m[6];
      cur = {
        d,
        mo,
        y,
        h,
        mi,
        s,
        sender: stripMarks(m[7]),
        text: line.slice(m[0].length),
        at: Date.parse(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}+03:00`),
      };
    } else if (cur) {
      cur.text += `\n${line}`;
    }
  }
  if (cur) messages.push(cur);
  return messages;
}

function isDeleted(text) {
  return /ההודעה הזו נמחקה|מחקת את ההודעה/.test(text || "");
}

export function snapshotFromMessage(msg) {
  if (!msg || isDeleted(msg.text)) return null;
  /* הודעת סיכום עלולה להשאיר שורת ביט שנשכחה — לא צילום קנייה. */
  if (settlementKind(msg.text) >= 2) return null;
  const totals = {};
  let hits = 0;
  for (const line of String(msg.text).split(/\r?\n/)) {
    const p = parsePlayerLine(line);
    if (!p) continue;
    hits += 1;
    totals[p.name] = p.amount; // רשימה מצטברת — הערך האחרון באותה הודעה מנצח
  }
  if (hits < 1) return null;
  if (hits === 1) {
    const onlyName = Object.keys(totals)[0];
    const only = totals[onlyName];
    if (!only || only % 10 !== 0) return null;
    if (!KNOWN_FULL.has(onlyName) && !DEFAULT_ALIASES[onlyName]) return null;
  }
  return { at: msg.at, y: msg.y, mo: msg.mo, d: msg.d, h: msg.h, totals, hits };
}

export function nightIsoOf(snap) {
  let y = snap.y,
    mo = snap.mo,
    d = snap.d;
  if (snap.h < NIGHT_CUTOFF_HOUR) {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    y = dt.getUTCFullYear();
    mo = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
  }
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function extractNights(messages) {
  const snaps = [];
  for (const msg of messages) {
    const snap = snapshotFromMessage(msg);
    if (snap) snaps.push(snap);
  }

  const nights = [];
  let cur = null;
  for (const snap of snaps) {
    const iso = nightIsoOf(snap);
    const gap = cur ? snap.at - cur.lastAt : 0;
    const splitAfternoonToEvening =
      cur &&
      snap.h >= 18 &&
      cur.lastH != null &&
      cur.lastH >= 8 &&
      cur.lastH < 17 &&
      gap > 2 * 3600 * 1000;
    const newNight =
      !cur ||
      gap > SESSION_GAP_MS ||
      (iso !== cur.iso && gap > 6 * 3600 * 1000) ||
      splitAfternoonToEvening;
    if (newNight) {
      /* התחלה = רשימת כניסות (לפחות שני שמות), לא שורת ביט בודדת. */
      if (snap.hits < 2) continue;
      if (cur) nights.push(cur);
      cur = { iso, firstAt: snap.at, lastAt: snap.at, lastH: snap.h, prev: {}, events: {}, lastTotal: {} };
    }
    for (const [name, total] of Object.entries(snap.totals)) {
      const prev = cur.prev[name] || 0;
      if (total > prev) {
        const delta = r2(total - prev);
        if (!cur.events[name]) cur.events[name] = [];
        cur.events[name].push({ at: snap.at, amount: delta });
      }
      /* הצילום האחרון מנצח גם אחרי תיקון טעות (1500→200). */
      cur.prev[name] = total;
      cur.lastTotal[name] = total;
    }
    cur.lastAt = snap.at;
    cur.lastH = snap.h;
  }
  if (cur) nights.push(cur);
  return { snapshots: snaps.length, nights };
}

export function buildEntryTimings(messages) {
  const { snapshots, nights } = extractNights(messages);
  const byPlayer = {};
  let events = 0;
  for (const night of nights) {
    for (const [name, ev] of Object.entries(night.events)) {
      const total = night.lastTotal[name] || 0;
      const entries = r2(total / ENTRY);
      if (!byPlayer[name]) byPlayer[name] = {};
      const existing = byPlayer[name][night.iso];
      if (!existing || ev.length >= (existing.t || []).length) {
        byPlayer[name][night.iso] = {
          n: entries,
          t: ev.map((e) => e.at),
          a: ev.map((e) => e.amount),
          /* b = סכום הקנייה האחרון ברשימת ביט (מצטבר), לא סכום כל הצילומים */
          b: total,
        };
      }
      events += ev.length;
    }
  }
  for (const name of Object.keys(byPlayer)) {
    const known = KNOWN_FULL.has(name) || DEFAULT_ALIASES[name];
    const nightCount = Object.keys(byPlayer[name]).length;
    if (!known && nightCount < 2) delete byPlayer[name];
  }
  events = 0;
  for (const nightsOf of Object.values(byPlayer)) {
    for (const row of Object.values(nightsOf)) events += (row.t || []).length;
  }
  const ats = messages.map((m) => m.at).filter((t) => Number.isFinite(t));
  const meta = {
    source: "whatsapp-export",
    messages: messages.length,
    snapshots,
    nights: nights.length,
    events,
    players: Object.keys(byPlayer).length,
    dateFrom: ats.length ? new Date(Math.min(...ats)).toISOString().slice(0, 10) : null,
    dateTo: ats.length ? new Date(Math.max(...ats)).toISOString().slice(0, 10) : null,
  };
  return { meta, nights: byPlayer };
}

const MONTHS_HE =
  "ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר";
const NIGHT_SUMMARY_DATE = /סיכום(?:\s*פוקר)?\s*\d{1,2}\.\d{1,2}/;
const MIN_SPAN_MS = 15 * 60 * 1000;
/* חלון חיפוש לסיכום אמיתי (גם אחה״צ למחרת). לא ממציאים סיום. */
const MAX_SPAN_MS = 36 * 3600 * 1000;
const START_CLOCK_SLACK_MS = 90 * 60 * 1000;

/** סיכום חודש/רבעון/שנה — לא סיום ערב. */
export function isPeriodSummary(text) {
  const t = stripMarks(text);
  if (/סיכום\s+פוקר\s*[-–]/.test(t)) return true;
  if (
    new RegExp(`סיכום[^\\n]{0,80}(?:${MONTHS_HE}|רבעון|חצי\\s*שנה|שנת\\s+\\d{4})`).test(t) &&
    !NIGHT_SUMMARY_DATE.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * 3 = סיכום ערב מפורש, 2 = כמה שורות מגיע/חייב, 1 = יציאת בוט, 0 = לא סיום.
 * מפצלים שורות לפני ניקוי רווחים — אחרת "ביט" בשורת קנייה פוסל את כל הסיכום.
 */
export function settlementKind(text) {
  if (!text || isPeriodSummary(text)) return 0;
  const raw = String(text);
  if (/חשבון סופי|כולם סגורים/.test(raw)) return 3;
  let hits = 0;
  for (const line of raw.split(/\n/)) {
    const t = stripMarks(line);
    if (!t) continue;
    if (!/(?:מגיע|מגיעה|חייב|חייבת)\s+\d+/.test(t)) continue;
    hits += 1;
  }
  if (NIGHT_SUMMARY_DATE.test(raw)) return 3;
  const first = stripMarks(raw.split(/\n/)[0] || "");
  if (/^סיכום(?:\s+פוקר)?\s*:?\s*$/.test(first) && hits >= 2) return 3;
  if (hits >= 3) return 2;
  if (/יצא עם\s+\d+/.test(raw)) return 1;
  return 0;
}

const SETTLEMENT_NET =
  /^([\u0590-\u05FF][\u0590-\u05FF\s'"׳״.\-]{0,28}?)\s+(מגיע|מגיעה|חייב|חייבת)\s+(\d+)/;

/**
 * נטו מהסיכום. שורות ביט שנשכחו (דוד בני 150 ביט) לא נספרות.
 * כפילות מגיע/חייב — המופע האחרון מנצח, פעם אחת לשחקן.
 */
export function parseSettlementNets(text) {
  if (settlementKind(text) < 2) return null;
  const nets = {};
  for (const line of String(text).split(/\n/)) {
    const t = stripMarks(line);
    if (!t) continue;
    const m = t.match(SETTLEMENT_NET);
    if (!m) continue;
    const name = canonChatName(m[1].trim());
    if (!name) continue;
    const amt = +m[3];
    if (!Number.isFinite(amt)) continue;
    const win = m[2] === "מגיע" || m[2] === "מגיעה";
    nets[name] = win ? amt : -amt;
  }
  return nets;
}

function clockOnIso(iso, h, mi) {
  const [y, mo, d] = String(iso).split("-").map(Number);
  if (!y || !mo || !d) return NaN;
  let hour = h;
  let day = d;
  let month = mo;
  let year = y;
  /* שעת סיום אחרי חצות שייכת ללילה שהתחיל בערב הקודם — כאן זה רק התחלה. */
  if (hour < NIGHT_CUTOFF_HOUR) {
    /* התחלנו 01:00 = לפנות בוקר, אותו iso כבר הוזז. מחברים ליום שלמחרת. */
    const dt = new Date(Date.UTC(year, month - 1, day + 1));
    year = dt.getUTCFullYear();
    month = dt.getUTCMonth() + 1;
    day = dt.getUTCDate();
  }
  return Date.parse(
    `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(mi)}:00+03:00`
  );
}

function refineStart(night, messages) {
  let start = night.firstAt;
  if (!start) return null;
  for (const msg of messages) {
    if (msg.at < start - START_CLOCK_SLACK_MS || msg.at > start + 3 * 3600 * 1000) continue;
    const m = stripMarks(msg.text).match(/🕐\s*התחלנו\s+(\d{1,2}):(\d{2})/);
    if (!m) continue;
    const clock = clockOnIso(night.iso, +m[1], +m[2]);
    if (!Number.isFinite(clock)) continue;
    if (Math.abs(clock - start) <= START_CLOCK_SLACK_MS) {
      start = Math.min(start, clock);
    }
  }
  return start;
}

/**
 * התחלה = חותמת ההודעה הראשונה בערב עם רשימת כניסות.
 * סיום = רק הודעת סיכום מפורשת (המילה סיכום / חשבון סופי).
 * מגיע/חייב בלי כותרת סיכום — לא סיום. לא ממציאים שעות.
 */
export function buildNightSpans(messages) {
  const { nights } = extractNights(messages);
  const spans = {};
  const netsWithoutSummary = [];
  let complete = 0;
  let startOnly = 0;

  for (let i = 0; i < nights.length; i++) {
    const night = nights[i];
    const start = night.firstAt;
    if (!start) {
      startOnly += 1;
      continue;
    }
    const nextStart = nights[i + 1]?.firstAt;
    const windowEnd =
      nextStart != null ? Math.min(nextStart, start + MAX_SPAN_MS) : start + MAX_SPAN_MS;
    let end3 = null;
    let end2 = null;
    for (const msg of messages) {
      if (msg.at < start || msg.at >= windowEnd) continue;
      const kind = settlementKind(msg.text);
      if (kind >= 3) end3 = msg.at;
      else if (kind === 2) end2 = msg.at;
    }
    if (end3 && end3 > start) {
      spans[night.iso] = { s: start, e: end3 };
      complete += 1;
    } else {
      const row = { s: start };
      if (night.lastAt) row.lb = night.lastAt;
      if (end2 && end2 > start) {
        row.n2 = end2;
        netsWithoutSummary.push({ iso: night.iso, s: start, n2: end2, lb: night.lastAt || null });
      }
      spans[night.iso] = row;
      startOnly += 1;
    }
  }

  const startOnlyNights = Object.entries(spans)
    .filter(([, x]) => x.s && !x.e)
    .map(([iso, x]) => ({ iso, s: x.s, lb: x.lb || null }));

  const ats = Object.values(spans).flatMap((x) => [x.s, x.e, x.lb].filter((t) => t != null));
  const meta = {
    source: "whatsapp-export",
    complete,
    startOnly,
    skippedLong: 0,
    skippedShort: 0,
    nights: nights.length,
    startOnlyNights,
    netsWithoutSummary,
    dateFrom: ats.length ? new Date(Math.min(...ats)).toISOString().slice(0, 10) : null,
    dateTo: ats.length ? new Date(Math.max(...ats)).toISOString().slice(0, 10) : null,
  };
  return { meta, spans };
}

function senderHouse(sender) {
  const s = stripMarks(sender);
  if (/eden gil/i.test(s)) return "עדן גיל";
  if (s.includes("אופיר סנה")) return "אופיר סנה";
  if (s.includes("נתנאל כהן")) return "נתנאל כהן";
  if (s.includes("איציק תפילין")) return "איציק תפילין";
  if (s.includes("שגיא גיל")) return "שגיא גיל";
  if (s.includes("עדן שפאק")) return "עדן שפאק";
  if (s.includes("אורנצוק")) return "עדן גיל";
  if (s.includes("דור לירז") || /גורשמ/.test(s) || s.includes("עדן לירז")) return "דור לירז";
  return null;
}

function namedHostInText(text) {
  const t = String(text || "");
  if (/אצל\s+עדן\s+שפאק|אצל\s+שפאק/.test(t)) return "עדן שפאק";
  if (/אצל\s+עדן\s+לירז|אצל\s+דור/.test(t)) return "דור לירז";
  if (/אצל\s+נתנאל/.test(t)) return "נתנאל כהן";
  if (/אצל\s+איציק/.test(t)) return "איציק תפילין";
  if (/אצל\s+אופיר/.test(t)) return "אופיר סנה";
  if (/אצל\s+שגיא/.test(t)) return "שגיא גיל";
  if (/אצל\s+עדן(?:\s|$|·|,|ב)/.test(t)) return "עדן גיל";
  return null;
}

const SELF_HOST = /(?:^|[^\u0590-\u05FF])(?:אצלי|אצלנו)(?=[^\u0590-\u05FF]|$)/;
const REJECT_HOST = /אי\s*אפשר\s+אצל|לא יהיה אצל|לא אצלנו|לא אצלי|בסוף לא אצל/;
const CONFIRM_HOST = /פוקר אצל|ניפגש אצל|הערב אצל|היום אצל|מוזמנים.{0,24}אצל|יאלה.{0,16}אצל|חברים.{0,36}אצל|פוקר אצלי|פוקר אצלנו/;
const OFFER_HOST = /אפשר אצל|מי רוצה.{0,36}אצל|רוצים.{0,36}אצל/;

/**
 * אזכור מארח בהודעה — confirm / offer / reject, או null.
 */
export function hostMention(text, sender) {
  const t = stripMarks(text);
  if (!t) return null;
  const house = senderHouse(sender);

  const loc = t.match(/📍\s*(אצל[^\n]+)/);
  if (loc) {
    const p = hostPlayerFromLocation(loc[1]) || namedHostInText(loc[1]);
    if (p) return { player: p, strength: "confirm" };
  }

  const named = namedHostInText(t);
  const self = SELF_HOST.test(t);
  if (REJECT_HOST.test(t)) {
    const p = named || house;
    if (p) return { player: p, strength: "reject" };
    return null;
  }

  if (named) {
    if (OFFER_HOST.test(t) && !CONFIRM_HOST.test(t)) return { player: named, strength: "offer" };
    return { player: named, strength: "confirm" };
  }

  if (self && house) {
    if (OFFER_HOST.test(t) && !CONFIRM_HOST.test(t) && !/\d{1,2}:\d{2}/.test(t)) {
      return { player: house, strength: "offer" };
    }
    if (CONFIRM_HOST.test(t) || /\d{1,2}:\d{2}/.test(t) || /היום|הערב|בערב/.test(t)) {
      return { player: house, strength: "confirm" };
    }
    return { player: house, strength: "offer" };
  }
  return null;
}

function hostTargetIso(msg) {
  /* אחה״צ/ערב של אותו יום → ליל אותו תאריך. אחרי חצות → nightIsoOf. */
  if (msg.h >= 8 && msg.h < 20) {
    return `${msg.y}-${pad(msg.mo)}-${pad(msg.d)}`;
  }
  return nightIsoOf(msg);
}

/**
 * מארח לכל ליל ביט — ההכרזה האחרונה לפני תחילת הקופה.
 */
export function buildNightHosts(messages) {
  const { nights } = extractNights(messages);
  const pending = {};
  for (const msg of messages) {
    if (isDeleted(msg.text)) continue;
    const snap = snapshotFromMessage(msg);
    if (snap && snap.hits >= 3) continue;
    const hit = hostMention(msg.text, msg.sender);
    if (!hit) continue;
    const iso = hostTargetIso(msg);
    if (hit.strength === "reject") {
      if (pending[iso] === hit.player) delete pending[iso];
      continue;
    }
    if (hit.strength === "confirm" || pending[iso] == null) pending[iso] = hit.player;
  }

  const hosts = {};
  for (const night of nights) {
    const name = pending[night.iso];
    if (name) hosts[night.iso] = name;
  }

  const meta = {
    source: "whatsapp-export",
    nights: Object.keys(hosts).length,
    dateFrom: Object.keys(hosts).sort()[0] || null,
    dateTo: Object.keys(hosts).sort().slice(-1)[0] || null,
  };
  return { meta, hosts };
}

function renderHostsFile({ meta, hosts }) {
  const keys = Object.keys(hosts).sort();
  const body = {};
  for (const iso of keys) body[iso] = hosts[iso];
  return [
    "/* נגזר מייצוא וואטסאפ — לא לערוך ידנית.",
    "   scripts/parse-whatsapp-entries.mjs",
    "   מארח ללילה (שם קנוני), בלי הצ'אט הגולמי. */",
    "",
    `export const CHAT_HOST_META = ${JSON.stringify(meta, null, 2)};`,
    "",
    "export const CHAT_NIGHT_HOSTS = " + JSON.stringify(body) + ";",
    "",
    "export function chatHostFor(iso) {",
    "  if (!iso) return null;",
    "  return CHAT_NIGHT_HOSTS[iso] || null;",
    "}",
    "",
  ].join("\n");
}

function renderSpansFile({ meta, spans }) {
  const keys = Object.keys(spans).sort();
  const body = {};
  for (const iso of keys) body[iso] = spans[iso];
  return [
    "/* נגזר מייצוא וואטסאפ — לא לערוך ידנית.",
    "   scripts/parse-whatsapp-entries.mjs",
    "   התחלה/סיום ללילה (חותמות), בלי הצ'אט הגולמי. */",
    "",
    `export const CHAT_SPAN_META = ${JSON.stringify(meta, null, 2)};`,
    "",
    "export const CHAT_NIGHT_SPANS = " + JSON.stringify(body) + ";",
    "",
    "export function chatSpanFor(iso) {",
    "  if (!iso) return null;",
    "  return CHAT_NIGHT_SPANS[iso] || null;",
    "}",
    "",
  ].join("\n");
}

function renderFile({ meta, nights }) {
  const names = Object.keys(nights).sort((a, b) => a.localeCompare(b, "he"));
  const body = {};
  for (const name of names) body[name] = nights[name];
  return [
    "/* נגזר מייצוא וואטסאפ — לא לערוך ידנית.",
    "   scripts/parse-whatsapp-entries.mjs",
    "   אין כאן את הצ'אט הגולמי, רק חותמות זמן של עליות קנייה. */",
    "",
    `export const CHAT_ENTRY_META = ${JSON.stringify(meta, null, 2)};`,
    "",
    "export const CHAT_ENTRY_NIGHTS = " + JSON.stringify(body) + ";",
    "",
    "export function chatNightsFor(playerName) {",
    "  if (!playerName) return null;",
    "  return CHAT_ENTRY_NIGHTS[playerName] || null;",
    "}",
    "",
  ].join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const input = process.argv[2] || path.join(ROOT, "_scratch_wa", "_chat.txt");
  const output = process.argv[3] || path.join(ROOT, "components", "poker", "entryTimings.js");
  const spansOut = process.argv[4] || path.join(ROOT, "components", "poker", "chatNightSpans.js");
  const hostsOut = process.argv[5] || path.join(ROOT, "components", "poker", "chatHosts.js");
  if (!fs.existsSync(input)) {
    console.error("חסר קובץ צ'אט:", input);
    process.exit(1);
  }
  const text = fs.readFileSync(input, "utf8");
  const messages = parseWhatsAppMessages(text);
  const derived = buildEntryTimings(messages);
  fs.writeFileSync(output, renderFile(derived), "utf8");
  const spanDerived = buildNightSpans(messages);
  fs.writeFileSync(spansOut, renderSpansFile(spanDerived), "utf8");
  const hostDerived = buildNightHosts(messages);
  fs.writeFileSync(hostsOut, renderHostsFile(hostDerived), "utf8");
  const fmtIl = (ts) => {
    if (ts == null) return null;
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(new Date(ts));
  };
  const noSummary = (spanDerived.meta.startOnlyNights || [])
    .filter((n) => !(spanDerived.meta.netsWithoutSummary || []).some((x) => x.iso === n.iso))
    .map((n) => ({
      iso: n.iso,
      start: fmtIl(n.s),
      lastBit: n.lb ? fmtIl(n.lb) : null,
      note: "אין הודעת סיכום",
    }));
  const netsNoTitle = (spanDerived.meta.netsWithoutSummary || []).map((n) => ({
    iso: n.iso,
    start: fmtIl(n.s),
    netsAt: fmtIl(n.n2),
    lastBit: n.lb ? fmtIl(n.lb) : null,
    note: "יש מגיע/חייב בלי כותרת סיכום",
  }));
  console.log(JSON.stringify({
    wrote: output,
    spans: spansOut,
    hosts: hostsOut,
    entries: derived.meta,
    complete: spanDerived.meta.complete,
    startOnly: spanDerived.meta.startOnly,
    netsWithoutSummary: netsNoTitle.length,
    nights: spanDerived.meta.nights,
    hostNights: hostDerived.meta.nights,
    noSummary,
    netsNoTitle,
  }, null, 2));
}
