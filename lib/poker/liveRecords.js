/* שיאים חיים באמצע ערב — חישוב טהור.
   זיהוי שיא שמשמעותו נשבר תוך כדי המשחק (לפני הסגירה), מול בסיסי
   השיאים מההיסטוריה שנשמרה. סוף־ערב ממשיך לעבוד דרך brokenRecords;
   כאן רק מה שאפשר לדעת חי: יציאת ג'יטונים שכבר הוזנה, קנייה מצטברת
   של שחקן בערב אחד, וריבאיים בערב (מ־buyinEvents שנשמרים מהלייב).
   בלי נתון היסטורי — אין הכרזה. לא ממציאים בסיס. */

import { AL, canon, r2 } from "./helpers.js";
import { bestChipCashout } from "./chipRecords.js";
import { resolveEntryBuyin } from "./reconstructChips.js";

export const LIVE_RECORD_KINDS = ["cashout", "buyin", "rebuys"];

export const liveRecordKey = (kind, name) => `${kind}:${name}`;

const num = (n) => Math.round(Math.abs(n)).toLocaleString("en-US");

/**
 * בסיסי שיאים מההיסטוריה — מה שצריך לעקוף באמצע הערב.
 * @returns {{
 *   nights: number,
 *   bestCashout: { name: string, chips: number } | null,
 *   maxBuyin: { name: string, buyin: number } | null,
 *   maxRebuys: { name: string, rebuys: number } | null,
 * }}
 */
export function liveRecordBaselines(db) {
  const sessions = Array.isArray(db?.sessions) ? db.sessions : [];
  const A = AL(db || {});

  const chip = bestChipCashout(sessions, A);
  const bestCashout = chip ? { name: chip.name, chips: chip.chips } : null;

  let maxBuyin = null;
  let maxRebuys = null;
  for (const s of sessions) {
    for (const e of s.entries || []) {
      const nm = canon(e?.name || "", A);
      const { buyin } = resolveEntryBuyin(e, { iso: s.iso, aliases: A });
      if (buyin != null && buyin > 0 && (!maxBuyin || buyin > maxBuyin.buyin)) {
        maxBuyin = { name: nm, buyin };
      }
      const events = Array.isArray(e?.buyinEvents) ? e.buyinEvents : null;
      if (events && events.length > 1) {
        const rebuys = events.length - 1;
        if (!maxRebuys || rebuys > maxRebuys.rebuys) {
          maxRebuys = { name: nm, rebuys };
        }
      }
    }
  }

  return { nights: sessions.length, bestCashout, maxBuyin, maxRebuys };
}

/**
 * זיהוי שיאים חדשים במצב הלייב הנוכחי.
 * @param announced מפתחות (kind:name) שכבר הוכרזו הערב — מסוננים החוצה.
 * @returns {Array<{ key, kind, name, value, prev: { name, value } | null, line }>}
 */
export function detectLiveRecords({ db, players = [], announced = [] } = {}) {
  const sessions = Array.isArray(db?.sessions) ? db.sessions : [];
  // כמו brokenRecords: אין טעם ב"שיא" מול היסטוריה של כלום
  if (sessions.length < 5) return [];
  const A = AL(db || {});
  const base = liveRecordBaselines(db);
  const seen = new Set(Array.isArray(announced) ? announced : []);
  const out = [];

  const push = (kind, name, value, prev, line) => {
    const key = liveRecordKey(kind, name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, kind, name, value, prev, line });
  };

  for (const p of players || []) {
    if (!p?.name) continue;
    const name = canon(p.name, A);
    const buyin = r2(+p.buyin || 0);

    if (base.maxBuyin && buyin > base.maxBuyin.buyin) {
      push("buyin", name, buyin, { name: base.maxBuyin.name, value: base.maxBuyin.buyin },
        `💸 ${name} כבר השקיע הערב ${num(buyin)}₪ — ההשקעה הכי גדולה בערב אחד אי פעם (הקודם: ${base.maxBuyin.name} · ${num(base.maxBuyin.buyin)}₪)`);
    }

    const events = Array.isArray(p.buyinEvents) ? p.buyinEvents : null;
    if (events && events.length > 1) {
      const rebuys = events.length - 1;
      if (base.maxRebuys && rebuys >= 2 && rebuys > base.maxRebuys.rebuys) {
        push("rebuys", name, rebuys, { name: base.maxRebuys.name, value: base.maxRebuys.rebuys },
          `🛒 ${name} כבר עם ${rebuys} ריבאיים הערב — שיא חדש! (הקודם: ${base.maxRebuys.name} · ${base.maxRebuys.rebuys})`);
      }
    }

    if (p.cashout !== "" && p.cashout != null) {
      const chips = +p.cashout;
      if (Number.isFinite(chips) && chips > 0 && base.bestCashout && chips > base.bestCashout.chips) {
        push("cashout", name, chips, { name: base.bestCashout.name, value: base.bestCashout.chips },
          `🪙 ${name} שבר את שיא הג'יטונים ביציאה — ${num(chips)} ג' ביציאה אחת! (הקודם: ${base.bestCashout.name} · ${num(base.bestCashout.chips)} ג')`);
      }
    }
  }

  return out;
}

/** טקסט הכרזה לקבוצה מרשומות חיות חדשות; null כשאין מה להכריז. */
export function liveRecordAnnouncement(records) {
  const lines = (Array.isArray(records) ? records : [])
    .map((r) => r?.line)
    .filter((l) => typeof l === "string" && l.trim());
  if (!lines.length) return null;
  return `🤖 שיא חדש! 🏆\n\n${lines.join("\n")}`;
}
