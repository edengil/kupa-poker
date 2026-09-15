import fs from "fs";
import {
  parseWhatsAppMessages,
  buildNightSpans,
  buildEntryTimings,
  snapshotFromMessage,
  settlementKind,
  canonChatName,
} from "../scripts/parse-whatsapp-entries.mjs";

const text = fs.readFileSync(new URL("./_chat.txt", import.meta.url), "utf8");
const messages = parseWhatsAppMessages(text);
const { meta, spans } = buildNightSpans(messages);
const { nights: entryNights } = buildEntryTimings(messages);

function fmt(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function parseSummaryNets(text) {
  const nets = {};
  for (const line of String(text).split(/\n/)) {
    const t = line.trim();
    const owe = t.match(/^(.+?)\s+(?:חייב|חייבת)\s+(\d+)/);
    if (owe) {
      nets[canonChatName(owe[1].trim())] = -+owe[2];
      continue;
    }
    const win = t.match(/^(.+?)\s+(?:מגיע|מגיעה)\s+(\d+)/);
    if (win) nets[canonChatName(win[1].trim())] = +win[2];
  }
  return nets;
}

function auditNight(iso) {
  const sp = spans[iso];
  const out = { iso };
  if (!sp?.s) {
    out.error = "no start";
    return out;
  }
  out.start = fmt(sp.s);
  out.end = fmt(sp.e);
  out.startMs = sp.s;
  out.endMs = sp.e;

  let lastSnap = null;
  for (const msg of messages) {
    if (msg.at < sp.s) continue;
    if (sp.e && msg.at >= sp.e) break;
    const snap = snapshotFromMessage(msg);
    if (snap && settlementKind(msg.text) < 2) {
      lastSnap = { at: msg.at, totals: { ...snap.totals } };
    }
  }
  out.lastSnapAt = lastSnap ? fmt(lastSnap.at) : null;
  out.lastBuyins = lastSnap?.totals || null;

  let summaryMsg = null;
  for (const msg of messages) {
    if (msg.at < sp.s) continue;
    if (sp.e && msg.at > sp.e + 60000) break;
    if (settlementKind(msg.text) >= 2) summaryMsg = msg;
  }
  out.summaryAt = summaryMsg ? fmt(summaryMsg.at) : null;
  out.nets = summaryMsg ? parseSummaryNets(summaryMsg.text) : null;

  if (lastSnap?.totals && out.nets) {
    out.chips = {};
    for (const [name, net] of Object.entries(out.nets)) {
      const buyin = lastSnap.totals[name];
      if (buyin != null) out.chips[name] = (buyin + net) * 2;
    }
  }
  return out;
}

const CASES = [
  "2026-07-18",
  "2026-06-10",
  "2026-07-15",
  "2026-06-13",
  "2026-06-17",
  "2026-07-11",
];

const results = CASES.map(auditNight);
console.log(JSON.stringify({ spanMeta: meta, results }, null, 2));
