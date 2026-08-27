"use client";
/* באנר קצר כשנשבר שיא בסוף ערב — באפליקציה, לא רק בוואטסאפ. */
import React, { useEffect } from "react";
import { C } from "./colors";
import { normalizeRecordAlertLines } from "./recordsAlert.js";

const AUTO_DISMISS_MS = 12_000;

/**
 * @param {{ lines: string[] | null, onDismiss?: () => void }} props
 */
export function RecordsAlert({ lines, onDismiss }) {
  const cleaned = normalizeRecordAlertLines(lines);

  useEffect(() => {
    if (!cleaned?.length || typeof onDismiss !== "function") return undefined;
    const id = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [lines, onDismiss]);

  if (!cleaned?.length) return null;

  return (
    <div
      role="status"
      dir="rtl"
      style={{
        position: "fixed",
        top: "calc(12px + env(safe-area-inset-top))",
        left: 13,
        right: 13,
        zIndex: 80,
        maxWidth: 614,
        margin: "0 auto",
        background: `linear-gradient(160deg, ${C.cardHi} 0%, ${C.card} 70%)`,
        border: `1px solid ${C.brass}88`,
        borderRadius: 14,
        padding: "12px 14px",
        boxShadow: "0 10px 28px rgba(0,0,0,.35)",
        color: C.cream,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 15, color: C.brass }}>
          ♠ שיא חדש!
        </div>
        {typeof onDismiss === "function" && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="סגור"
            style={{
              background: "transparent",
              border: "none",
              color: C.dim,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>
      <ul style={{ margin: 0, padding: "0 16px 0 0", fontSize: 13, lineHeight: 1.55 }}>
        {cleaned.map((line) => (
          <li key={line} style={{ marginBottom: 4 }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
