"use client";

import React, { useMemo, useState } from "react";
import { C } from "./colors";
import { fmt } from "./format";
import { AL, balance, canon, toWhatsApp } from "./helpers";
import { parseDate, parseEntries } from "./parse";
import { BalanceMeter } from "./chrome";
import { Tag } from "./ui";
import { checkNightBalance, confirmSaveIfUnbalanced } from "./nightBalance";
import { applySessionEdit } from "../../lib/sessionEdit";

/**
 * עריכת ערב שמור במקום — בלי לקפוץ לטאב ההזנה (שם ה־lazy load
 * גרם ל־__loadRaw לפספס את הטקסט).
 */
export function SessionEditSheet({ db, session, commit, onClose }) {
  const A = AL(db);
  const seed =
    session.raw ||
    toWhatsApp(session.entries || [], session, null, A);
  const [text, setText] = useState(seed);
  const yearHint = session.y || new Date().getFullYear();

  const entries = useMemo(() => parseEntries(text), [text]);
  const date = parseDate(text, yearHint);
  const bal = balance(entries);
  const canSave = entries.length > 0 && !!date;

  const save = () => {
    if (!canSave) return;
    const check = checkNightBalance({ entries });
    if (!confirmSaveIfUnbalanced(check)) return;
    commit(
      applySessionEdit(db, session, {
        raw: text.trim(),
        entries,
        date,
      })
    );
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-edit-title"
      data-testid="session-edit-sheet"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "92vh",
          overflow: "auto",
          background: C.feltDeep,
          color: C.cream,
          borderRadius: "18px 18px 0 0",
          border: `1px solid ${C.line}`,
          padding: "16px 16px 22px",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <div
              id="session-edit-title"
              style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}
            >
              עריכת ערב {session.d}.{session.mo}.{session.y}
            </div>
            <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.4 }}>
              עדכן את הסיכום ושמור. הערב נשאר ברשימה — לא נמחק ולא נוצר כפול.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="session-edit-cancel-x"
            style={{
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              color: C.dim,
              padding: "6px 10px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
            }}
          >
            סגור
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          data-testid="session-edit-text"
          dir="rtl"
          style={{
            width: "100%",
            resize: "vertical",
            boxSizing: "border-box",
            background: C.card,
            color: C.cream,
            border: `1px solid ${C.brass}66`,
            borderRadius: 12,
            padding: 14,
            fontSize: 15,
            lineHeight: 1.6,
            fontFamily: "inherit",
          }}
        />

        {entries.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                fontSize: 13,
                color: date ? C.cream : C.brass,
                marginBottom: 8,
              }}
            >
              {date ? (
                <>
                  תאריך אחרי שמירה:{" "}
                  <b>
                    {date.d}.{date.mo}.{date.y}
                  </b>
                </>
              ) : (
                <>לא זוהה תאריך — הוסף שורה כמו «סיכום פוקר 1.8»</>
              )}
            </div>
            <BalanceMeter bal={bal} />
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {entries.map((e, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "9px 12px",
                    borderRadius: 9,
                    background: C.card,
                    border: `1px solid ${C.line}`,
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {canon(e.name, A)}
                    {e.combined && <Tag>זוג?</Tag>}
                  </span>
                  <b
                    style={{
                      color: e.amount >= 0 ? C.win : C.loss,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmt(e.amount)}
                  </b>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            data-testid="session-edit-cancel"
            style={{
              flex: 1,
              padding: 13,
              borderRadius: 12,
              border: `1px solid ${C.line}`,
              background: C.card,
              color: C.cream,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            data-testid="session-edit-save"
            style={{
              flex: 1.4,
              padding: 13,
              borderRadius: 12,
              border: "none",
              background: canSave ? C.brass : C.card,
              color: canSave ? C.feltDeep : C.dim,
              fontSize: 15,
              fontWeight: 700,
              cursor: canSave ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            שמור שינויים
          </button>
        </div>
      </div>
    </div>
  );
}
