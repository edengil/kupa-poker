"use client";

import React from "react";
import { C, SERIES_COLORS } from "../../../lib/poker/colors";
import { fmt } from "../../../lib/poker/format";
import { festiveCardSoft, sectionTitle } from "../../../lib/poker/festive";
import { COMPARE_MAX } from "../../../lib/poker/compareChart";
import { CompareChart } from "../CompareChart";

/* השוואת שחקנים — קווי מצטבר על ציר ערבים — חולץ מ־RecordsTab. */
export function CompareSection({ cmp, cmpYear, setCmpYear, cmpSelection, toggleCmpPlayer, names, h2hYearOptions }) {
  return (
    <>
  {/* השוואת שחקנים — קווי מצטבר של עד 4 שחקנים על ציר ערבים אחד */}
  <div style={sectionTitle({ margin: "12px 2px 0" })}>
    📈 השוואת שחקנים · {cmpYear === "all" ? "כל הזמנים" : cmpYear}
  </div>
  <p style={{ margin: "0 2px 8px", color: C.dim, fontSize: 11.5, lineHeight: 1.6 }}>
    בחרו עד {COMPARE_MAX} שחקנים וראו את מרוץ הרווח המצטבר ערב־ערב — מי עקף את מי ומתי.
  </p>
  <label style={{ display: "block", margin: "0 2px 10px" }}>
    <div style={{ fontSize: 12, color: C.dim, marginBottom: 5 }}>שנה להשוואה</div>
    <select
      value={String(cmpYear)}
      onChange={(e) =>
        setCmpYear(e.target.value === "all" ? "all" : Number(e.target.value))
      }
      style={{
        width: "100%",
        background: C.card,
        color: C.cream,
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 14,
        fontFamily: "inherit",
      }}
    >
      {h2hYearOptions.map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
      <option value="all">כל הזמנים</option>
    </select>
  </label>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "0 2px 10px" }}>
    {names.map((n) => {
      const idx = cmpSelection.indexOf(n);
      const active = idx >= 0;
      return (
        <button
          key={n}
          type="button"
          onClick={() => toggleCmpPlayer(n)}
          aria-pressed={active}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontFamily: "inherit",
            cursor: "pointer",
            border: `1px solid ${active ? SERIES_COLORS[idx % SERIES_COLORS.length] : C.line}`,
            background: active ? C.cardHi : "transparent",
            color: active ? C.cream : C.dim,
            fontWeight: active ? 700 : 400,
          }}
        >
          {active && (
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: SERIES_COLORS[idx % SERIES_COLORS.length],
                display: "inline-block",
              }}
            />
          )}
          {n}
        </button>
      );
    })}
  </div>
  {cmp.nights.length >= 2 && cmp.series.length > 0 ? (
    <div style={{ ...festiveCardSoft, borderRadius: 14, padding: "12px 10px 6px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 2px 8px" }}>
        {cmp.series.map((s, si) => (
          <span
            key={s.name}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              color: C.cream,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                background: SERIES_COLORS[si % SERIES_COLORS.length],
                display: "inline-block",
              }}
            />
            {s.name}
            <b
              style={{
                color: s.final >= 0 ? C.win : C.loss,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmt(s.final)}
            </b>
          </span>
        ))}
      </div>
      <CompareChart nights={cmp.nights} series={cmp.series} />
    </div>
  ) : (
    <div style={{
      background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
      border: `1px dashed ${C.brass}55`,
      borderRadius: 14,
      padding: "12px 14px", fontSize: 13, color: C.dim, lineHeight: 1.6,
    }}>
      📈 אין מספיק ערבים בתקופה הזאת בשביל גרף השוואה — צריך לפחות שני ערבים.
    </div>
  )}

    </>
  );
}
