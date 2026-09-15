"use client";

import React, { useState } from "react";
import { C } from "./colors";
import { fmt, fmtGap } from "./format";
import { AL, balance, canon, toWhatsApp } from "./helpers";
import { Empty, IconBtn } from "./ui";
import { Pencil, Share2, Trash2 } from "./icons";
import { ShareSheet } from "./ShareSheet";
import { nightSummaryText, settlementTextForSession } from "../../lib/nightShare";
import { SavedSettlementEditor } from "./SavedSettlementEditor";

/* טאב ערבים שמורים — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function SessionsTab({ db, commit, goEdit }) {
  const [share, setShare] = useState(null);
  const [settlementId, setSettlementId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const A = AL(db);
  if (!db.sessions.length) {
    return <Empty text="עדיין אין ערבים. עבור להזנה או ללייב." />;
  }

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const drop = String(pendingDelete.id);
    commit({
      ...db,
      sessions: db.sessions.filter((s) => s.id !== pendingDelete.id),
      deletedSessionIds: [...new Set([...(db.deletedSessionIds || []), drop])],
    });
    setPendingDelete(null);
  };

  const edit = (s) => {
    /* רק פותחים הזנה עם הטקסט — בלי למחוק את הערב.
       מחיקה לפני שמירה מחקה ערבים כשעורכים כמה ברצף. */
    const raw = s.raw || toWhatsApp(s.entries, s, null, A);
    goEdit(raw, s.id);
  };

  const openShare = (s) => {
    setShare({
      session: s,
      text: nightSummaryText(s, A),
      settlement: settlementTextForSession(s) || undefined,
    });
  };

  const list = [...db.sessions].sort((a, b) => b.iso.localeCompare(a.iso));

  return (
    <div
      style={{
        marginTop: 4,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {list.map((s) => {
        const b = balance(s.entries);
        return (
          <div
            key={s.id}
            style={{
              background: C.card,
              border: `1px solid ${b.gap === 0 ? C.line : C.brass}`,
              borderRadius: 12,
              padding: 13,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <b style={{ fontSize: 15 }}>
                {s.d}.{s.mo}.{s.y}
              </b>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setSettlementId(s.id)}
                  data-testid={`session-settlement-${s.id}`}
                  style={{
                    background: C.feltDeep,
                    color: C.brass,
                    border: `1px solid ${C.line}`,
                    borderRadius: 8,
                    padding: "6px 8px",
                    fontSize: 12,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  חלוקה ותשלומים
                </button>
                <IconBtn onClick={() => openShare(s)}>
                  <Share2 size={15} />
                </IconBtn>
                <IconBtn onClick={() => edit(s)}>
                  <Pencil size={15} />
                </IconBtn>
                <IconBtn
                  onClick={() => setPendingDelete({ id: s.id, label: `${s.d}.${s.mo}.${s.y}` })}
                  danger
                  data-testid={`session-delete-${s.id}`}
                >
                  <Trash2 size={15} />
                </IconBtn>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {s.entries.map((e, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12.5,
                    padding: "3px 9px",
                    borderRadius: 20,
                    background: C.feltDeep,
                    color: e.amount >= 0 ? C.win : C.loss,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {canon(e.name, A)} {fmt(e.amount)}
                </span>
              ))}
            </div>
            <div
              style={{
                marginTop: 9,
                fontSize: 12.5,
                color: b.gap === 0 ? C.dim : C.brass,
              }}
            >
              {b.gap === 0 ? "✓ מאוזן" : `⚠ פער ${fmtGap(b.gap)}`}
            </div>
          </div>
        );
      })}
      {settlementId && <SavedSettlementEditor db={db} commit={commit} sessionId={settlementId} onClose={() => setSettlementId(null)} />}
      {share && (
        <ShareSheet
          title={`סיכום פוקר ${share.session.d}.${share.session.mo}`}
          text={share.text}
          settlement={share.settlement}
          onClose={() => setShare(null)}
        />
      )}
      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-session-title"
          data-testid="delete-session-confirm"
          onClick={() => setPendingDelete(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 340,
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 14,
              padding: 18,
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            }}
          >
            <div id="delete-session-title" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
              למחוק את הערב?
            </div>
            <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.45, marginBottom: 16 }}>
              ערב {pendingDelete.label} יימחק לצמיתות, כולל כל הרישום והחלוקה שלו. אי אפשר לבטל.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "stretch" }}>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                data-testid="delete-session-cancel"
                style={{
                  flex: 1,
                  background: C.feltDeep,
                  color: C.text,
                  border: `1px solid ${C.line}`,
                  borderRadius: 10,
                  padding: "11px 12px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                data-testid="delete-session-confirm-btn"
                style={{
                  flex: 1,
                  background: C.loss,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 12px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                כן, למחוק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
