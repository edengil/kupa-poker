"use client";

import React from "react";
import { C } from "./colors";
import { dur, hhmm } from "./helpers";

/* שולחן פוקר ויזואלי — חולץ מ-PokerApp.jsx כ-JSX נקי.
   סדר מושבים קבוע: עדן תמיד למטה, והשאר נשמרים באותו מקום יחסי.
   לשינוי — מספיק לערוך את SEAT_ORDER. מי שלא ברשימה מקבל מושב בסוף. */
const SEAT_ORDER = ["עדן", "אופיר", "קובי", "דוד בני", "אורן", "דן"];

function seatSort(players) {
  const idx = (nm) => {
    const i = SEAT_ORDER.findIndex((x) => nm === x || nm.startsWith(x));
    return i === -1 ? 999 : i;
  };
  return [...players].sort((a, b) => idx(a.name) - idx(b.name));
}

export function PokerTable({
  players: rawPlayers,
  cps,
  addAmt,
  pot,
  potChips,
  onSeat,
  startedAt,
  elapsed,
}) {
  const players = seatSort(rawPlayers);
  const n = players.length;
  // גובה גדל עם מספר השחקנים כדי שהמושבים לא יתנגשו
  const H = n <= 4 ? 250 : n <= 6 ? 280 : n <= 8 ? 310 : 340;
  const cx = 50,
    cy = 50,
    rx = 34,
    ry = 32; // אחוזים

  return (
    <div
      style={{
        position: "relative",
        height: H,
        marginBottom: 12,
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "12%",
          top: "14%",
          width: "76%",
          height: "72%",
          borderRadius: "50%",
          background: `radial-gradient(ellipse at 50% 40%, ${C.cardHi}, ${C.felt} 70%)`,
          border: `3px solid ${C.brassSoft}`,
          boxShadow: "inset 0 0 26px rgba(0,0,0,.45)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 2 }}>בקופה</div>
        <div
          style={{
            fontSize: 21,
            fontWeight: 800,
            color: C.brass,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pot}₪
        </div>
        <div style={{ fontSize: 11, color: C.dim, fontVariantNumeric: "tabular-nums" }}>
          {potChips} ג&apos;יטונים
        </div>
        {startedAt && (
          <div
            style={{
              marginTop: 7,
              paddingTop: 6,
              borderTop: `1px solid ${C.line}`,
              display: "inline-block",
              minWidth: 104,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: C.cream,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: 0.5,
              }}
            >
              {dur(elapsed)}
            </div>
            <div style={{ fontSize: 10, color: C.dim }}>מ־{hhmm(startedAt)}</div>
          </div>
        )}
      </div>
      {players.map((p, i) => {
        const ang = Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1); // מתחיל למטה — עדן
        const x = cx + rx * Math.cos(ang);
        const y = cy + ry * Math.sin(ang);
        const chips = (+p.buyin || 0) * cps;
        return (
          <button
            key={p.name}
            onClick={() => onSeat(i)}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%,-50%)",
              width: 78,
              padding: "7px 4px",
              borderRadius: 12,
              cursor: "pointer",
              border: `1px solid ${C.brassSoft}`,
              background: C.feltDeep,
              color: C.cream,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              boxShadow: "0 2px 8px rgba(0,0,0,.4)",
            }}
          >
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {p.name}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {+p.buyin || 0}₪
            </span>
            <span style={{ fontSize: 9.5, color: C.dim, fontVariantNumeric: "tabular-nums" }}>
              {chips} ג&apos;
            </span>
          </button>
        );
      })}
      <div
        style={{
          position: "absolute",
          bottom: 6,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 10.5,
          color: C.dim,
          pointerEvents: "none",
        }}
      >
        לחיצה על שחקן מוסיפה {addAmt}₪
      </div>
    </div>
  );
}
