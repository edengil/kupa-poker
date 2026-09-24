/* שיאי משך משחק — תקן זהב מהצ'אט:
   התחלה = רשימת כניסות ראשונה, סיום = הודעת סיכום.
   בלי סיכום לא ממציאים סיום (גם לא מזמני אפליקציה). */

import { durWords } from "./helpers.js";
import { CHAT_NIGHT_SPANS } from "./chatNightSpans.js";

function prevIso(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function lookupChatSpan(iso, spans = CHAT_NIGHT_SPANS) {
  if (!iso || !spans) return null;
  if (spans[iso]) return spans[iso];
  const prev = prevIso(iso);
  if (prev && spans[prev]) return spans[prev];
  return null;
}

function inAppDurationMs(s) {
  const sa = s?.startedAt != null ? +s.startedAt : NaN;
  const ea = s?.endedAt != null ? +s.endedAt : NaN;
  if (!Number.isFinite(sa) || !Number.isFinite(ea) || ea <= sa) return null;
  return ea - sa;
}

function completeChatMs(span) {
  if (span?.s == null || span?.e == null) return null;
  if (!(span.e > span.s)) return null;
  return span.e - span.s;
}

/** משך ערב במילישניות, או null אם אין זוג התחלה+סיכום */
export function sessionDurationMs(s, spans = CHAT_NIGHT_SPANS) {
  const chat = lookupChatSpan(s?.iso, spans);
  const fromChat = completeChatMs(chat);
  if (fromChat != null) return fromChat;
  /* לילה בצ'אט בלי סיכום — לא ממציאים סיום */
  if (chat && chat.s != null && chat.e == null) return null;
  return inAppDurationMs(s);
}

/** רשימת ערבים עם משך תקין, ממוינת לפי ms (יורד כברירת מחדל) */
export function timedSessions(sessions, { ascending = false, spans = CHAT_NIGHT_SPANS } = {}) {
  const list = [];
  for (const s of sessions || []) {
    const chat = lookupChatSpan(s?.iso, spans);
    const fromChat = completeChatMs(chat);
    const ms = sessionDurationMs(s, spans);
    if (ms == null) continue;
    list.push({
      ms,
      label: durWords(ms),
      d: s.d,
      mo: s.mo,
      y: s.y,
      iso: s.iso,
      source: fromChat != null ? "chat" : "app",
    });
  }
  list.sort((a, b) => (ascending ? a.ms - b.ms : b.ms - a.ms));
  return list;
}

/**
 * @returns {null | { longest, longest2, longest3, shortest, shortest2, shortest3, nightsWithTimes }}
 */
export function computeDurationRecords(db, { spans = CHAT_NIGHT_SPANS } = {}) {
  const sessions = [...(db.sessions || [])].sort((a, b) => a.iso.localeCompare(b.iso));
  const longestList = timedSessions(sessions, { spans }).filter((x) => x.ms >= 15 * 60 * 1000);
  if (!longestList.length) return null;
  const shortestList = [...longestList].sort((a, b) => a.ms - b.ms);

  return {
    longest: longestList[0] || null,
    longest2: longestList[1] || null,
    longest3: longestList[2] || null,
    shortest: shortestList[0] || null,
    shortest2: shortestList[1] || null,
    shortest3: shortestList[2] || null,
    nightsWithTimes: longestList.length,
  };
}
