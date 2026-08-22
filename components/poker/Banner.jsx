"use client";

import React, { useEffect, useMemo, useState } from "react";
import { C } from "./colors";
import { fmt, MONTHS } from "./format";
import { allTimeTotals, monthTotals, yearTotals } from "./totals";
import { NavBtn } from "./ui";
import { Award, ChevronLeft, ChevronRight, Crown } from "./icons";
import { festiveCardSoft } from "./festive";

/* באנר דירוג עליון — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function Banner({ db, onPlayer }) {
  const periods = useMemo(() => {
    const s = new Set();
    db.sessions.forEach((x) => s.add(x.y * 100 + x.mo));
    return [...s].sort((a, b) => a - b);
  }, [db]);
  const [scope, setScope] = useState("month");
  const [idx, setIdx] = useState(Math.max(0, periods.length - 1));
  useEffect(() => {
    setIdx(Math.max(0, periods.length - 1));
  }, [periods.length]);
  const pk = periods[idx];
  const y = pk ? Math.floor(pk / 100) : new Date().getFullYear();
  const mo = pk ? pk % 100 : 1;
  const { totals, official } = useMemo(() => {
    if (scope === "all") return { totals: allTimeTotals(db), official: false };
    if (scope === "year") return yearTotals(db, y);
    return { totals: monthTotals(db, y, mo), official: false };
  }, [db, scope, y, mo]);
  const label =
    scope === "all" ? "כל הזמן" : scope === "year" ? `${y}` : `${MONTHS[mo - 1]} ${y}`;

  return (
    <div
      style={{
        ...festiveCardSoft,
        padding: "12px 14px",
        marginBottom: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -10,
          left: 8,
          fontSize: 56,
          color: C.brass,
          opacity: 0.08,
          pointerEvents: "none",
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        ♠
      </div>
      <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 4,
            background: C.feltDeep,
            padding: 3,
            borderRadius: 9,
            border: `1px solid ${C.line}`,
          }}
        >
          {[
            ["month", "חודש"],
            ["year", "שנה"],
            ["all", "הכל"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setScope(v)}
              style={{
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                padding: "5px 9px",
                borderRadius: 7,
                fontWeight: scope === v ? 700 : 500,
                background: scope === v ? C.brass : "transparent",
                color: scope === v ? C.feltDeep : C.dim,
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {scope === "month" && periods.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <NavBtn onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0}>
              <ChevronRight size={16} />
            </NavBtn>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 74, textAlign: "center" }}>
              {label}
            </span>
            <NavBtn
              onClick={() => setIdx((i) => Math.min(periods.length - 1, i + 1))}
              disabled={idx >= periods.length - 1}
            >
              <ChevronLeft size={16} />
            </NavBtn>
          </div>
        ) : (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {official && <Award size={14} color={C.brass} />}
            {label}
          </span>
        )}
      </div>
      {totals.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 13, padding: "6px 0" }}>אין נתונים</div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 7,
            overflowX: "auto",
            paddingBottom: 2,
          }}
          className="hscroll"
        >
          {totals.map((t, i) => (
            <button
              key={t.name}
              onClick={() => onPlayer(t.name)}
              style={{
                flexShrink: 0,
                cursor: "pointer",
                border: `1px solid ${i === 0 && t.amount > 0 ? C.brass : C.line}`,
                background: C.feltDeep,
                borderRadius: 11,
                padding: "7px 11px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                minWidth: 66,
              }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  color: C.cream,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  whiteSpace: "nowrap",
                }}
              >
                {i === 0 && t.amount > 0 && <Crown size={12} color={C.brass} />}
                {t.name}
              </span>
              <b
                style={{
                  fontSize: 15,
                  color: t.amount >= 0 ? C.win : C.loss,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmt(t.amount)}
              </b>
            </button>
          ))}
        </div>
      )}
      {official && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11.5,
            color: C.brass,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Award size={12} />
          מאזן שנתי רשמי
        </div>
      )}
      </div>
    </div>
  );
}
