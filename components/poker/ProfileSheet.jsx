"use client";

import React, { useMemo, useState } from "react";
import { C } from "./colors";
import { fmt } from "./format";
import { AL, canon, r2 } from "./helpers";
import { availableYears, playerBalanceBreakdown } from "./totals";
import { yearOverYear } from "./yearCompare";
import { IconBtn, Stat } from "./ui";
import { TrendingUp, X } from "./icons";
import { CumChart } from "./CumChart";
import { PersonalStatsCard } from "./PersonalStatsCard";
import { BalanceBreakdown } from "./BalanceBreakdown";
import { YearCompareLine } from "./YearCompareLine";
import { computePersonalStats } from "./personalStats";

/* פרופיל שחקן — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function ProfileSheet({ db, name, onClose }) {
  const A = AL(db);
  const cn = canon(name, A);
  const years = useMemo(() => availableYears(db), [db]);
  const [yearFilter, setYearFilter] = useState(null); // null = הכל

  const rows = useMemo(() => {
    const out = [];
    let cum = 0;
    for (const s of [...db.sessions].sort((a, b) => a.iso.localeCompare(b.iso))) {
      if (yearFilter != null && Number(s.y) !== yearFilter) continue;
      let v = 0,
        has = false;
      for (const e of s.entries) {
        if (canon(e.name, A) === cn) {
          v += e.amount;
          has = true;
        }
      }
      if (has) {
        cum = r2(cum + v);
        out.push({
          iso: s.iso,
          label: `${s.d}.${s.mo}`,
          night: r2(v),
          cum,
        });
      }
    }
    return out;
  }, [db, cn, A, yearFilter]);

  const balance = useMemo(
    () =>
      playerBalanceBreakdown(
        db,
        cn,
        yearFilter != null ? { year: yearFilter } : {}
      ),
    [db, cn, yearFilter]
  );
  const total = balance.tableNet;
  const best = rows.reduce((m, r) => (r.night > (m?.night ?? -1e9) ? r : m), null);
  const worst = rows.reduce((m, r) => (r.night < (m?.night ?? 1e9) ? r : m), null);

  const personal = useMemo(
    () =>
      computePersonalStats(db, cn, yearFilter != null ? { year: yearFilter } : {}),
    [db, cn, yearFilter]
  );

  const yoy = useMemo(() => {
    const y = yearFilter ?? new Date().getFullYear();
    return yearOverYear(db, cn, y);
  }, [db, cn, yearFilter]);

  const yearOptions = useMemo(() => {
    const opts = [[null, "הכל"]];
    for (const y of years) opts.push([y, String(y)]);
    return opts;
  }, [years]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        zIndex: 40,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        style={{
          width: "100%",
          maxWidth: 640,
          background: C.felt,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          border: `1px solid ${C.line}`,
          padding: "18px 16px 26px",
          maxHeight: "86vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>{cn}</h2>
          <IconBtn onClick={onClose}>
            <X size={17} />
          </IconBtn>
        </div>

        {years.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 4,
              background: C.feltDeep,
              padding: 3,
              borderRadius: 9,
              border: `1px solid ${C.line}`,
              marginBottom: 12,
              overflowX: "auto",
            }}
            className="hscroll"
          >
            {yearOptions.map(([v, l]) => {
              const active = yearFilter === v;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setYearFilter(v)}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    padding: "5px 10px",
                    borderRadius: 7,
                    fontWeight: active ? 700 : 500,
                    background: active ? C.brass : "transparent",
                    color: active ? C.feltDeep : C.dim,
                    flexShrink: 0,
                    fontFamily: "inherit",
                  }}
                >
                  {l}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <Stat label="נטו בטבלה" value={fmt(total)} color={total >= 0 ? C.win : C.loss} />
          <Stat label="ערבים" value={rows.length} />
          <Stat label="ערב שיא" value={best ? fmt(best.night) : "—"} color={C.win} />
          <Stat label="ערב גרוע" value={worst ? fmt(worst.night) : "—"} color={C.loss} />
          {personal?.hostedCount > 0 && (
            <Stat
              label="נטו כשמארחים אצלך"
              value={`${personal.hostedCount}× · ${fmt(personal.hostedNet)}`}
              color={(personal.hostedNet ?? 0) >= 0 ? C.win : C.loss}
            />
          )}
        </div>
        <YearCompareLine row={yoy} />
        <BalanceBreakdown db={db} playerName={cn} year={yearFilter} />
        <PersonalStatsCard db={db} playerName={cn} year={yearFilter} />
        {rows.length > 1 ? (
          <div
            style={{
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 14,
              padding: "14px 12px 10px",
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                color: C.dim,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <TrendingUp size={14} />
              רווח מצטבר לפי ערבים בלבד
              {yearFilter != null ? ` · ${yearFilter}` : ""}
            </div>
            <CumChart rows={rows} />
          </div>
        ) : (
          <div style={{ color: C.dim, fontSize: 13, textAlign: "center", padding: 20 }}>
            {rows.length === 0
              ? yearFilter != null
                ? `אין ערבים ב-${yearFilter}.`
                : "אין ערבים."
              : "צריך יותר מערב אחד לגרף."}
          </div>
        )}
        <p style={{ fontSize: 11.5, color: C.dim, marginTop: 8 }}>
          הגרף והרשימה למטה הם סכום ערבים בלבד. הנטו בטבלה כולל התאמה מסיכום שנתי רשמי כשיש.
        </p>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: 12.5, color: C.dim, padding: "0 2px 2px" }}>לפי ערב</div>
          {[...rows].reverse().map((r) => (
            <div
              key={r.iso}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 9,
                background: C.card,
                border: `1px solid ${C.line}`,
              }}
            >
              <span style={{ fontSize: 14 }}>
                {r.label}.{r.iso.slice(0, 4)}
              </span>
              <span style={{ display: "flex", gap: 12 }}>
                <b
                  style={{
                    color: r.night >= 0 ? C.win : C.loss,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmt(r.night)}
                </b>
                <span
                  style={{
                    color: C.dim,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 52,
                    textAlign: "left",
                  }}
                >
                  {fmt(r.cum)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
