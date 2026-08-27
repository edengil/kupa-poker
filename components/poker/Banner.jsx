"use client";

import React, { useMemo } from "react";
import { C } from "./colors";
import { fmt, MONTHS } from "./format";
import { periodTotals, yearNum } from "./totals";
import { yearOverYearByPlayer } from "./yearCompare";
import { NavBtn } from "./ui";
import { Award, ChevronLeft, ChevronRight, Crown } from "./icons";
import { festiveCardSoft } from "./festive";

/* באנר דירוג עליון — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function Banner({ db, onPlayer, scope, setScope, y, setY, mo, setMo }) {
  const periods = useMemo(() => {
    const s = new Set();
    db.sessions.forEach((x) => {
      const yy = yearNum(x.y);
      const mm = Number(x.mo);
      if (yy != null && Number.isFinite(mm)) s.add(yy * 100 + mm);
    });
    return [...s].sort((a, b) => a - b);
  }, [db]);
  const pkWanted = (yearNum(y) ?? 0) * 100 + Number(mo);
  let idx = periods.indexOf(pkWanted);
  if (idx < 0) idx = Math.max(0, periods.length - 1);
  const { totals, official } = useMemo(
    () => periodTotals(db, scope, y, mo),
    [db, scope, y, mo]
  );
  const yoyMap = useMemo(
    () => yearOverYearByPlayer(db, scope, y, mo),
    [db, scope, y, mo]
  );
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
                type="button"
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
              <NavBtn
                onClick={() => {
                  const i = Math.max(0, idx - 1);
                  const p = periods[i];
                  if (p == null) return;
                  setY(Math.floor(p / 100));
                  setMo(p % 100);
                }}
                disabled={idx <= 0}
              >
                <ChevronRight size={16} />
              </NavBtn>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 74, textAlign: "center" }}>
                {label}
              </span>
              <NavBtn
                onClick={() => {
                  const i = Math.min(periods.length - 1, idx + 1);
                  const p = periods[i];
                  if (p == null) return;
                  setY(Math.floor(p / 100));
                  setMo(p % 100);
                }}
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
            {totals.map((t, i) => {
              const yoy = yoyMap[t.name];
              return (
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
                  {yoy && (
                    <span
                      style={{
                        fontSize: 9.5,
                        color: yoy.delta >= 0 ? C.win : C.loss,
                        fontVariantNumeric: "tabular-nums",
                        opacity: 0.9,
                        whiteSpace: "nowrap",
                      }}
                    >
                      מול אשתקד{" "}
                      {(yoy.delta > 0 ? "+" : yoy.delta < 0 ? "−" : "") +
                        Math.abs(yoy.delta).toLocaleString("en-US")}
                      {yoy.pct != null
                        ? ` · ${(yoy.pct > 0 ? "+" : yoy.pct < 0 ? "−" : "")}${Math.abs(Math.round(yoy.pct))}%`
                        : ""}
                    </span>
                  )}
                </button>
              );
            })}
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
