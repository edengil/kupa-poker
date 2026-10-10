"use client";

import React, { useState } from "react";
import { C } from "../../lib/poker/colors";
import { r2 } from "../../lib/poker/helpers";

/**
 * ניהול הקופה הצדדית — אדמין בלבד.
 * מציג יתרה, היסטוריית משיכות, וטופס משיכה חדשה.
 */
export function SavingsPotCard({ db, commit, isAdmin }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [showForm, setShowForm] = useState(false);

  if (!isAdmin) return null;

  const total = Number(db.savingsPot) || 0;
  const withdrawals = Array.isArray(db.savingsWithdrawals) ? db.savingsWithdrawals : [];
  const withdrawn = withdrawals.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const balance = r2(total - withdrawn);

  const doWithdraw = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      alert("סכום לא תקין");
      return;
    }
    if (amt > balance) {
      alert("אין מספיק כסף בקופה");
      return;
    }
    if (!reason.trim()) {
      alert("צריך לכתוב סיבה");
      return;
    }
    const entry = {
      amount: r2(amt),
      reason: reason.trim(),
      at: new Date().toISOString(),
    };
    commit({
      ...db,
      savingsWithdrawals: [...withdrawals, entry],
    });
    setAmount("");
    setReason("");
    setShowForm(false);
  };

  if (total <= 0 && withdrawals.length === 0) return null;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.brass}`,
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: C.brass }}>
        💰 קופה צדדית (רק אתה רואה)
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.cream, marginBottom: 4 }}>
        {balance}₪
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>
        נצבר: {total}₪ · נמשך: {withdrawn}₪
      </div>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            fontSize: 13,
            padding: "6px 12px",
            borderRadius: 8,
            cursor: "pointer",
            border: "none",
            background: C.card,
            color: C.cream,
            border: `1px solid ${C.line}`,
          }}
        >
          משיכה מהקופה
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="סכום בש״ח"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${C.line}`,
              background: C.felt,
              color: C.cream,
              fontSize: 14,
            }}
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="סיבה (למשל: קניית שתייה)"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${C.line}`,
              background: C.felt,
              color: C.cream,
              fontSize: 14,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={doWithdraw}
              style={{
                fontSize: 13,
                padding: "6px 16px",
                borderRadius: 8,
                cursor: "pointer",
                border: "none",
                fontWeight: 700,
                background: C.brass,
                color: C.feltDeep,
              }}
            >
              אשר משיכה
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{
                fontSize: 13,
                padding: "6px 12px",
                borderRadius: 8,
                cursor: "pointer",
                border: `1px solid ${C.line}`,
                background: "transparent",
                color: C.dim,
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {withdrawals.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, marginBottom: 6 }}>
            היסטוריית משיכות:
          </div>
          {withdrawals
            .slice()
            .reverse()
            .slice(0, 10)
            .map((w, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  color: C.dim,
                  padding: "4px 0",
                  borderBottom: `1px solid ${C.line}`,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{w.reason}</span>
                <span style={{ color: C.cream }}>-{w.amount}₪</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
