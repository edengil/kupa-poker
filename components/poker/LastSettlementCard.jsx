"use client";

import React, { useMemo } from "react";
import { C } from "./colors";
import { festiveCardSoft, festiveGlow, sectionEyebrow } from "./festive";
import { settlementTextForSession } from "../../lib/nightShare";

/**
 * כרטיס «חלוקה אחרונה» בראש טאב הטבלה — מי מעביר למי.
 * מחושב תמיד מחדש; גלוי גם לצופים ב־/g/{slug}.
 */
export function LastSettlementCard({ db }) {
  const card = useMemo(() => {
    const sessions = db?.sessions || [];
    if (!sessions.length) return null;
    const latest = [...sessions].sort((a, b) => b.iso.localeCompare(a.iso))[0];
    if (!latest) return null;
    const text = settlementTextForSession(latest);
    if (!text || !text.trim()) return null;
    /* מדגישים את שורות ההעברה — אותו ניסוח כמו ShareSheet «חלוקה» */
    return { session: latest, text };
  }, [db?.sessions]);

  if (!card) return null;

  const { session, text } = card;

  return (
    <section
      style={{
        ...festiveCardSoft,
        position: "relative",
        overflow: "hidden",
        padding: "13px 14px 12px",
        marginBottom: 12,
      }}
      aria-label={`חלוקה אחרונה ${session.d}.${session.mo}.${session.y}`}
    >
      <div style={festiveGlow} aria-hidden />
      <div style={{ position: "relative" }}>
        <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
          <span>♠</span>
          חלוקה · {session.d}.{session.mo}.{session.y}
        </div>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 12.5,
            color: C.dim,
            lineHeight: 1.5,
          }}
        >
          מי צריך להעביר למי
        </p>
        <div
          dir="rtl"
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 14.5,
            lineHeight: 1.65,
            color: C.cream,
            fontVariantNumeric: "tabular-nums",
            background: C.feltDeep,
            border: `1px solid ${C.brass}44`,
            borderRadius: 10,
            padding: "11px 12px",
          }}
        >
          {text}
        </div>
      </div>
    </section>
  );
}
