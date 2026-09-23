"use client";

import React from "react";
import { LastSettlementCard } from "./LastSettlementCard";
import { PersonalStatsCard } from "./PersonalStatsCard";
import { PersonalHighlightsCard } from "./PersonalHighlightsCard";
import { festiveCardSoft } from "./festive";
import { C } from "./colors";

/**
 * לינק חלוקה לערב ספציפי: העברות + סימון שולם, ואז שיאים אישיים.
 * אישורי הגעה והוראות מגיעים בהזמנה ל־/g/slug לפני המשחק — לא כאן.
 */
export function NightFocus({
  db,
  sessionId,
  viewerName,
  isAdmin = false,
  commit,
  readOnly = false,
  onMarkPayment = null,
}) {
  const session = (db?.sessions || []).find((s) => s.id === sessionId) || null;

  if (!session) {
    return (
      <section style={{ ...festiveCardSoft, padding: 14, marginBottom: 12 }}>
        <p style={{ margin: 0, color: C.dim, lineHeight: 1.5 }}>
          הערב הזה לא זמין בלינק. בקש מהמנהל לפתוח את היסטוריית הערבים.
        </p>
      </section>
    );
  }

  return (
    <div data-testid="night-focus">
      <LastSettlementCard
        db={db}
        sessionId={session.id}
        commit={commit}
        readOnly={readOnly}
        viewerName={viewerName}
        isAdmin={isAdmin}
        onMarkPayment={onMarkPayment}
      />

      {viewerName ? (
        <>
          <PersonalStatsCard db={db} playerName={viewerName} compact />
          <PersonalHighlightsCard db={db} playerName={viewerName} compact />
        </>
      ) : (
        <p style={{ margin: "0 0 12px", color: C.dim, fontSize: 13, lineHeight: 1.5 }}>
          השיאים האישיים יופיעו כאן כשהשם בגוגל מזוהה עם שחקן בטבלה.
        </p>
      )}
    </div>
  );
}
