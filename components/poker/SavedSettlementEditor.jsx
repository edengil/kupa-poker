"use client";

import { useState } from "react";
import { LiveSettlementBuilder } from "./LiveSettlementBuilder";
import { playersFromSession, sessionHasBuyinChips, nightSummaryText } from "../../lib/nightShare";
import { savedSettlement } from "../../lib/savedSettlement";
import { paymentPlan, saveManualPayments } from "../../lib/paymentTracking";
import { resolveBrowserInviteUrl, withSettlementLink } from "../../lib/settlementInvite";
import { postToGroup } from "../../lib/postToGroup";
import { flushStore } from "../../lib/store";
import { AL } from "../../lib/poker/helpers";
import { C } from "../../lib/poker/colors";
import { brassCta } from "../../lib/poker/festive";

/* חלוקה שכבר סומן בה «שולם» נעולה לעריכה, אבל הסיכום והלינק לערב עדיין
   חייבים לצאת מכאן — סימון ראשון (למשל בין בני זוג) מגיע לפעמים שניות אחרי השמירה. */
function BlockedSettlementDialog({ groupText, onClose }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const send = async () => {
    setSending(true);
    setErr("");
    try {
      await postToGroup(groupText);
      setSent(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="חלוקת תשלומים"
      data-testid="saved-settlement-blocked"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: C.card,
          color: C.cream,
          borderRadius: "18px 18px 0 0",
          border: `1px solid ${C.brass}55`,
          padding: "18px 16px 22px",
        }}
      >
        <p style={{ margin: "0 0 14px", lineHeight: 1.6, color: C.dim }}>
          יש העברות אוטומטיות שסומנו כשולמו. כדי לשנות את החלוקה, בטל תחילה את הסימון שלהן בטבלת
          התשלומים. את הסיכום והלינק לערב אפשר לשלוח לקבוצה כבר עכשיו.
        </p>
        {err && (
          <p role="alert" style={{ color: C.loss, fontSize: 13, margin: "0 0 10px" }}>
            {err}
          </p>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={send}
            disabled={sending || sent}
            data-testid="saved-settlement-send-link"
            style={{ ...brassCta, flex: 1.6, padding: 12, borderRadius: 12, opacity: sending ? 0.7 : 1 }}
          >
            {sent ? "נשלח לקבוצה" : sending ? "שולח…" : "שלח סיכום + לינק לקבוצה"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              background: C.feltDeep,
              color: C.brass,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "10px 14px",
              fontFamily: "inherit",
            }}
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * עריכת חלוקה ידנית לערב שמור — נשמרת ב־session.manualSettlement
 * ומתחברת לסימוני «שולם».
 */
export function SavedSettlementEditor({ db, sessionId, commit, onClose }) {
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  const players = playersFromSession(session);
  const cps = sessionHasBuyinChips(session) ? session.cps || 2 : 1;
  const saved = savedSettlement(players, cps, session.manualSettlement);
  const tracked = paymentPlan(session);
  const hasPaidAuto = tracked.transfers.some((t, i) => !t.manual && tracked.paid[i]);
  const summaryText = nightSummaryText(session, AL(db));

  if (hasPaidAuto) {
    return (
      <BlockedSettlementDialog
        groupText={withSettlementLink(summaryText, resolveBrowserInviteUrl(null, session.id))}
        onClose={onClose}
      />
    );
  }

  return (
    <LiveSettlementBuilder
      key={session.id + saved.basis}
      players={players}
      cps={cps}
      endedAt={session.endedAt || new Date(`${session.iso}T12:00:00`).getTime()}
      title={`חלוקה ${session.d}.${session.mo}.${session.y}`}
      sessionId={session.id}
      dateLabel={`${session.d}.${session.mo}.${session.y}`}
      summaryText={summaryText}
      initialPayments={saved.manualPayments}
      onClose={onClose}
      onChange={(payments) => {
        commit({
          ...db,
          sessions: db.sessions.map((s) =>
            s.id === session.id ? saveManualPayments(s, payments) : s
          ),
        });
        void flushStore();
      }}
    />
  );
}
