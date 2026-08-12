"use client";

import React, { useState } from "react";
import { C } from "./colors";
import { IconBtn } from "./ui";
import { waOpen } from "./helpers";
import { CheckCircle2, Copy, Send, Share2, X } from "./icons";

/* גיליון שיתוף לסיכום / חלוקה — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function ShareSheet({
  title,
  text,
  settlement,
  onClose,
  initialView = "summary",
}) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState(initialView);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const body = view === "split" && settlement ? settlement : text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  // שליחה ישירה לקבוצה דרך הבוט. השרת מאמת שזה אתה לפני שהוא מפרסם.
  const send = async () => {
    setSending(true);
    setErr("");
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "השליחה נכשלה");
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const tab = (active) => ({
    flex: 1,
    padding: "8px 10px",
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 13.5,
    fontWeight: 600,
    background: active ? C.brass : "transparent",
    color: active ? C.feltDeep : C.dim,
  });

  const ghost = {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${C.line}`,
    fontSize: 14.5,
    fontWeight: 600,
    cursor: "pointer",
    background: "transparent",
    color: C.cream,
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        style={{
          width: "100%",
          maxWidth: 640,
          background: C.felt,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          border: `1px solid ${C.line}`,
          padding: "18px 16px 26px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <b style={{ fontSize: 16 }}>{title}</b>
          <IconBtn onClick={onClose}>
            <X size={17} />
          </IconBtn>
        </div>

        {settlement && (
          <div
            style={{
              display: "flex",
              gap: 4,
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 999,
              padding: 4,
              marginBottom: 12,
            }}
          >
            <button onClick={() => setView("summary")} style={tab(view === "summary")}>
              סיכום
            </button>
            <button onClick={() => setView("split")} style={tab(view === "split")}>
              חלוקה
            </button>
          </div>
        )}

        <textarea
          readOnly
          value={body}
          rows={Math.min(16, body.split("\n").length + 1)}
          onFocus={(e) => e.target.select()}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: C.card,
            color: C.cream,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            padding: 14,
            fontSize: 14.5,
            lineHeight: 1.6,
            fontFamily: "inherit",
            resize: "none",
          }}
        />

        {err && (
          <p style={{ color: C.loss, fontSize: 12.5, margin: "8px 2px 0" }}>
            {err} — אפשר לשלוח ידנית למטה.
          </p>
        )}

        <button
          onClick={send}
          disabled={sending}
          style={{
            width: "100%",
            marginTop: 12,
            padding: 13,
            borderRadius: 12,
            border: "none",
            fontSize: 15,
            fontWeight: 700,
            cursor: sending ? "default" : "pointer",
            opacity: sending ? 0.6 : 1,
            background: sent ? C.win : "#25D366",
            color: "#06301B",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {sent ? (
            <>
              <CheckCircle2 size={18} />
              נשלח לקבוצה
            </>
          ) : (
            <>
              <Send size={18} />
              {sending ? "שולח…" : "שלח לקבוצה"}
            </>
          )}
        </button>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={copy} style={{ ...ghost, color: copied ? C.win : C.cream }}>
            {copied ? (
              <>
                <CheckCircle2 size={18} />
                הועתק
              </>
            ) : (
              <>
                <Copy size={18} />
                העתק
              </>
            )}
          </button>
          <button onClick={() => waOpen(body)} style={ghost}>
            <Share2 size={18} />
            פתח בוואטסאפ
          </button>
        </div>
      </div>
    </div>
  );
}
