"use client";

import React, { useMemo, useState } from "react";
import { C } from "./colors";
import { IconBtn } from "./ui";
import { X, Send, Copy, CheckCircle2 } from "./icons";
import { brassCta, sectionEyebrow } from "./festive";
import { getSupabase } from "../../lib/supabaseClient";
import {
  openingBalances,
  debtorsOf,
  creditorsOf,
  applyManualPayment,
  settleFromBalances,
  buildManualSettlementText,
  maxPayable,
} from "../../lib/manualSettlement";

/**
 * חלוקה ידנית בלייב (מנהל בלבד):
 * לכל חייב — סכום (ברירת מחדל מלוא החוב) + בחירת מקבל מהזוכים.
 * החלוקה שנותרה מחושבת מחדש ואפשר לשלוח לקבוצה.
 */
export function LiveSettlementBuilder({
  players,
  cps,
  endedAt,
  summaryText,
  title,
  onClose,
  onDone,
}) {
  const opening = useMemo(() => openingBalances(players, cps), [players, cps]);
  const [balances, setBalances] = useState(opening.balances);
  const [manualPayments, setManualPayments] = useState([]);
  const [fromName, setFromName] = useState("");
  const [toName, setToName] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const debtors = debtorsOf(balances);
  const creditors = creditorsOf(balances);
  const remaining = useMemo(() => settleFromBalances(balances, cps), [balances, cps]);
  const settlementText = useMemo(
    () =>
      buildManualSettlementText({
        manualPayments,
        remaining,
        now: endedAt || Date.now(),
      }),
    [manualPayments, remaining, endedAt]
  );

  const selectDebtor = (name) => {
    setFromName(name);
    setErr("");
    const owe = debtors.find((d) => d.name === name)?.owe || 0;
    const firstCreditor = creditors[0]?.name || "";
    setToName((prev) => {
      const nextTo = creditors.some((c) => c.name === prev) ? prev : firstCreditor;
      setAmount(String(maxPayable(balances, name, nextTo) || owe));
      return nextTo;
    });
  };

  const onPickCreditor = (name) => {
    setToName(name);
    if (fromName) setAmount(String(maxPayable(balances, fromName, name)));
  };

  const addPayment = () => {
    setErr("");
    try {
      const next = applyManualPayment(balances, {
        from: fromName,
        to: toName,
        amount: +amount,
      });
      setBalances(next);
      setManualPayments((list) => [
        ...list,
        { from: fromName, to: toName, amount: Math.round(+amount), id: `m_${Date.now()}` },
      ]);
      const stillOwes = Math.max(0, -(next[fromName] || 0));
      if (stillOwes > 0) {
        const creds = creditorsOf(next);
        const pick = creds[0]?.name || "";
        setToName(pick);
        setAmount(String(maxPayable(next, fromName, pick)));
      } else {
        setFromName("");
        setToName("");
        setAmount("");
      }
    } catch (e) {
      setErr(e.message || "לא ניתן לרשום את ההעברה");
    }
  };

  const undoLastManual = () => {
    if (!manualPayments.length) return;
    /* בונים מחדש מהפתיחה בלי ההעברה האחרונה */
    const kept = manualPayments.slice(0, -1);
    let next = { ...opening.balances };
    for (const p of kept) next = applyManualPayment(next, p);
    setManualPayments(kept);
    setBalances(next);
    setErr("");
  };

  const send = async (text) => {
    setSending(true);
    setErr("");
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ text }),
      });
      const dataRes = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = [dataRes.error, dataRes.detail].filter(Boolean).join(" — ");
        throw new Error(msg || "השליחה נכשלה");
      }
      setSent(true);
      onDone?.({ manualPayments, settlementText: text });
      setTimeout(() => setSent(false), 3500);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const sel = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${C.line}`,
    background: C.feltDeep,
    color: C.cream,
    fontFamily: "inherit",
    fontSize: 14,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        zIndex: 55,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        role="dialog"
        aria-label="חלוקת תשלומים"
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "92vh",
          overflow: "auto",
          background: C.card,
          borderRadius: "18px 18px 0 0",
          border: `1px solid ${C.brass}55`,
          padding: "14px 14px 22px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={sectionEyebrow}>חלוקה ידנית · רק אצלך</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 17, color: C.cream }}>{title || "חלוקת ערב"}</h2>
          </div>
          <IconBtn onClick={onClose} aria-label="סגור">
            <X size={18} />
          </IconBtn>
        </div>

        <p style={{ margin: "0 0 12px", color: C.dim, fontSize: 13, lineHeight: 1.5 }}>
          סמן מי שילם למי במציאות. אפשר לערוך סכום. מה שנשאר יחושב אוטומטית לפני השליחה לקבוצה.
        </p>

        {debtors.length === 0 ? (
          <p role="status" style={{ color: C.win, fontWeight: 600 }}>הכול סגור — אין חובות פתוחים.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.dim }}>מי שצריך לשלם</div>
            {debtors.map((d) => (
              <button
                key={d.name}
                type="button"
                onClick={() => selectDebtor(d.name)}
                style={{
                  textAlign: "right",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${fromName === d.name ? C.brass : C.line}`,
                  background: fromName === d.name ? `${C.brass}22` : C.feltDeep,
                  color: C.cream,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span>{d.name}</span>
                <b style={{ color: C.loss }}>{d.owe}₪</b>
              </button>
            ))}
          </div>
        )}

        {fromName && creditors.length > 0 && (
          <div
            style={{
              border: `1px solid ${C.line}`,
              borderRadius: 14,
              padding: 12,
              marginBottom: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{fromName} שילם למי?</div>
            <label style={{ fontSize: 12, color: C.dim }}>
              מקבל
              <select
                aria-label="בחירת מקבל"
                value={toName}
                onChange={(e) => onPickCreditor(e.target.value)}
                style={{ ...sel, marginTop: 4 }}
              >
                {creditors.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} · מגיע {c.due}₪
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: C.dim }}>
              סכום (₪)
              <input
                inputMode="numeric"
                aria-label="סכום העברה"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                style={{ ...sel, marginTop: 4 }}
              />
            </label>
            <button type="button" onClick={addPayment} style={{ ...brassCta, width: "100%", padding: 12, borderRadius: 12 }}>
              רשום העברה
            </button>
          </div>
        )}

        {manualPayments.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: C.dim }}>נרשם ידנית</div>
              <button
                type="button"
                onClick={undoLastManual}
                style={{ background: "none", border: "none", color: C.brass, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                בטל אחרונה
              </button>
            </div>
            <ul style={{ margin: "6px 0 0", paddingInlineStart: 18, lineHeight: 1.7, fontSize: 13 }}>
              {manualPayments.map((p) => (
                <li key={p.id}>
                  {p.from} → {p.to} · {p.amount}₪
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>
            {debtors.length ? "מה שנשאר לשלוח" : "חלוקה סופית"}
          </div>
          <pre
            dir="rtl"
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              fontSize: 13,
              lineHeight: 1.6,
              background: C.feltDeep,
              borderRadius: 12,
              padding: 12,
              border: `1px solid ${C.line}`,
            }}
          >
            {settlementText}
          </pre>
        </div>

        {err && (
          <p role="alert" style={{ color: C.loss, fontSize: 13 }}>
            {err}
          </p>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => copy(settlementText)}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 12,
              border: `1px solid ${C.line}`,
              background: "transparent",
              color: C.cream,
              fontFamily: "inherit",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Copy size={16} />
            {copied ? "הועתק" : "העתק"}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => send(settlementText)}
            style={{
              ...brassCta,
              flex: 1.2,
              padding: 12,
              borderRadius: 12,
              opacity: sending ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {sent ? <CheckCircle2 size={16} /> : <Send size={16} />}
            {sent ? "נשלח" : sending ? "שולח…" : "שלח חלוקה"}
          </button>
        </div>

        {summaryText && (
          <button
            type="button"
            onClick={() => send(summaryText)}
            style={{
              width: "100%",
              marginTop: 8,
              padding: 10,
              borderRadius: 12,
              border: "none",
              background: "transparent",
              color: C.dim,
              fontFamily: "inherit",
              fontSize: 12,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            שלח גם סיכום נטו + טיפים
          </button>
        )}
      </div>
    </div>
  );
}
