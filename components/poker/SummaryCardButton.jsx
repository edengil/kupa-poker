"use client";

import React, { useMemo, useState } from "react";
import { C } from "../../lib/poker/colors";
import { fmt } from "../../lib/poker/format";
import { summaryCardData } from "../../lib/poker/summaryCard";

/* כרטיס סיכום מעוצב לשיתוף: SVG בצבעי האפליקציה → PNG → שיתוף מערכתי,
   עם נפילה להורדת קובץ. הטקסט מרוכז כדי שעברית RTL תשב נכון בתוך ה־SVG. */

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
  const podiumRows = data.podium
    .map(
      (p, i) =>
        `<text x="${cx}" y="${780 + i * 58}" class="pod">${medals[i]} ${esc(
          p.name
        )} · ${esc(money(p.amount))}</text>`
    )
    .join("\n");
  const extras = [
    data.bestNight &&
      `🔥 ערב השיא: ${data.bestNight.name} · ${money(data.bestNight.amount)} · ${data.bestNight.date}`,
    data.stormyNight &&
      `🌩️ הערב הסוער: ${moved(data.stormyNight.moved)} זזו על השולחן · ${data.stormyNight.date}`,
    data.mostNights &&
      `🎯 הכי הרבה ערבים: ${data.mostNights.name} · ${data.mostNights.nights} ערבים`,
  ].filter(Boolean);
  // שורות ההמשך נערמות מתחת לפודיום, בתוך המסגרת
  const extraBlock = extras
    .map(
      (line, i) =>
        `<text x="${cx}" y="${912 + i * 32}" class="extra">${esc(line)}</text>`
    )
    .join("\n");

  /* הלוגו של עדן (EGMark) בתחתית הכרטיס — אותם path-ים כמו components/Logo.jsx */
  const logoBlock = `<g transform="translate(520.8,984.8) scale(0.6)">
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
      .label { font-size: 32px; fill: #9DBBAC; }
      .king { font-size: 84px; fill: #EFE7D2; font-weight: 800; }
      .kingAmt { font-size: 54px; fill: #D9A441; font-weight: 800; }
      .statV { font-size: 44px; fill: #EFE7D2; font-weight: 800; }
      .statL { font-size: 24px; fill: #9DBBAC; }
      .podT { font-size: 30px; fill: #9DBBAC; font-weight: 700; }
      .pod { font-size: 36px; fill: #EFE7D2; font-weight: 700; }
      .extra { font-size: 26px; fill: #EFE7D2; }
      .foot { font-size: 20px; fill: #9DBBAC; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="36" fill="none" stroke="#D9A441" stroke-opacity=".55" stroke-width="3"/>
  <text x="${cx}" y="105" class="brand">♠ קופה — פוקר</text>
  <text x="${cx}" y="185" class="title">${esc(data.title)}</text>
  <line x1="${cx - 240}" y1="225" x2="${cx + 240}" y2="225" stroke="#D9A441" stroke-width="2" stroke-opacity=".7"/>
  <text x="${cx}" y="305" class="label">👑 מלך התקופה</text>
  <text x="${cx}" y="395" class="king">${esc(data.king?.name || "—")}</text>
  <text x="${cx}" y="465" class="kingAmt">${esc(data.king ? money(data.king.amount) : "")}</text>
  <g>
    <rect x="70" y="520" width="290" height="130" rx="20" fill="#0A2B21" fill-opacity=".55" stroke="#2C6B54"/>
    <rect x="395" y="520" width="290" height="130" rx="20" fill="#0A2B21" fill-opacity=".55" stroke="#2C6B54"/>
    <rect x="720" y="520" width="290" height="130" rx="20" fill="#0A2B21" fill-opacity=".55" stroke="#2C6B54"/>
    <text x="215" y="580" class="statV">${data.nights}</text>
    <text x="215" y="622" class="statL">ערבים</text>
    <text x="540" y="580" class="statV">${data.players}</text>
    <text x="540" y="622" class="statL">שחקנים</text>
    <text x="865" y="580" class="statV">${esc(moved(data.totalMoved))}</text>
    <text x="865" y="622" class="statL">זז על השולחן</text>
  </g>
  <text x="${cx}" y="715" class="podT">🏆 הפודיום</text>
  ${podiumRows}
  ${extraBlock}
  ${logoBlock}
  <text x="${cx}" y="1042" class="foot">נוצר באפליקציית קופה — פוקר ♠</text>
</svg>`;
}

export function SummaryCardButton({ db, scope }) {
  const data = useMemo(() => summaryCardData(db, scope), [db, scope]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  if (!data) return null;

  const share = async () => {
    setBusy(true);
    setNote("");
    try {
      const svg = buildSummaryCardSvg(data);
      const svgUrl = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
      );
      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = svgUrl;
        });
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1080;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0A2B21";
        ctx.fillRect(0, 0, 1080, 1080);
        ctx.drawImage(img, 0, 0, 1080, 1080);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("יצירת התמונה נכשלה");
        const fileName = `kupa-poker-${data.kind === "month" ? data.label : data.y}.png`;
        const file = new File([blob], fileName, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: data.title });
        } else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          setNote("הכרטיס ירד כקובץ תמונה — אפשר לשלוח אותו לקבוצה 📤");
        }
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        setNote("לא הצלחנו ליצור את הכרטיס כרגע — נסו שוב");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ margin: "10px 2px 0" }}>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        style={{
          width: "100%",
          padding: "11px 12px",
          borderRadius: 10,
          border: `1px solid ${C.brass}`,
          background: C.brass,
          color: C.feltDeep,
          fontFamily: "inherit",
          fontSize: 13.5,
          fontWeight: 700,
          cursor: "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "יוצר כרטיס…" : "🎴 שתף כרטיס סיכום מעוצב"}
      </button>
      {note && (
        <p role="status" style={{ fontSize: 12, color: C.dim, margin: "6px 2px 0" }}>
          {note}
        </p>
      )}
    </div>
  );
}
