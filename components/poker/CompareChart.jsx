"use client";

import React from "react";
import { C, SERIES_COLORS } from "../../lib/poker/colors";

/**
 * גרף קווים מצטברים של כמה שחקנים על ציר ערבים אחד.
 * series: [{ name, points }] — points מיושר מול nights.
 */
export function CompareChart({ nights, series }) {
  const W = 560,
    H = 190,
    PL = 42,
    PR = 12,
    PT = 10,
    PB = 22;
  const all = [0];
  for (const s of series) for (const v of s.points) all.push(v);
  let mn = Math.min(...all),
    mx = Math.max(...all);
  if (mn === mx) {
    mn -= 50;
    mx += 50;
  }
  const pad = (mx - mn) * 0.08;
  mn -= pad;
  mx += pad;
  const X = (i) =>
    nights.length > 1 ? PL + (i / (nights.length - 1)) * (W - PL - PR) : PL;
  const Y = (v) => PT + (1 - (v - mn) / (mx - mn)) * (H - PT - PB);
  const ticks = [mx, (mx + mn) / 2, mn].map((v) => Math.round(v));
  const lbl =
    nights.length > 1
      ? [0, Math.floor((nights.length - 1) / 2), nights.length - 1]
      : [0];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="190"
      style={{ display: "block", direction: "ltr" }}
      role="img"
      aria-label="גרף רווח מצטבר של השחקנים הנבחרים"
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
      {series.map((s, si) => {
        const color = SERIES_COLORS[si % SERIES_COLORS.length];
        const d = s.points
          .map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`)
          .join(" ");
        const last = s.points.length - 1;
        return (
          <g key={s.name}>
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {last >= 0 && (
              <circle cx={X(last)} cy={Y(s.points[last])} r="4" fill={color} />
            )}
          </g>
        );
      })}
      {lbl.map((i, k) => (
        <text
          key={k}
          x={X(i)}
          y={H - 6}
          fill={C.dim}
          fontSize="10"
          textAnchor={k === 0 ? "start" : k === lbl.length - 1 ? "end" : "middle"}
        >
          {nights[i]?.label}
        </text>
      ))}
    </svg>
  );
}
