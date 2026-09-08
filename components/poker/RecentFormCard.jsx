"use client";

import React, { useMemo } from "react";
import { C } from "./colors";
import { festiveCardSoft, sectionEyebrow } from "./festive";
import { groupHotForm, playerRecentForm, formatFormNet } from "./recentForm";

function Dot({ result, title }) {
  const bg =
    result === "win" ? C.win : result === "loss" ? C.loss : C.dim;
  return (
    <span
      title={title}
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: bg,
        display: "inline-block",
        boxShadow: `0 0 0 1px ${C.feltDeep}`,
        flex: "0 0 auto",
      }}
    />
  );
}

/**
 * טופס אחרון: נקודות נ/ה אישיות + «חם עכשיו» בקבוצה.
 */
export function RecentFormCard({ db, playerName = null, onPlayer }) {
  const personal = useMemo(
    () => (playerName ? playerRecentForm(db, playerName, { limit: 8 }) : null),
    [db, playerName]
  );
  const group = useMemo(() => groupHotForm(db, { nights: 5, top: 3 }), [db]);

  if (!personal && !group) return null;

  return (
    <section
      style={{
        ...festiveCardSoft,
        padding: "12px 13px 11px",
        margin: "0 0 10px",
      }}
    >
      <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
        <span>◆</span>
        טופס אחרון
      </div>

      {personal && (
        <div style={{ marginBottom: group ? 12 : 0 }}>
          <div
            style={{
              fontSize: 12,
              color: C.dim,
              marginBottom: 6,
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>{personal.name}</span>
            <span style={{ color: personal.net >= 0 ? C.win : C.loss, fontWeight: 700 }}>
              {formatFormNet(personal.net)} · {personal.wins}נ/{personal.losses}ה
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {personal.nights.map((n) => (
              <Dot
                key={n.iso}
                result={n.result}
                title={`${n.label} · ${formatFormNet(n.amount)}`}
              />
            ))}
            {personal.streak >= 2 && personal.streakType && (
              <span
                style={{
                  marginInlineStart: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: personal.streakType === "win" ? C.win : C.loss,
                }}
              >
                רצף {personal.streak} {personal.streakType === "win" ? "ניצחונות" : "הפסדים"}
              </span>
            )}
          </div>
        </div>
      )}

      {group && (
        <div>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>
            חם עכשיו · {group.windowN} ערבים אחרונים
            {group.fromLabel && group.toLabel
              ? ` (${group.fromLabel}–${group.toLabel})`
              : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {group.hot.map((row, i) => {
              const clickable = typeof onPlayer === "function";
              const Tag = clickable ? "button" : "div";
              return (
                <Tag
                  key={row.name}
                  type={clickable ? "button" : undefined}
                  onClick={clickable ? () => onPlayer(row.name) : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "right",
                    cursor: clickable ? "pointer" : "default",
                    border: `1px solid ${C.line}`,
                    background: C.feltDeep,
                    borderRadius: 10,
                    padding: "7px 10px",
                    color: "inherit",
                    fontFamily: "inherit",
                    width: "100%",
                  }}
                >
                  <span style={{ fontSize: 11, color: C.brass, width: 14 }}>{i + 1}</span>
                  <span
                    style={{
                      flex: 1,
                      fontWeight: 700,
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.name}
                  </span>
                  <span style={{ fontSize: 11, color: C.dim }}>{row.n} ערבים</span>
                  <b
                    style={{
                      fontSize: 13,
                      color: row.amount >= 0 ? C.win : C.loss,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatFormNet(row.amount)}
                  </b>
                </Tag>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
