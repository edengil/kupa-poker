/* ייצוא ערבים / שחקנים ל־CSV (אקסל) — בלי תלות חיצונית. */

import { AL, canon, r2 } from "./helpers.js";
import { resolveEntryBuyin, resolveEntryChips } from "./reconstructChips.js";

const BOM = "\uFEFF";

function esc(cell) {
  const s = cell == null ? "" : String(cell);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) {
    lines.push(row.map(esc).join(","));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

function sessionDate(s) {
  if (s?.iso) return s.iso;
  if (s?.y != null && s?.mo != null && s?.d != null) {
    return `${s.y}-${String(s.mo).padStart(2, "0")}-${String(s.d).padStart(2, "0")}`;
  }
  return "";
}

/**
 * שורה לכל שחקן בכל ערב.
 * @returns {string}
 */
export function sessionsToCsv(db) {
  const A = AL(db);
  const headers = [
    "תאריך",
    "שחקן",
    "נטו",
    "קנייה",
    "ג׳יטונים",
    "מיקום",
    "טיפים",
  ];
  const rows = [];
  const sessions = [...(db?.sessions || [])].sort((a, b) =>
    String(a.iso || "").localeCompare(String(b.iso || ""))
  );

  for (const s of sessions) {
    const date = sessionDate(s);
    for (const e of s.entries || []) {
      const name = canon(e.name, A);
      const buyin = resolveEntryBuyin(e, { iso: s.iso, aliases: A }).buyin;
      const chips = resolveEntryChips(e, { iso: s.iso, aliases: A }).chips;
      const tips = +e.tipsGiven || 0;
      rows.push([
        date,
        name,
        r2(+e.amount || 0),
        buyin != null ? r2(buyin) : "",
        chips != null ? chips : "",
        s.location || "",
        tips || "",
      ]);
    }
  }

  return rowsToCsv(headers, rows);
}

/**
 * סיכום לכל שחקן על כל ההיסטוריה.
 * @returns {string}
 */
export function playersToCsv(db) {
  const A = AL(db);
  const by = {};
  for (const s of db?.sessions || []) {
    for (const e of s.entries || []) {
      const name = canon(e.name, A);
      const cur = by[name] || { name, nights: 0, net: 0, buyin: 0, buyinN: 0 };
      cur.nights += 1;
      cur.net = r2(cur.net + (+e.amount || 0));
      const buyin = resolveEntryBuyin(e, { iso: s.iso, aliases: A }).buyin;
      if (buyin != null && buyin > 0) {
        cur.buyin = r2(cur.buyin + buyin);
        cur.buyinN += 1;
      }
      by[name] = cur;
    }
  }

  const headers = ["שחקן", "ערבים", "נטו כולל", "קנייה כוללת", "ממוצע לערב"];
  const rows = Object.values(by)
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name, "he"))
    .map((p) => [
      p.name,
      p.nights,
      p.net,
      p.buyinN ? p.buyin : "",
      p.nights ? r2(p.net / p.nights) : "",
    ]);

  return rowsToCsv(headers, rows);
}

export function downloadCsv(filename, csvText) {
  if (typeof document === "undefined") return;
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** הורדת ערבים + סיכום שחקנים (שני קבצים). */
export function exportSessionsCsv(db) {
  const day = new Date().toISOString().slice(0, 10);
  downloadCsv(`kupa-poker-sessions-${day}.csv`, sessionsToCsv(db));
  downloadCsv(`kupa-poker-players-${day}.csv`, playersToCsv(db));
}
