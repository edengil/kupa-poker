"use client";

import React, { useMemo, useState } from "react";
import { SavedSettlementEditor } from "./SavedSettlementEditor";
import { C } from "./colors";
import { festiveCardSoft, festiveGlow, sectionEyebrow } from "./festive";
import { settlementTextForSession } from "../../lib/nightShare";
import { paymentPlan, markTransfer } from "../../lib/paymentTracking";

/**
 * כרטיס «חלוקה אחרונה» בראש טאב הטבלה — מי מעביר למי.
 * מחושב תמיד מחדש; גלוי גם לצופים ב־/g/{slug}.
 */
export function LastSettlementCard({ db, commit, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const card = useMemo(() => {
    const sessions = db?.sessions || [];
    if (!sessions.length) return null;
    const latest = [...sessions].sort((a, b) => b.iso.localeCompare(a.iso))[0];
    if (!latest) return null;
    const text = settlementTextForSession(latest);
    if (!text || !text.trim()) return null;
    /* מדגישים את שורות ההעברה — אותו ניסוח כמו ShareSheet «חלוקה» */
    return { session: latest, text, ...paymentPlan(latest) };
  }, [db?.sessions]);

  if (!card) return null;

  const { session, text, transfers, paid } = card;
  const paidCount = transfers.filter((_, i) => paid[i]).length;
  const outstanding = transfers.reduce((sum, transfer, i) => sum + (paid[i] ? 0 : transfer.amount), 0);
  const mark = (index, value) => {
    if (readOnly || !commit) return;
    commit({ ...db, sessions: db.sessions.map((s) => s.id === session.id ? markTransfer(s, index, value) : s) });
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
    >
      {editing && <SavedSettlementEditor db={db} commit={commit} sessionId={session.id} onClose={() => setEditing(false)} />}
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
          {paidCount} מתוך {transfers.length} העברות סומנו כשולמו · נותרו {outstanding.toLocaleString("he-IL")}₪
        </p>
        {!readOnly && commit && <button onClick={() => setEditing(true)} style={{ color: C.brass, background: C.feltDeep, border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, marginBottom: 8 }}>עריכת חלוקה ידנית</button>}
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
          {transfers.map((transfer, index) => (
            <label key={index} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: index < transfers.length - 1 ? `1px solid ${C.line}` : "none" }}>
              {!readOnly && commit && <input type="checkbox" checked={!!paid[index]} onChange={(e) => mark(index, e.target.checked)} aria-label={`שולם: ${transfer.from} אל ${transfer.to}, ${transfer.amount} שקלים`} style={{ width: 20, height: 20, accentColor: C.win }} />}
              <span style={{ flex: 1 }}>{transfer.from} אל {transfer.to}</span>
              <b>{transfer.amount}₪</b>
              <span style={{ color: paid[index] ? C.win : C.dim, fontSize: 12 }}>{paid[index] ? "שולם" : "ממתין"}</span>
            </label>
          ))}
          <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", color: C.dim, fontSize: 12 }}>נוסח החלוקה המלא</summary>{text}</details>
        </div>
      </div>
    </section>
  );
}
