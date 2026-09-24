"use client";

import React from "react";
import { C } from "../../lib/poker/colors";
import { canon, DEFAULT_ALIASES } from "../../lib/poker/helpers";
import { brassCta } from "../../lib/poker/festive";

/**
 * חלון למי שחוזר לאפליקציה ועדיין לא סימן שהעביר.
 * האישור עצמו נשמר ב־payments של הערב, לא בדגל נפרד.
 */
export function TransferConfirmPopup({
  session,
  rows,
  viewerName,
  aliases = DEFAULT_ALIASES,
  busy = false,
  onConfirm,
  onLater,
}) {
  const me = viewerName ? canon(viewerName, aliases) : null;
  const dateLabel = `${session.d}.${session.mo}.${session.y}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-confirm-title"
      data-testid="transfer-confirm-popup"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: C.card,
          border: `1px solid ${C.brass}`,
          borderRadius: 14,
          padding: 18,
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          color: C.cream,
        }}
      >
        <div id="transfer-confirm-title" style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>
          צריך לאשר שהעברת
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: C.dim, lineHeight: 1.5 }}>
          פתחת את האפליקציה שוב, ועדיין לא סומן שהכסף הועבר בערב {dateLabel}.
        </p>
        <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0 }}>
          {rows.map((row) => {
            const self = me && canon(row.from, aliases) === me;
            return (
              <li
                key={row.index}
                data-testid={`transfer-confirm-row-${row.index}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: `1px solid ${C.line}`,
                  fontSize: 14,
                }}
              >
                <span>
                  {self ? (
                    <>
                      אתה מעביר ל־<b>{row.to}</b>
                    </>
                  ) : (
                    <>
                      {row.from} אל {row.to}
                    </>
                  )}
                </span>
                <b>
                  {row.amount}₪ · ממתין
                </b>
              </li>
            );
          })}
        </ul>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onLater}
            disabled={busy}
            data-testid="transfer-confirm-later"
            style={{
              flex: 1,
              background: C.feltDeep,
              color: C.cream,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "11px 12px",
              fontSize: 14,
              fontFamily: "inherit",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            אחר כך
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            data-testid="transfer-confirm-yes"
            style={{
              ...brassCta,
              flex: 1.2,
              borderRadius: 10,
              padding: "11px 12px",
              fontSize: 14,
            }}
          >
            אישרתי שהעברתי
          </button>
        </div>
      </div>
    </div>
  );
}
