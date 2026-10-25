"use client";

import React, { useState } from "react";
import { C } from "../../lib/poker/colors";
import { r2 } from "../../lib/poker/helpers";
import { potActualFor, potRecordedFor } from "../../lib/nightShare";

/**
 * ניהול קופת החיסכון — אדמין בלבד.
 * היתרה הראשית היא ה"בפועל" (מזומן שנשמר באמת, מסכום שדות הערבים) —
 * רק היא מוצגת; היתרה הרשומה הכוללת הוסרה מהתצוגה (הכרעת עדן, 25.10.2026).
 * משיכה נבדקת מול ה"בפועל".
 * כל משיכה אפשר גם לבטל (מחיקה מההיסטוריה) — היתרה נגזרת מהנתונים
 * ומתעדכנת מעצמה (הכרעת עדן, 25.10.2026).
 */

/** מחזיר עותק של רשימת המשיכות בלי הרשומה שבאינדקס המקורי (בלי לשנות את המקור). */
export function withoutWithdrawal(withdrawals, originalIndex) {
  const list = Array.isArray(withdrawals) ? withdrawals : [];
  return list.filter((_, idx) => idx !== originalIndex);
}
export function SavingsPotCard({ db, commit, isAdmin }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [showForm, setShowForm] = useState(false);

  if (!isAdmin) return null;

  const sessions = Array.isArray(db.sessions) ? db.sessions : [];
  const totalActual = r2(sessions.reduce((s, x) => s + potActualFor(x), 0));
  const totalRecorded = r2(sessions.reduce((s, x) => s + potRecordedFor(x), 0));
  const withdrawals = Array.isArray(db.savingsWithdrawals) ? db.savingsWithdrawals : [];
  const withdrawn = withdrawals.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const balance = r2(totalActual - withdrawn);

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

  const deleteWithdrawal = (originalIndex, w) => {
    const ok = confirm(
      `לבטל את המשיכה של ${w.amount}₪ (${w.reason})? היא תימחק מההיסטוריה והיתרה תתעדכן.`
    );
    if (!ok) return;
    commit({
      ...db,
      savingsWithdrawals: withoutWithdrawal(withdrawals, originalIndex),
    });
  };

  if (totalActual <= 0 && totalRecorded <= 0 && withdrawals.length === 0) return null;

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
        💰 קופת חיסכון (רק אתה רואה)
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.cream, marginBottom: 4 }}>
        {balance}₪
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 12 }}>
        נצבר בפועל: {totalActual}₪ · נמשך: {withdrawn}₪
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
            .map((w, idx) => ({ w, idx }))
            .reverse()
            .slice(0, 10)
            .map(({ w, idx }) => (
              <div
                key={idx}
                style={{
                  fontSize: 12,
                  color: C.dim,
                  padding: "4px 0",
                  borderBottom: `1px solid ${C.line}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ flex: 1 }}>{w.reason}</span>
                <span style={{ color: C.cream }}>-{w.amount}₪</span>
                <button
                  type="button"
                  onClick={() => deleteWithdrawal(idx, w)}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    border: `1px solid ${C.line}`,
                    background: "transparent",
                    color: C.dim,
                  }}
                >
                  מחק
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
