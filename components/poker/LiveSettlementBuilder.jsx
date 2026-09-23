"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import {
  buildSettlementInviteText,
  resolveBrowserInviteUrl,
} from "../../lib/settlementInvite";
import { withBotMark } from "../../lib/botMark";

/**
 * חלוקה ידנית (מנהל):
 * - העדפת זוכים כשיש חוסר
 * - בחירת מי מעביר למי
 * - שליחת לינק לקבוצה (לא פירוט העברות)
 */
export function LiveSettlementBuilder({
  players,
  cps,
  endedAt,
  summaryText,
  title,
  onClose,
  onDone,
  initialPayments = [],
  onChange,
  inviteSlug,
  sessionId,
  dateLabel,
}) {
  const rawOpening = useMemo(() => openingBalances(players, cps), [players, cps]);
  const winnerNames = useMemo(
    () =>
      Object.entries(rawOpening.balances)
        .filter(([, n]) => n > 0)
        .map(([name]) => name)
        .sort((a, b) => a.localeCompare(b, "he")),
    [rawOpening.balances]
  );

  const [prefer, setPrefer] = useState([]);
  const opening = useMemo(
    () => openingBalances(players, cps, { preferCreditors: prefer }),
    [players, cps, prefer]
  );

  const [balances, setBalances] = useState(opening.balances);
  const [manualPayments, setManualPayments] = useState(initialPayments);
  const [fromName, setFromName] = useState("");
  const [toName, setToName] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const preferKey = prefer.slice().sort().join("\0");
  const lastPreferKey = React.useRef(preferKey);

  useEffect(() => {
    const preferChanged = lastPreferKey.current !== preferKey;
    lastPreferKey.current = preferKey;
    const seed = preferChanged ? [] : initialPayments;
    let next = { ...opening.balances };
    const kept = [];
    for (const p of seed) {
      try {
        next = applyManualPayment(next, p);
        kept.push(p);
      } catch {
        break;
      }
    }
    setBalances(next);
    setManualPayments(kept);
    if (preferChanged) {
      onChange?.([]);
      setFromName("");
      setToName("");
      setAmount("");
      setErr("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferKey, players, cps, opening.shortfall]);

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

  const inviteUrl = resolveBrowserInviteUrl(inviteSlug, sessionId);
  const inviteText = useMemo(() => {
    let siteUrl;
    let slug = inviteSlug;
    if (inviteUrl) {
      const m = inviteUrl.match(/^(https?:\/\/[^/]+)\/g\/([^/?#]+)/i);
      if (m) {
        siteUrl = m[1];
        slug = decodeURIComponent(m[2]);
      }
    }
    return buildSettlementInviteText({
      dateLabel,
      siteUrl,
      slug,
      sessionId,
      headline: title || "חשבון סופי",
    });
  }, [inviteUrl, inviteSlug, dateLabel, title, sessionId]);

  const togglePrefer = (name) => {
    setPrefer((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

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
      const payments = [
        ...manualPayments,
        { from: fromName, to: toName, amount: Math.round(+amount), id: crypto.randomUUID() },
      ];
      onChange?.(payments);
      setBalances(next);
      setManualPayments(payments);
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
    const kept = manualPayments.slice(0, -1);
    let next = { ...opening.balances };
    for (const p of kept) next = applyManualPayment(next, p);
    onChange?.(kept);
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
      setTimeout(() => {
        setSent(false);
        onClose?.();
      }, 900);
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
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
        data-testid="live-settlement-builder"
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
            <div style={sectionEyebrow}>חלוקה · עריכה אצלך · לינק לקבוצה</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 17, color: C.cream }}>{title || "חלוקת ערב"}</h2>
          </div>
          <IconBtn onClick={onClose} aria-label="סגור" data-testid="settlement-close">
            <X size={18} />
          </IconBtn>
        </div>

        <p style={{ margin: "0 0 12px", color: C.dim, fontSize: 13, lineHeight: 1.5 }}>
          ערוך מי מעביר למי (ואם יש חוסר — למי לשמור יותר). לחיצה על «אשר ושלח לינק» שולחת לקבוצה רק
          לינק: כולם נכנסים, רואים את החלוקה ומסמנים שולם. אפשר לחזור ולערוך מאוחר יותר מכרטיס החלוקה.
        </p>

        {rawOpening.shortfall > 0 && winnerNames.length > 0 && (
          <div
            data-testid="shortfall-prefer"
            style={{
              border: `1px solid ${C.brass}66`,
              borderRadius: 14,
              padding: 12,
              marginBottom: 14,
              background: `${C.brass}14`,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: C.brass }}>
              חוסר {rawOpening.shortfall}₪ — למי לשמור יותר?
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 8, lineHeight: 1.45 }}>
              מי שמסומן ייפגע פחות מהחוסר; השאר יישאו קודם.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {winnerNames.map((name) => {
                const on = prefer.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => togglePrefer(name)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 20,
                      border: `1px solid ${on ? C.brass : C.line}`,
                      background: on ? `${C.brass}33` : C.feltDeep,
                      color: C.cream,
                      fontFamily: "inherit",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {on ? "★ " : ""}
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {debtors.length === 0 ? (
          <p role="status" style={{ color: C.win, fontWeight: 600 }}>
            הכול סגור — אין חובות פתוחים.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.dim }}>מי שצריך לשלם — בחר כדי לשייך מקבל</div>
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
            <div style={{ fontSize: 13, fontWeight: 600 }}>{fromName} יעביר למי?</div>
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
                    {c.name} · נותר {c.due}₪
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
                style={{
                  background: "none",
                  border: "none",
                  color: C.brass,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
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
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>תצוגה מקדימה (רק אצלך)</div>
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
            {copied ? "הועתק" : "העתק פירוט"}
          </button>
          <button
            type="button"
            disabled={sending}
            data-testid="settlement-send-invite"
            onClick={async () => {
              await send(inviteText);
            }}
            style={{
              ...brassCta,
              flex: 1.6,
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
            {sent ? "אושר ונשלח" : sending ? "שולח…" : "אשר ושלח לינק"}
          </button>
        </div>

        <button
          type="button"
          disabled={sending}
          onClick={() =>
            send(
              withBotMark(
                `${title || "חלוקה"}\n\n${settlementText}\n\n📱 סימון שולם באפליקציה:\n${inviteUrl || ""}`
              )
            )
          }
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
          שלח גם פירוט מלא לקבוצה (ישן)
        </button>

        {summaryText && (
          <button
            type="button"
            onClick={() => send(summaryText)}
            style={{
              width: "100%",
              marginTop: 4,
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
            שלח סיכום נטו + טיפים
          </button>
        )}
      </div>
    </div>
  );
}
