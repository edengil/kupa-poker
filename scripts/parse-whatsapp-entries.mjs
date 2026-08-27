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

function nightIsoOf(snap) {
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
    const newNight =
      !cur ||
      snap.at - cur.lastAt > SESSION_GAP_MS ||
      (iso !== cur.iso && snap.at - cur.lastAt > 6 * 3600 * 1000);
    if (newNight) {
      if (cur) nights.push(cur);
      cur = { iso, lastAt: snap.at, prev: {}, events: {}, lastTotal: {} };
    }
    for (const [name, total] of Object.entries(snap.totals)) {
      const prev = cur.prev[name] || 0;
      if (total > prev) {
        const delta = r2(total - prev);
        if (!cur.events[name]) cur.events[name] = [];
        cur.events[name].push({ at: snap.at, amount: delta });
      }
      if (total >= prev) {
        cur.prev[name] = total;
        cur.lastTotal[name] = total;
      }
    }
    cur.lastAt = snap.at;
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
  if (!fs.existsSync(input)) {
    console.error("חסר קובץ צ'אט:", input);
    process.exit(1);
  }
  const text = fs.readFileSync(input, "utf8");
  const messages = parseWhatsAppMessages(text);
  const derived = buildEntryTimings(messages);
  fs.writeFileSync(output, renderFile(derived), "utf8");
  console.log(JSON.stringify({ wrote: output, ...derived.meta }, null, 2));
}
