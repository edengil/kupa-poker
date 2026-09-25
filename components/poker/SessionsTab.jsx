"use client";

import React, { useState } from "react";
import { C } from "../../lib/poker/colors";
import { fmt, fmtGap } from "../../lib/poker/format";
import { AL, balance, canon } from "../../lib/poker/helpers";
import { Empty, IconBtn } from "./ui";
import { Pencil, Share2, Trash2 } from "./icons";
import { ShareSheet } from "./ShareSheet";
import { nightSummaryText, settlementTextForSession } from "../../lib/nightShare";
import { SavedSettlementEditor } from "./SavedSettlementEditor";
import { SessionEditSheet } from "./SessionEditSheet";
import { latestNightConfirmations } from "../../lib/nightConfirmations";
import { markReceipt, markTransfer } from "../../lib/paymentTracking";
import { allTransfersPaid } from "../../lib/settlementClosed";
import { announceSettlementClosed } from "../../lib/announceSettlementClosed";
import { flushStore } from "../../lib/store";

/* טאב ערבים שמורים — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function SessionsTab({ db, commit }) {
  const [share, setShare] = useState(null);
  const [settlementId, setSettlementId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busyPay, setBusyPay] = useState(null);
  const A = AL(db);
  const latestView = latestNightConfirmations(db.sessions);
  const latestId = latestView?.session?.id ?? null;

  const markLatest = async (index, value, side) => {
    if (!latestView || !commit || busyPay != null) return;
    const session = latestView.session;
    setBusyPay(`${side}-${index}`);
    try {
      const next =
        side === "received" ? markReceipt(session, index, value) : markTransfer(session, index, value);
      commit({
        ...db,
        sessions: db.sessions.map((s) => (s.id === session.id ? next : s)),
      });
      await flushStore();
      if (value && allTransfersPaid(next)) await announceSettlementClosed(session.id);
    } finally {
      setBusyPay(null);
    }
  };
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

  const openShare = (s) => {
    setShare({
      session: s,
      text: nightSummaryText(s, A),
      settlement: settlementTextForSession(s) || undefined,
    });
  };

  const byDate = [...db.sessions].sort((a, b) => b.iso.localeCompare(a.iso));
  const list = latestId
    ? [latestView.session, ...byDate.filter((s) => s.id !== latestId)]
    : byDate;

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
        const winners = (s.entries || []).filter((e) => e.amount > 0);
        const even = (s.entries || []).filter((e) => e.amount === 0);
        const debtors = (s.entries || []).filter((e) => e.amount < 0);
        const ordered = [...winners, ...even, ...debtors];
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
                <IconBtn
                  onClick={() => setEditing(s)}
                  data-testid={`session-edit-${s.id}`}
                  aria-label={`עריכת ערב ${s.d}.${s.mo}.${s.y}`}
                >
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
              {ordered.map((e, i) => {
                const zero = e.amount === 0;
                return (
                  <span
                    key={i}
                    style={{
                      fontSize: 12.5,
                      padding: "3px 9px",
                      borderRadius: 20,
                      background: C.feltDeep,
                      color: zero ? C.dim : e.amount > 0 ? C.win : C.loss,
                      border: zero ? `1px dashed ${C.line}` : "1px solid transparent",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {canon(e.name, A)} {zero ? "באפס" : fmt(e.amount)}
                  </span>
                );
              })}
            </div>
            <div
              style={{
                marginTop: 9,
                fontSize: 12.5,
                color: b.gap === 0 ? C.dim : C.brass,
              }}
            >
              {b.gap === 0 ? "✓ מאוזן" : `⚠ פער ${fmtGap(b.gap)}`}
              {even.length > 0 ? ` · ${even.length} סגרו באפס` : ""}
            </div>
            {s.id === latestId && latestView && (
              <div
                data-testid="latest-night-confirmations"
                aria-label={`אישורי העברה בערב ${s.d}.${s.mo}.${s.y}`}
                style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: C.brass, marginBottom: 4 }}>
                  אישורי העברה · ערב אחרון · {s.d}.{s.mo}.{s.y}
                </div>
                <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
                  {latestView.rows.length === 0
                    ? "אין העברות — כולם סגורים."
                    : `נסגרו ${latestView.closedCount} מתוך ${latestView.rows.length}`}
                </p>
                {latestView.rows.map((row) => (
                  <div
                    key={row.index}
                    data-testid={`night-confirm-row-${row.index}`}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: `1px solid ${C.line}`,
                      fontSize: 13.5,
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      {row.from} אל {row.to}
                    </span>
                    <b>{row.amount}₪</b>
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={row.confirmed}
                        disabled={busyPay != null}
                        onChange={(e) => markLatest(row.index, e.target.checked, "paid")}
                        aria-label={`שולם: ${row.from} אל ${row.to}, ${row.amount} שקלים`}
                        data-testid={`night-confirm-paid-${row.index}`}
                        style={{ width: 18, height: 18, accentColor: C.win }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={row.received}
                        disabled={busyPay != null || row.manual}
                        onChange={(e) => markLatest(row.index, e.target.checked, "received")}
                        aria-label={`התקבל: ${row.from} אל ${row.to}, ${row.amount} שקלים`}
                        data-testid={`night-confirm-received-${row.index}`}
                        style={{ width: 18, height: 18, accentColor: C.win }}
                      />
                    </label>
                    <span
                      data-testid={`night-confirm-state-${row.index}`}
                      style={{ color: row.closed ? C.win : C.dim, fontSize: 12, minWidth: 72 }}
                    >
                      {row.closed
                        ? [row.confirmed ? "שולם" : null, row.received ? "התקבל" : null].filter(Boolean).join(" · ")
                        : "ממתין"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {settlementId && (
        <SavedSettlementEditor
          db={db}
          commit={commit}
          sessionId={settlementId}
          onClose={() => setSettlementId(null)}
        />
      )}
      {editing && (
        <SessionEditSheet
          db={db}
          session={editing}
          commit={commit}
          onClose={() => setEditing(null)}
        />
      )}
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
                  color: C.text || C.cream,
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
