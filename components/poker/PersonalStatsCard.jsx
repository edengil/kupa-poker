"use client";

import React, { useMemo } from "react";
import { C } from "./colors";
import { festiveCardSoft, sectionEyebrow } from "./festive";
import { computePersonalStats, personalStatRows } from "./personalStats";

const TONE = { win: C.win, loss: C.loss, dim: C.dim };

/**
 * שיאים אישיים לכל שחקן (הרווח הכי גדול, ממוצע כניסות וכו').
 * year — אופציונלי: פילטר שנה בתיק האישי.
 */
export function PersonalStatsCard({ db, playerName, compact = false, title, year = null }) {
  const stats = useMemo(
    () =>
      playerName
        ? computePersonalStats(db, playerName, year != null ? { year } : {})
        : null,
    [db, playerName, year]
  );
  const rows = useMemo(
    () => (stats ? personalStatRows(stats, { compact }) : []),
    [stats, compact]
  );

  if (!playerName) return null;
  if (!rows.length) return null;

  const shown = compact ? rows.slice(0, 10) : rows;
  const yearSuffix = year != null ? ` · ${year}` : "";

  return (
    <section
      style={{
        ...festiveCardSoft,
        padding: compact ? "12px 13px 11px" : "14px 14px 12px",
        margin: compact ? "0 0 10px" : "0 0 12px",
      }}
    >
      <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
        <span>♠</span>
        {title || `שיאים אישיים · ${playerName}${yearSuffix}`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {shown.map((row) => (
          <div
            key={row.title}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 11,
              background: `${C.feltDeep}99`,
              border: `1px solid ${C.line}`,
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1.2, flex: "0 0 auto" }}>{row.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.dim }}>{row.title}</div>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: TONE[row.tone] || C.cream,
                  marginTop: 1,
                }}
              >
                {row.detail}
              </div>
              {row.note && (
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2, lineHeight: 1.4 }}>
                  {row.note}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
