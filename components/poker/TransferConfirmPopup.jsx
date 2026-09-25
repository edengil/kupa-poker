"use client";

import React from "react";
import { C } from "../../lib/poker/colors";
import { canon, DEFAULT_ALIASES } from "../../lib/poker/helpers";
import { brassCta } from "../../lib/poker/festive";

const COPY = {
  paid: {
    testId: "transfer-confirm-popup",
    titleId: "transfer-confirm-title",
    title: "צריך לאשר שהעברת",
    body: (dateLabel) => `פתחת את האפליקציה שוב, ועדיין לא סומן שהכסף הועבר בערב ${dateLabel}.`,
    yes: "אישרתי שהעברתי",
    laterId: "transfer-confirm-later",
    yesId: "transfer-confirm-yes",
    rowId: (index) => `transfer-confirm-row-${index}`,
  },
  received: {
    testId: "receipt-confirm-popup",
    titleId: "receipt-confirm-title",
    title: "צריך לאשר שקיבלת",
    body: (dateLabel) => `פתחת את האפליקציה שוב, ועדיין לא סומן שהכסף התקבל בערב ${dateLabel}.`,
    yes: "אישרתי שקיבלתי",
    laterId: "receipt-confirm-later",
    yesId: "receipt-confirm-yes",
    rowId: (index) => `receipt-confirm-row-${index}`,
  },
};

/**
 * חלון למי שחוזר לאפליקציה ועדיין לא סימן שהעביר, או שקיבל.
 * האישור עצמו נשמר ב־payments של הערב, לא בדגל נפרד.
 */
export function TransferConfirmPopup({
  session,
  rows,
  viewerName,
  aliases = DEFAULT_ALIASES,
  busy = false,
  kind = "paid",
  onConfirm,
  onLater,
}) {
  const copy = COPY[kind] || COPY.paid;
  const me = viewerName ? canon(viewerName, aliases) : null;
  const dateLabel = `${session.d}.${session.mo}.${session.y}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={copy.titleId}
      data-testid={copy.testId}
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
        <div id={copy.titleId} style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>
          {copy.title}
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: C.dim, lineHeight: 1.5 }}>
          {copy.body(dateLabel)}
        </p>
        <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0 }}>
          {rows.map((row) => {
            const self =
              me && canon(kind === "received" ? row.to : row.from, aliases) === me;
            return (
              <li
                key={row.index}
                data-testid={copy.rowId(row.index)}
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
                  {kind === "received" ? (
                    self ? (
                      <>
                        אתה אמור לקבל מ־<b>{row.from}</b>
                      </>
                    ) : (
                      <>
                        {row.from} אל {row.to}
                      </>
                    )
                  ) : self ? (
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
            data-testid={copy.laterId}
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
            data-testid={copy.yesId}
            style={{
              ...brassCta,
              flex: 1.2,
              borderRadius: 10,
              padding: "11px 12px",
              fontSize: 14,
            }}
          >
            {copy.yes}
          </button>
        </div>
      </div>
    </div>
  );
}
