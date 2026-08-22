"use client";

import React from "react";
import { C } from "./colors";
import { fmt } from "./format";

/**
 * חיווי קטן: יותר / פחות / בלי שינוי מול לפני חודש.
 * compact — רק חץ + סכום (לבאנר ולשורות צפופות).
 */
export function MoMDelta({ delta, compact = false, title }) {
  if (delta == null || Number.isNaN(delta)) return null;
  const up = delta > 0;
  const down = delta < 0;
  const color = up ? C.win : down ? C.loss : C.dim;
  const arrow = up ? "↑" : down ? "↓" : "·";
  const label = compact
    ? `${arrow}${delta === 0 ? "" : fmt(delta)}`
    : `${arrow} ${delta === 0 ? "כמו לפני חודש" : `${fmt(delta)} מול לפני חודש`}`;
  return (
    <span
      title={title || "מול אותו יום בחודש שעבר"}
      style={{
        fontSize: compact ? 10.5 : 11.5,
        fontWeight: compact ? 700 : 600,
        color,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        lineHeight: 1.2,
      }}
    >
      {label}
    </span>
  );
}

/** שורת סיכום לקבוצה — כמה כסף עבר ידיים מול לפני חודש. */
export function GroupMoMLine({ moved }) {
  if (!moved) return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        marginTop: 8,
        fontSize: 12,
        color: C.dim,
      }}
    >
      <span>הקבוצה · עבר ידיים {fmt(moved.now)}</span>
      <MoMDelta delta={moved.delta} />
    </div>
  );
}
