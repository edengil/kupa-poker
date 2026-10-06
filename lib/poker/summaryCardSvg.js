/* בונה SVG של כרטיס הסיכום המעוצב — משותף ללקוח (תצוגה/שיתוף) ולשרת (PNG לוואטסאפ). */

import { fmt } from "./format.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const money = (v) => `${fmt(v)} ₪`;
const moved = (v) => `${Math.round(Math.abs(v)).toLocaleString("en-US")} ₪`;

export function buildSummaryCardSvg(data) {
  const W = 1080;
  const H = 1080;
  const cx = W / 2;
  const medals = ["🥇", "🥈", "🥉"];
  const rankLabel = (i) => (i < 3 ? medals[i] : `#${i + 1}`);
  const signedMoney = (v) => `${fmt(v)} ₪`;

  /* דירוג מלא בשתי עמודות — מתכווץ אוטומטית כשיש המון שחקנים */
  const standings = data.standings || [];
  const n = standings.length;
  const rows = Math.max(1, Math.ceil(n / 2));
  const tableTop = 330;
  const tableBottom = 730;
  const rowH = Math.min(58, (tableBottom - tableTop) / rows);
  const rowFont = rowH >= 52 ? 30 : 26;
  const tableH = rows * rowH;
  const firstBaseline = tableTop + (tableBottom - tableTop - tableH) / 2 + rowH * 0.72;
  const standingRows = standings
    .map((p, i) => {
      const colX = i < rows ? 800 : 280; // עמודה ימנית: מקומות ראשונים
      const y = (firstBaseline + (i % rows) * rowH).toFixed(1);
      const amtColor = p.amount < 0 ? "#E08080" : "#D9A441";
      return `<text x="${colX}" y="${y}" class="srow" style="font-size:${rowFont}px">${rankLabel(i)} ${esc(p.name)} · <tspan fill="${amtColor}">${esc(signedMoney(p.amount))}</tspan></text>`;
    })
    .join("\n");

  const extras = [
    data.bestNight &&
      `🔥 ערב השיא: ${data.bestNight.name} · ${money(data.bestNight.amount)} · ${data.bestNight.date}`,
    data.stormyNight &&
      `🌩️ הערב הסוער: ${moved(data.stormyNight.moved)} זזו על השולחן · ${data.stormyNight.date}`,
    data.mostNights &&
      `🎯 הכי הרבה ערבים: ${data.mostNights.name} · ${data.mostNights.nights} ערבים`,
  ].filter(Boolean);
  // שורות השיאים מתחת לטבלה, בתוך המסגרת
  const extraBlock = extras
    .map(
      (line, i) =>
        `<text x="${cx}" y="${836 + i * 34}" class="extra">${esc(line)}</text>`
    )
    .join("\n");

  /* הלוגו של עדן (EGMark) בתחתית הכרטיס — אותם path-ים כמו components/Logo.jsx.
     יושב במרווח ייעודי בין השיאים לקרדיט, לא צמוד לאף שורה. */
  const logoBlock = `<g transform="translate(512,940) scale(0.875)">
    <circle cx="32" cy="32" r="30" fill="url(#egCard)"/>
    <circle cx="32" cy="32" r="26.5" fill="none" stroke="rgba(217,164,65,0.45)" stroke-width="1"/>
    <path fill="#EFE7D2" d="M15.5 20h14.2c.85 0 1.45.55 1.45 1.35v1.55c0 .8-.6 1.35-1.45 1.35H19.4v4.35h8.6c.8 0 1.35.5 1.35 1.25v1.4c0 .75-.55 1.25-1.35 1.25h-8.6v4.55h10.5c.85 0 1.45.55 1.45 1.35v1.55c0 .8-.6 1.35-1.45 1.35H15.5c-.85 0-1.45-.55-1.45-1.35V21.35c0-.8.6-1.35 1.45-1.35z"/>
    <path fill="#EFE7D2" d="M47.8 22.1c-2.2-2.55-5.55-4.05-9.3-4.05-7.35 0-12.85 5.35-12.85 13.05S31.15 44.1 38.5 44.1c3.55 0 6.75-1.3 9.05-3.55.55-.55.55-1.4.05-1.9l-1.45-1.4c-.5-.5-1.3-.5-1.8.05-1.55 1.5-3.55 2.3-5.85 2.3-4.55 0-7.7-3.2-7.7-7.95s3.15-7.95 7.7-7.95c2.2 0 4.1.75 5.55 2.1.45.4 1.15.4 1.6-.05l1.5-1.5c.5-.5.5-1.3 0-1.8z"/>
    <path fill="#EFE7D2" d="M48.2 31.2h-7.4c-.85 0-1.45.6-1.45 1.4v1.7c0 .8.6 1.4 1.45 1.4H45v3.35c0 .75.55 1.3 1.3 1.3h1.55c.75 0 1.3-.55 1.3-1.3V32.6c0-.8-.6-1.4-1.4-1.4z"/>
    <circle cx="50.5" cy="47.5" r="2.2" fill="#D9A441"/>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#15493A"/>
      <stop offset="1" stop-color="#0A2B21"/>
    </linearGradient>
    <linearGradient id="egCard" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2C6B54"/>
      <stop offset="0.55" stop-color="#15493A"/>
      <stop offset="1" stop-color="#0A2B21"/>
    </linearGradient>
    <style>
      text { font-family: Arial, Helvetica, sans-serif; text-anchor: middle; }
      .brand { font-size: 30px; fill: #D9A441; font-weight: 700; direction: rtl; }
      .title { font-size: 58px; fill: #EFE7D2; font-weight: 800; }
      .secT { font-size: 32px; fill: #9DBBAC; font-weight: 700; }
      .srow { font-size: 30px; fill: #EFE7D2; font-weight: 700; }
      .stats { font-size: 28px; fill: #9DBBAC; }
      .extra { font-size: 26px; fill: #EFE7D2; }
      .foot { font-size: 20px; fill: #9DBBAC; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="36" fill="none" stroke="#D9A441" stroke-opacity=".55" stroke-width="3"/>
  <text x="${cx}" y="105" class="brand">♠ קופה — פוקר</text>
  <text x="${cx}" y="185" class="title">${esc(data.title)}</text>
  <line x1="${cx - 240}" y1="225" x2="${cx + 240}" y2="225" stroke="#D9A441" stroke-width="2" stroke-opacity=".7"/>
  <text x="${cx}" y="292" class="secT">🏆 דירוג התקופה</text>
  ${standingRows}
  <text x="${cx}" y="778" class="stats">${data.nights} ערבים · ${data.players} שחקנים · ${esc(moved(data.totalMoved))} זזו על השולחן</text>
  ${extraBlock}
  ${logoBlock}
  <text x="${cx}" y="1030" class="foot">נוצר באפליקציית קופה — פוקר ♠</text>
</svg>`;
}
