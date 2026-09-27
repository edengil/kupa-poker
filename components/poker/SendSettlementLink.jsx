"use client";

import React, { useState } from "react";
import { C } from "../../lib/poker/colors";
import { waShare } from "../../lib/poker/helpers";
import { postToGroup } from "../../lib/postToGroup";
import { resolveBrowserInviteUrl, settlementLinkMessage } from "../../lib/settlementInvite";
import { CheckCircle2, Copy, Send, Share2 } from "./icons";

/**
 * שליחת לינק החלוקה של ערב לקבוצה (/g/{slug}/n/{sessionId}) — למנהל בלבד.
 * כשנגמרת מכסת Whapi, או שהשרת לא מזהה אותך כבעלים, נפתח שיתוף/העתקה ידני.
 */
export function SendSettlementLink({ session, style }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [fallback, setFallback] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!session?.id) return null;
  const text = settlementLinkMessage(resolveBrowserInviteUrl(null, session.id), session);

  const send = async () => {
    setSending(true);
    setErr("");
    setFallback(false);
    try {
      await postToGroup(text);
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (e) {
      setFallback(Boolean(e.shareFallback) || e.code === "no_group");
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const btn = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "8px 10px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
  };

  return (
    <div data-testid={`send-settlement-link-${session.id}`} style={{ marginBottom: 8, ...style }}>
      <button
        type="button"
        onClick={send}
        disabled={sending}
        data-testid="send-settlement-link"
        style={{
          ...btn,
          width: "100%",
          border: "none",
          background: sent ? C.win : "#25D366",
          color: "#06301B",
          opacity: sending ? 0.6 : 1,
          cursor: sending ? "default" : "pointer",
        }}
      >
        {sent ? <CheckCircle2 size={16} /> : <Send size={16} />}
        {sent ? "הלינק נשלח לקבוצה" : sending ? "שולח…" : "שלח לינק חלוקה לקבוצה"}
      </button>
      {err && (
        <p style={{ color: C.loss, fontSize: 12, margin: "6px 2px 0" }}>
          {err}
          {fallback ? " — אפשר לשתף את הלינק ידנית:" : ""}
        </p>
      )}
      {fallback && (
        <div data-testid="send-settlement-link-fallback" style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            type="button"
            onClick={() => waShare(text)}
            style={{ ...btn, flex: 1, border: `1px solid ${C.brass}`, background: C.brass, color: C.feltDeep }}
          >
            <Share2 size={16} />
            שתף מהמכשיר
          </button>
          <button
            type="button"
            onClick={copy}
            style={{
              ...btn,
              flex: 1,
              border: `1px solid ${C.line}`,
              background: "transparent",
              color: copied ? C.win : C.cream,
            }}
          >
            {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            {copied ? "הועתק" : "העתק"}
          </button>
        </div>
      )}
    </div>
  );
}
