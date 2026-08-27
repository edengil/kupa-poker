"use client";

import React, { useMemo } from "react";
import { C } from "./colors";
import { fmt } from "./format";
import { festiveCardSoft, sectionEyebrow } from "./festive";
import { computeMonthHeroes, currentCalendarMonth } from "./monthHeroes";

/**
 * גיבור החודש / ירידת החודש במסך הבית.
 * לחיצה פותחת פרופיל אם onPlayer קיים.
 */
export function MonthHeroesCard({ db, onPlayer, y, mo }) {
  const cal = useMemo(() => {
    if (y != null && mo != null) return { y, mo };
    return currentCalendarMonth();
  }, [y, mo]);

  const data = useMemo(
    () => computeMonthHeroes(db, cal.y, cal.mo),
    [db, cal.y, cal.mo]
  );

  if (!data || (!data.hero && !data.flop)) return null;

  const Cell = ({ kind, row }) => {
    if (!row) return null;
    const isHero = kind === "hero";
    const clickable = typeof onPlayer === "function";
    const Tag = clickable ? "button" : "div";
    return (
      <Tag
        type={clickable ? "button" : undefined}
        onClick={clickable ? () => onPlayer(row.name) : undefined}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "right",
          cursor: clickable ? "pointer" : "default",
          border: `1px solid ${isHero ? C.brass + "66" : C.line}`,
          background: C.feltDeep,
          borderRadius: 12,
          padding: "10px 12px",
          color: "inherit",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: isHero ? C.brass : C.dim,
            marginBottom: 4,
          }}
        >
          {isHero ? "גיבור החודש" : "ירידת החודש"}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: C.cream,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.name}
        </div>
        <b
          style={{
            display: "block",
            marginTop: 2,
            fontSize: 15,
            color: isHero ? C.win : C.loss,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmt(row.amount)}
        </b>
      </Tag>
    );
  };

  return (
    <section
      style={{
        ...festiveCardSoft,
        padding: "12px 13px 11px",
        marginBottom: 12,
      }}
    >
      <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
        <span>♠</span>
        {data.label}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Cell kind="hero" row={data.hero} />
        <Cell kind="flop" row={data.flop} />
      </div>
    </section>
  );
}
