"use client";

import React from "react";
import { LastSettlementCard } from "./LastSettlementCard";
import { PersonalStatsCard } from "./PersonalStatsCard";
import { PersonalHighlightsCard } from "./PersonalHighlightsCard";
import { RsvpList } from "../Rsvp";
import { getSupabase } from "../../lib/supabaseClient";
import { wazeShortUrl } from "./hosts";
import { festiveCardSoft, sectionEyebrow } from "./festive";
import { C } from "./colors";

/**
 * לינק לערב: קודם העברות, הוראות הגעה ואישורי הגעה, ואז השיאים האישיים.
 */
export function NightFocus({
  db,
  sessionId,
  viewerName,
  isAdmin = false,
  commit,
  readOnly = false,
  onMarkPayment = null,
  groupId = null,
}) {
  const session = (db?.sessions || []).find((s) => s.id === sessionId) || null;
  const supabase = getSupabase();
  const location = session?.location || "";
  const note = session?.placeNote || "";
  const waze = wazeShortUrl(location || note);

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

      <section style={{ ...festiveCardSoft, padding: "13px 14px", marginBottom: 12 }} aria-label="הוראות הגעה">
        <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
          <span>♠</span>
          הוראות הגעה
        </div>
        {location || note ? (
          <>
            {location ? <p style={{ margin: "0 0 8px", lineHeight: 1.55 }}>{location}</p> : null}
            {note ? <p style={{ margin: "0 0 8px", color: C.dim, lineHeight: 1.5 }}>{note}</p> : null}
            {waze ? (
              <a href={waze} style={{ color: C.brass, fontWeight: 700 }}>
                ניווט
              </a>
            ) : null}
          </>
        ) : (
          <p style={{ margin: 0, color: C.dim, lineHeight: 1.5 }}>אין הוראות הגעה שמורות לערב הזה.</p>
        )}
      </section>

      <section style={{ ...festiveCardSoft, padding: "13px 14px", marginBottom: 12 }} aria-label="אישורי הגעה">
        <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
          <span>♠</span>
          אישורי הגעה
        </div>
        {groupId ? (
          <RsvpList supabase={supabase} groupId={groupId} planIso={session.iso} />
        ) : (
          <p style={{ margin: 0, color: C.dim }}>אישורי ההגעה לא זמינים עכשיו.</p>
        )}
      </section>

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
