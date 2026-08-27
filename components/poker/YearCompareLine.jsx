"use client";

import React from "react";
import { C } from "./colors";
import { fmt } from "./format";
import { formatYoyShort } from "./yearCompare";

/**
 * שורת «מול אשתקד» — סכום ו-% קצרים.
 */
export function YearCompareLine({ row, compact = false }) {
  if (!row) return null;
  const short = formatYoyShort(row);
  const tone = row.delta > 0 ? C.win : row.delta < 0 ? C.loss : C.dim;

  if (compact) {
    return (
      <span
        style={{
          fontSize: 10.5,
          color: tone,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
        title={`${row.label}: ${fmt(row.current)} מול ${fmt(row.prior)}`}
      >
        מול אשתקד {short}
      </span>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 11,
        background: C.feltDeep,
        border: `1px solid ${C.line}`,
        marginBottom: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>{row.label}</div>
        <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
          {row.y}: {fmt(row.current)} · {row.priorY}: {fmt(row.prior)}
        </div>
      </div>
      <b
        style={{
          fontSize: 14,
          color: tone,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {short}
      </b>
    </div>
  );
}
