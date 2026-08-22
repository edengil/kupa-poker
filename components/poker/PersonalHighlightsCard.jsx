"use client";

import React, { useMemo } from "react";
import { C } from "./colors";
import { festiveCard, festiveGlow, sectionEyebrow } from "./festive";
import {
  computePersonalHighlights,
  isFemalePlayer,
} from "./personalHighlights";

const PLACE_TONE = { 1: C.brass, 2: "#C0C7D1", 3: "#C48A5A" };

/**
 * כרטיס חגיגי — השיאים האישיים של הצופה המחובר.
 * @param {{ db: object, playerName: string|null, compact?: boolean }} props
 */
export function PersonalHighlightsCard({ db, playerName, compact = false }) {
  const items = useMemo(
    () => (playerName ? computePersonalHighlights(db, playerName) : []),
    [db, playerName]
  );

  const female = playerName ? isFemalePlayer(playerName) : false;
  const you = female ? "את" : "אתה";

  if (!playerName) {
    return (
      <section
        style={{
          ...festiveCard,
          padding: compact ? "12px 13px" : "15px 14px 13px",
          margin: compact ? "0 0 10px" : "0 0 12px",
        }}
      >
        <div style={festiveGlow} aria-hidden />
        <div style={{ position: "relative" }}>
          <div style={{ ...sectionEyebrow, marginBottom: 6 }}>
            <span>♠</span>
            השיאים שלך
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.dim, lineHeight: 1.65 }}>
            עוד לא זיהינו אותך בטבלה — תופיע כאן אחרי שתשתתף.
          </p>
        </div>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section
        style={{
          ...festiveCard,
          padding: compact ? "12px 13px" : "15px 14px 13px",
          margin: compact ? "0 0 10px" : "0 0 12px",
        }}
      >
        <div style={festiveGlow} aria-hidden />
        <div style={{ position: "relative" }}>
          <div style={{ ...sectionEyebrow, marginBottom: 6 }}>
            <span>♠</span>
            השיאים שלך · {playerName}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: C.dim, lineHeight: 1.65 }}>
            {you} בטבלה — ברגע שתעלה לפודיום (מקום 1–3) זה יופיע כאן.
          </p>
        </div>
      </section>
    );
  }

  const shown = compact ? items.slice(0, 5) : items;

  return (
    <section
      style={{
        ...festiveCard,
        padding: compact ? "12px 13px 11px" : "15px 14px 13px",
        margin: compact ? "0 0 10px" : "0 0 12px",
      }}
    >
      <style>{`
        @keyframes hlSpade {
          0%, 100% { transform: rotate(-6deg) translateY(0); opacity: .1; }
          50% { transform: rotate(-2deg) translateY(-2px); opacity: .18; }
        }
        @keyframes hlRowIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hl-spade, .hl-row { animation: none !important; }
        }
      `}</style>
      <div
        className="hl-spade"
        aria-hidden
        style={{
          position: "absolute",
          top: -14,
          left: -4,
          fontSize: 72,
          color: C.brass,
          animation: "hlSpade 5s ease-in-out infinite",
          pointerEvents: "none",
          userSelect: "none",
          lineHeight: 1,
        }}
      >
        ♠
      </div>
      <div style={festiveGlow} aria-hidden />

      <div style={{ position: "relative" }}>
        <div style={{ ...sectionEyebrow, marginBottom: 4 }}>
          <span>♠</span>
          השיאים שלך
        </div>
        <h3
          style={{
            margin: "0 0 10px",
            fontSize: compact ? 15 : 16.5,
            fontWeight: 800,
            color: C.cream,
            letterSpacing: "-0.02em",
          }}
        >
          {you} על הפודיום · {playerName}
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {shown.map((it, i) => (
            <div
              key={`${it.place}-${it.title}`}
              className="hl-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 11px",
                borderRadius: 12,
                background: `${C.feltDeep}aa`,
                border: `1px solid ${PLACE_TONE[it.place] || C.line}44`,
                animation: `hlRowIn .35s ease ${i * 0.04}s both`,
              }}
            >
              <span style={{ fontSize: 22, flex: "0 0 auto", lineHeight: 1 }}>{it.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: C.cream,
                    lineHeight: 1.35,
                  }}
                >
                  {it.title}
                </div>
                {it.detail && (
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{it.detail}</div>
                )}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: PLACE_TONE[it.place] || C.brass,
                  flex: "0 0 auto",
                }}
              >
                #{it.place}
              </span>
            </div>
          ))}
        </div>

        {compact && items.length > shown.length && (
          <p style={{ margin: "9px 2px 0", fontSize: 11.5, color: C.dim }}>
            ועוד {items.length - shown.length} בטאב השיאים ← שלי
          </p>
        )}
      </div>
    </section>
  );
}
