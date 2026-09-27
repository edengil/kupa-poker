/* «סיכום טיפים» בוואטסאפ — טבלת טיפים לערב החי או לערב האחרון שנשמר.
   בלי «טיפים הערב» בכותרת: זו תשובה לפקודה, לא סיכום ערב שננעץ בקבוצה. */

import { BOT_MARK } from "./botMark.js";
import { tipTotalsByName } from "./nightShare.js";
import { nightDateParts } from "./report.js";

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };

/**
 * דירוג טיפים מהגבוה לנמוך. תיקו = אותו מקום, והמקום הבא מדלג (1, 1, 3).
 * @param {object} source ערב לייב {players, tips} או ערב שמור {entries, tips}
 * @returns {{ place: number, name: string, amount: number }[]}
 */
export function rankTips(source) {
  const players = source?.players?.length
    ? source.players
    : (source?.entries || []).map((e) => ({ name: e.name, tipsGiven: +e.tipsGiven || 0 }));
  const totals = tipTotalsByName(source, players);
  const names = [...new Set([...players.map((p) => p.name), ...Object.keys(totals)])];
  const rows = names
    .map((name) => ({ name, amount: Math.round((totals[name] || 0) * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "he"));
  let place = 0;
  return rows.map((row, i) => {
    if (i === 0 || row.amount !== rows[i - 1].amount) place = i + 1;
    return { place, ...row };
  });
}

function dateLabelOf(source, { live = false, now = Date.now() } = {}) {
  if (live) {
    const { d, mo } = nightDateParts(source?.startedAt, now);
    return `${d}.${mo}`;
  }
  if (source?.d != null && source?.mo != null) return `${source.d}.${source.mo}`;
  return String(source?.iso || "");
}

/**
 * טקסט הטבלה לקבוצה.
 * @param {object} source
 * @param {{ live?: boolean, now?: number }} [opts]
 */
export function buildTipsTable(source, opts = {}) {
  const rows = rankTips(source);
  const label = dateLabelOf(source, opts);
  const head = `${BOT_MARK} 💸 סיכום טיפים · ${opts.live ? "הערב" : "ערב"} ${label}`.trim();
  if (!rows.length) return `${head}\n\nאין שחקנים בערב הזה.`;

  const tippers = rows.filter((r) => r.amount > 0);
  if (!tippers.length) return `${head}\n\nאף אחד עוד לא שם טיפ 🙈`;

  const lines = tippers.map((r) => `${MEDAL[r.place] || `${r.place}.`} ${r.name} · ${r.amount} ג׳`);
  const total = Math.round(tippers.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const out = [head, "", ...lines, "", `סה״כ טיפים: ${total} ג׳`];
  const none = rows.filter((r) => r.amount <= 0).map((r) => r.name);
  if (none.length) out.push(`בלי טיפ: ${none.join(", ")}`);
  return out.join("\n");
}
