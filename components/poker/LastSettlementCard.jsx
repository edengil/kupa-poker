"use client";

import React, { useMemo, useState } from "react";
import { SavedSettlementEditor } from "./SavedSettlementEditor";
import { C } from "./colors";
import { festiveCardSoft, festiveGlow, sectionEyebrow } from "./festive";
import { settlementTextForSession } from "../../lib/nightShare";
import { paymentPlan, markTransfer } from "../../lib/paymentTracking";
import { latestSession } from "../../lib/lastSession";
import { AL, canon } from "./helpers";

/**
 * כרטיס «חלוקה אחרונה» בראש טאב הטבלה — מי מעביר למי.
 * מחושב תמיד מחדש; גלוי גם לצופים ב־/g/{slug}.
 * onMarkPayment(session, index, paid) — לצופים (RPC); אחרת commit מקומי.
 */
export function LastSettlementCard({
  db,
  commit,
  readOnly = false,
  viewerName = null,
  onMarkPayment = null,
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null);
  const A = useMemo(() => AL(db), [db]);
  const me = viewerName ? canon(viewerName, A) : null;

  const card = useMemo(() => {
    const session = latestSession(db?.sessions);
    if (!session) return null;
    const text = settlementTextForSession(session);
    return { session, text: text || "", ...paymentPlan(session) };
  }, [db?.sessions]);

  if (!card) return null;

  const { session, text, transfers, paid } = card;
  const paidCount = transfers.filter((_, i) => paid[i]).length;
  const outstanding = transfers.reduce((sum, transfer, i) => sum + (paid[i] ? 0 : transfer.amount), 0);

  const isMine = (transfer) => me && canon(transfer.from, A) === me;
  const mine = me ? transfers.map((t, i) => ({ t, i })).filter(({ t }) => isMine(t)) : [];
  const others = me ? transfers.map((t, i) => ({ t, i })).filter(({ t }) => !isMine(t)) : transfers.map((t, i) => ({ t, i }));

  const canMark = (!readOnly && !!commit) || typeof onMarkPayment === "function";
  const canEditManual = !readOnly && !!commit;

  const mark = async (index, value) => {
    if (!canMark || busy != null) return;
    setBusy(index);
    try {
      if (typeof onMarkPayment === "function") {
        await onMarkPayment(session, index, value);
      } else if (commit) {
        commit({
          ...db,
          sessions: db.sessions.map((s) => (s.id === session.id ? markTransfer(s, index, value) : s)),
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ transfer, index }) => {
    const mineRow = isMine(transfer);
    return (
      <label
        key={index}
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: "9px 0",
          borderBottom: `1px solid ${C.line}`,
          background: mineRow ? `${C.brass}14` : "transparent",
          borderRadius: mineRow ? 8 : 0,
          paddingInline: mineRow ? 8 : 0,
        }}
      >
        {canMark && (mineRow || !readOnly || !me) && (
          <input
            type="checkbox"
            checked={!!paid[index]}
            disabled={busy === index}
            onChange={(e) => mark(index, e.target.checked)}
            aria-label={`שולם: ${transfer.from} אל ${transfer.to}, ${transfer.amount} שקלים`}
            style={{ width: 20, height: 20, accentColor: C.win }}
          />
        )}
        {readOnly && me && !mineRow && <span style={{ width: 20 }} />}
        <span style={{ flex: 1 }}>
          {mineRow ? (
            <>
              אתה מעביר ל־<b>{transfer.to}</b>
            </>
          ) : (
            <>
              {transfer.from} אל {transfer.to}
            </>
          )}
        </span>
        <b>{transfer.amount}₪</b>
        <span style={{ color: paid[index] ? C.win : C.dim, fontSize: 12 }}>
          {paid[index] ? "שולם" : "ממתין"}
        </span>
      </label>
    );
  };

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
      data-testid="last-settlement-card"
    >
      {editing && (
        <SavedSettlementEditor
          db={db}
          commit={commit}
          sessionId={session.id}
          onClose={() => setEditing(false)}
        />
      )}
      <div style={festiveGlow} aria-hidden />
      <div style={{ position: "relative" }}>
        <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
          <span>♠</span>
          חלוקה · ערב אחרון · {session.d}.{session.mo}.{session.y}
        </div>
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 12.5,
            color: C.dim,
            lineHeight: 1.5,
          }}
        >
          {transfers.length === 0
            ? "אין העברות — כולם סגורים."
            : `${paidCount} מתוך ${transfers.length} העברות סומנו כשולמו · נותרו ${outstanding.toLocaleString("he-IL")}₪`}
        </p>
        {canEditManual && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              color: C.brass,
              background: C.feltDeep,
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              padding: 8,
              marginBottom: 8,
            }}
          >
            עריכת חלוקה ידנית
          </button>
        )}
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
          {transfers.length === 0 ? (
            <div style={{ color: C.dim, fontSize: 13 }}>אין העברות לתשלום בערב הזה.</div>
          ) : (
            <>
              {mine.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: C.brass, marginBottom: 4, fontWeight: 700 }}>
                    מה שאתה צריך להעביר
                  </div>
                  {mine.map(({ t, i }) => (
                    <Row key={`mine-${i}`} transfer={t} index={i} />
                  ))}
                </>
              )}
              {others.length > 0 && (
                <>
                  {mine.length > 0 && (
                    <div style={{ fontSize: 12, color: C.dim, margin: "10px 0 4px", fontWeight: 600 }}>
                      שאר ההעברות
                    </div>
                  )}
                  {others.map(({ t, i }) => (
                    <Row key={`other-${i}`} transfer={t} index={i} />
                  ))}
                </>
              )}
            </>
          )}
          {text.trim() && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", color: C.dim, fontSize: 12 }}>
                נוסח החלוקה המלא
              </summary>
              {text}
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
