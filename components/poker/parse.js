/* פרסור טקסט סיכום (הזנה) — חולץ מ-PokerApp.jsx. */

const KW = new RegExp(
  "^\\s*(.+?)\\s*(מגיע(?:ה|ים)?|מרווח(?:ת|ים)?|מקבל(?:ת)?|זכאי(?:ת)?|חייב(?:ת|ים|ות)?)\\s*(\\d+)"
);

export function parseEntries(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[🥇🥈🥉]\s*/, "");
    if (!line) continue;
    const m = line.match(KW);
    if (!m) continue;
    const name = m[1].trim().replace(/^[🥇🥈🥉]\s*/, "");
    if (!name || ["כניסות", "סיכום", "בנתיים", "בינתיים"].includes(name)) continue;
    const amt = parseInt(m[3], 10);
    if (!Number.isFinite(amt)) continue;
    const sign = /חייב/.test(m[2]) ? -1 : 1;
    const toks = name.split(/\s+/);
    const combined = toks.slice(1).some((t) => t.startsWith("ו") && t.length > 2);
    out.push({
      name,
      amount: sign * amt,
      combined,
    });
  }
  return out;
}

export function parseDate(text, fy) {
  const m = text.match(/(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?/);
  if (!m) return null;
  const d = +m[1],
    mo = +m[2];
  let y = m[3] ? +m[3] : fy;
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return {
    d,
    mo,
    y,
    iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  };
}
