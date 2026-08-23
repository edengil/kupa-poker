/* ============================================================================
   נעיצת סיכומים בוואטסאפ (Whapi).

   עדיפות כשיש מגבלת פינים (~3): שנתי > חודשי > ערב/משחק.
   מצב נעוצים נשמר ב-config.pins של שורת הקבוצה.
   ============================================================================ */

import { BOT_MARK } from "./botMark";

const WHAPI_BASE = "https://gate.whapi.cloud";

export const MAX_PINS = 3;

/** עדיפות גבוהה יותר = חשוב יותר (לא מורידים בשביל נמוך יותר). */
export const PIN_RANK = { night: 1, month: 2, year: 3 };

export const PIN_DURATION = {
  night: "week",
  month: "month",
  year: "month",
};

const SLOTS = ["night", "month", "year"];

export function normalizePins(raw) {
  const pins = {};
  if (!raw || typeof raw !== "object") return pins;
  for (const slot of SLOTS) {
    const v = raw[slot];
    if (v && typeof v === "object" && v.messageId) {
      pins[slot] = {
        messageId: String(v.messageId),
        ...(v.iso ? { iso: String(v.iso) } : {}),
        ...(v.key ? { key: String(v.key) } : {}),
      };
    }
  }
  return pins;
}

export function extractSentMessageId(out) {
  if (!out || typeof out !== "object") return null;
  const id = out.message?.id ?? out.id ?? null;
  return id ? String(id) : null;
}

