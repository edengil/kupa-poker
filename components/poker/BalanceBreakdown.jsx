"use client";

import React, { useMemo } from "react";
import { C } from "./colors";
import { fmt } from "./format";
import { playerBalanceBreakdown } from "./totals";

function signed(n) {
  if (n > 0) return `+${fmt(n)}`;
  return fmt(n);
}

/**
 * מסביר למה הנטו בטבלה שונה מסכום הערבים:
 * סכום ערבים + התאמה מסיכום שנתי = נטו בטבלה.
 */
export function BalanceBreakdown({ db, playerName }) {
  const b = useMemo(
    () => (playerName ? playerBalanceBreakdown(db, playerName) : null),
    [db, playerName]
  );
  if (!b) return null;

  const hasAdj = b.adjustments.some((a) => Math.abs(a.gap) >= 0.005);

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${hasAdj ? C.brassSoft || C.brass : C.line}`,
        borderRadius: 14,
        padding: "12px 13px 11px",
        marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 8, fontWeight: 600 }}>
        איך מגיעים לנטו בטבלה
      </div>

      <Row label="סכום הערבים שנשמרו" value={fmt(b.sessionsNet)} color={C.cream} />

      {hasAdj ? (
        b.adjustments.map((a) => (
          <Row
            key={a.y}
            label={`התאמה מסיכום ${a.y}`}
            value={signed(a.gap)}
            color={a.gap >= 0 ? C.win : C.loss}
            note={
              Math.abs(a.gap) < 0.005
                ? null
                : `סיכום שנתי רשמי ${fmt(a.tableNet)} · ערבים ב-${a.y}: ${fmt(a.sessionsNet)}`
            }
          />
        ))
      ) : (
        <div style={{ fontSize: 11.5, color: C.dim, margin: "4px 0 6px", lineHeight: 1.4 }}>
          אין פער מול סיכום שנתי — סכום הערבים זהה לטבלה.
        </div>
      )}

      <div
        style={{
          borderTop: `1px solid ${C.line}`,
          marginTop: 6,
          paddingTop: 8,
        }}
      >
        <Row
          label="נטו כמו בטבלה"
          value={fmt(b.tableNet)}
          color={b.tableNet >= 0 ? C.win : C.loss}
          bold
        />
      </div>

      {hasAdj && (
        <p style={{ fontSize: 11, color: C.dim, margin: "8px 0 0", lineHeight: 1.45 }}>
          הסיכום השנתי הרשמי גובר על סכום הערבים. ההתאמה היא ההפרש שסוגר את הפער —
          ערבים + התאמה = מה שמופיע בסיכום השנתי / בכל הזמנים.
        </p>
      )}
    </div>
  );
}

function Row({ label, value, color, note, bold }) {
  return (
    <div style={{ marginBottom: note ? 6 : 4 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 13, color: C.dim }}>{label}</span>
        <b
          style={{
            fontSize: bold ? 16 : 14,
            fontWeight: bold ? 800 : 700,
            color: color || C.cream,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </b>
      </div>
      {note && (
        <div style={{ fontSize: 11, color: C.dim, marginTop: 2, lineHeight: 1.35 }}>{note}</div>
      )}
    </div>
  );
}
