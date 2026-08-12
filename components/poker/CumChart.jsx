"use client";

import React from "react";
import { C } from "./colors";

/** גרף רווח מצטבר (SVG) — חולץ מ-PokerApp.jsx. */
export function CumChart({ rows }) {
  const W = 560,
    H = 170,
    PL = 42,
    PR = 10,
    PT = 10,
    PB = 22;
  const vals = rows.map((r) => r.cum);
  let mn = Math.min(0, ...vals),
    mx = Math.max(0, ...vals);
  if (mn === mx) {
    mn -= 50;
    mx += 50;
  }
  const pad = (mx - mn) * 0.08;
  mn -= pad;
  mx += pad;
  const X = (i) => PL + (i / (rows.length - 1)) * (W - PL - PR);
  const Y = (v) => PT + (1 - (v - mn) / (mx - mn)) * (H - PT - PB);
  const d = rows
    .map((r, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(r.cum).toFixed(1)}`)
    .join(" ");
  const area = `${d} L${X(rows.length - 1).toFixed(1)},${Y(mn).toFixed(1)} L${X(0).toFixed(1)},${Y(mn).toFixed(1)} Z`;
  const ticks = [mx, (mx + mn) / 2, mn].map((v) => Math.round(v));
  const lbl = [0, Math.floor((rows.length - 1) / 2), rows.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="180"
      style={{ display: "block", direction: "ltr" }}
    >
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={PL}
            x2={W - PR}
            y1={Y(t)}
            y2={Y(t)}
            stroke={C.line}
            strokeWidth="1"
            opacity=".5"
          />
          <text x={PL - 6} y={Y(t) + 4} fill={C.dim} fontSize="10" textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {mn < 0 && mx > 0 && (
        <line
          x1={PL}
          x2={W - PR}
          y1={Y(0)}
          y2={Y(0)}
          stroke={C.dim}
          strokeWidth="1.2"
          opacity=".8"
        />
      )}
      <path d={area} fill={C.brass} opacity=".13" />
      <path
        d={d}
        fill="none"
        stroke={C.brass}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={X(rows.length - 1)}
        cy={Y(rows[rows.length - 1].cum)}
        r="4"
        fill={C.brass}
      />
      {lbl.map((i, k) => (
        <text
          key={k}
          x={X(i)}
          y={H - 6}
          fill={C.dim}
          fontSize="10"
          textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"}
        >
          {rows[i].label}
        </text>
      ))}
    </svg>
  );
}