/** תאריך ISO (YYYY-MM-DD) לפי שעון ישראל. */
export function jerusalemIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/** מנסה לחלץ תאריך מ־«סיכום פוקר D.M» / «D.M.Y». */
export function nightIsoFromText(text, now = new Date()) {
  const t = String(text || "");
  const m = t.match(/סיכום פוקר\s+(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
  if (m) {
    const day = Number(m[1]);
    const mo = Number(m[2]);
    let y = m[3] ? Number(m[3]) : Number(jerusalemIso(now).slice(0, 4));
    if (y < 100) y += 2000;
    return `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return jerusalemIso(now);
}

/**
 * האם טקסט שנשלח לקבוצה הוא סיכום ערב / טיפים / חלוקה שכדאי לנעוץ.
 * לא כולל דוחות חודשיים/שנתיים (אלה מגיעים מ־/api/reports עם type מפורש).
 */
export function isNightShareText(text) {
  const t = String(text || "").trimStart();
  if (!t.startsWith(BOT_MARK)) return false;
  if (/סיכום פוקר/.test(t)) return true;
  if (/טיפים הערב/.test(t)) return true;
  if (/·\s*חלוקה/.test(t) || /\n.*חלוקה/.test(t)) return true;
  if (/חשבון סופי/.test(t)) return true;
  return false;
}

/** מיפוי kind מדוח תקופתי → סוג פין. */
export function pinTypeForReportKind(kind) {
  if (kind === "y") return "year";
  if (kind === "m" || kind === "q" || kind === "h") return "month";
  return null;
}

/**
 * אילו סלוטים משוחררים לפני ניסיון נעיצה (החלפת אותו סוג).
 * night תמיד מחליף את pins.night הקודם.
 */
export function slotsToReplace(type, pins, meta = {}) {
  const state = normalizePins(pins);
  const cur = state[type];
  if (!cur?.messageId) return [];
  if (type === "night") return ["night"];
  if (type === "month" || type === "year") {
    const key = meta.key;
    if (key && cur.key && cur.key === key && cur.messageId) return [type];
    return [type];
  }
  return [];
}

/**
 * בוחר קורבן לשחרור כשיש מגבלת פינים.
 * מחזיר את הסלוט בעדיפות הנמוכה ביותר שמותר להוריד בשביל incomingType.
 * null אם אין קורבן חוקי (למשל night לא מוריד month/year).
 */
export function pickUnpinVictim(pins, incomingType) {
  const state = normalizePins(pins);
  const needRank = PIN_RANK[incomingType] || 0;
  const candidates = SLOTS
    .filter((slot) => state[slot]?.messageId && PIN_RANK[slot] < needRank)
    .sort((a, b) => PIN_RANK[a] - PIN_RANK[b]);
  return candidates[0] || null;
}

/** רשימת סלוטים לפי סדר שחרור כפוי (עדיפות נמוכה קודם), לשימוש בטסטים. */
export function unpinOrderFor(incomingType) {
  const needRank = PIN_RANK[incomingType] || 0;
  return SLOTS.filter((slot) => PIN_RANK[slot] < needRank).sort(
    (a, b) => PIN_RANK[a] - PIN_RANK[b]
  );
}

export function setPinSlot(pins, type, entry) {
  const next = normalizePins(pins);
  next[type] = {
    messageId: String(entry.messageId),
    ...(entry.iso ? { iso: String(entry.iso) } : {}),
    ...(entry.key ? { key: String(entry.key) } : {}),
  };
  return next;
}

export function clearPinSlot(pins, type) {
  const next = normalizePins(pins);
  delete next[type];
  return next;
}

function looksLikePinLimit(status, body) {
  const s = `${body || ""}`.toLowerCase();
  if (/limit|maximum|max.?pin|too many|לא ניתן|מלא|capacity|quota/.test(s)) return true;
  // Whapi לעיתים מחזיר 400 גנרי — מטפלים בזה כמגבלת מקום אם יש קורבנות
  if (status === 400 || status === 409 || status === 429) return true;
  return false;
}

export async function pinMessage(messageId, time, token) {
  const res = await fetch(`${WHAPI_BASE}/messages/${encodeURIComponent(messageId)}/pin`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ time }),
  });
  if (res.ok) return { ok: true };
  const detail = await res.text().catch(() => "");
  return {
    ok: false,
    status: res.status,
    detail,
    limit: looksLikePinLimit(res.status, detail),
    admin: res.status === 401,
  };
}

export async function unpinMessage(messageId, token) {
  try {
    const res = await fetch(`${WHAPI_BASE}/messages/${encodeURIComponent(messageId)}/pin`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`[waPins] unpin failed (${res.status}):`, detail.slice(0, 160));
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[waPins] unpin error:", e?.message || e);
    return false;
  }
}

/**
 * נועץ הודעה עם ניהול עדיפויות ומצב.
 * @param {'night'|'month'|'year'} type
 * @param {string} messageId
 * @param {{ iso?: string, key?: string }} meta
 * @param {{ token: string, pins?: object, savePins?: (pins: object) => Promise<void> }} ctx
 */
export async function ensurePin(type, messageId, meta = {}, ctx = {}) {
  if (!type || !messageId || !ctx.token) {
    return { ok: false, skipped: "missing args" };
  }
  if (!PIN_RANK[type]) return { ok: false, skipped: "bad type" };

  let state = normalizePins(ctx.pins);
  const duration = PIN_DURATION[type];

  // החלפת פין מאותו סוג (ערב חדש / דוח חדש)
  for (const slot of slotsToReplace(type, state, meta)) {
    const prev = state[slot];
    if (prev?.messageId && prev.messageId !== messageId) {
      await unpinMessage(prev.messageId, ctx.token);
    }
    state = clearPinSlot(state, slot);
  }

  const trySave = async () => {
    if (typeof ctx.savePins === "function") {
      try {
        await ctx.savePins(state);
      } catch (e) {
        console.warn("[waPins] savePins failed:", e?.message || e);
      }
    }
  };

  for (let attempt = 0; attempt <= MAX_PINS; attempt++) {
    try {
      const result = await pinMessage(messageId, duration, ctx.token);
      if (result.ok) {
        state = setPinSlot(state, type, { messageId, ...meta });
        await trySave();
        return { ok: true, pins: state };
      }
      if (result.admin) {
        console.warn("[waPins] pin skipped — no admin rights");
        await trySave();
        return { ok: false, error: "no admin", pins: state };
      }
      if (!result.limit) {
        console.warn(`[waPins] pin failed (${result.status}):`, (result.detail || "").slice(0, 160));
        await trySave();
        return { ok: false, error: result.detail || "pin failed", pins: state };
      }
      const victim = pickUnpinVictim(state, type);
      if (!victim) {
        console.warn("[waPins] pin limit — no lower-priority pin to free");
        await trySave();
        return { ok: false, error: "limit", pins: state };
      }
      const victimId = state[victim].messageId;
      await unpinMessage(victimId, ctx.token);
      state = clearPinSlot(state, victim);
    } catch (e) {
      console.warn("[waPins] pin error:", e?.message || e);
      await trySave();
      return { ok: false, error: e?.message || String(e), pins: state };
    }
  }

  await trySave();
  return { ok: false, error: "exhausted", pins: state };
}

/**
 * נועץ אחרי שליחה — בלי להפיל את השליחה אם הנעיצה נכשלת.
 */
export async function pinAfterSend(type, sendResult, meta, ctx) {
  try {
    const messageId = extractSentMessageId(sendResult);
    if (!messageId) {
      console.warn("[waPins] no message id from send — skip pin");
      return { ok: false, skipped: "no message id" };
    }
    return await ensurePin(type, messageId, meta, ctx);
  } catch (e) {
    console.warn("[waPins] pinAfterSend:", e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
