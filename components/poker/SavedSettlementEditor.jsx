"use client";

import { LiveSettlementBuilder } from "./LiveSettlementBuilder";
import { playersFromSession, sessionHasBuyinChips, nightSummaryText } from "../../lib/nightShare";
import { savedSettlement } from "../../lib/savedSettlement";
import { paymentPlan, saveManualPayments } from "../../lib/paymentTracking";
import { flushStore } from "../../lib/store";
import { AL } from "./helpers";
import { C } from "./colors";

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

  if (hasPaidAuto) {
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
            התשלומים.
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{
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
    );
  }

  return (
    <LiveSettlementBuilder
      key={session.id + saved.basis}
      players={players}
      cps={cps}
      endedAt={session.endedAt || new Date(`${session.iso}T12:00:00`).getTime()}
      title={`חלוקה ${session.d}.${session.mo}.${session.y}`}
      summaryText={nightSummaryText(session, AL(db))}
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
