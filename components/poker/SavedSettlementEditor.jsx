"use client";

import { LiveSettlementBuilder } from "./LiveSettlementBuilder";
import { playersFromSession, sessionHasBuyinChips, nightSummaryText } from "../../lib/nightShare";
import { savedSettlement } from "../../lib/savedSettlement";
import { saveManualPayments } from "../../lib/paymentTracking";
import { settlementEditNotice } from "../../lib/settlementEditNotice";
import {
  resolveBrowserInviteUrl,
  settlementUpdateMessage,
} from "../../lib/settlementInvite";
import { postToGroup } from "../../lib/postToGroup";
import { flushStore } from "../../lib/store";
import { AL } from "../../lib/poker/helpers";

/**
 * עריכת חלוקה ידנית לערב שמור — נשמרת ב־session.manualSettlement
 * ומתחברת לסימוני «שולם». העורך נפתח גם אחרי שסומנו תשלומים; סימון נשמר
 * רק אם אותה העברה נשארת בדיוק כפי שהייתה, וכל שמירה מקדמת גרסה.
 */
export function SavedSettlementEditor({ db, sessionId, commit, onClose }) {
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  const players = playersFromSession(session);
  const cps = sessionHasBuyinChips(session) ? session.cps || 2 : 1;
  const saved = savedSettlement(players, cps, session.manualSettlement);
  const notice = settlementEditNotice(session);
  const summaryText = nightSummaryText(session, AL(db));
  const settlementVersion = Number(session.manualSettlement?.settlementVersion) || 0;
  const updateText = settlementUpdateMessage(resolveBrowserInviteUrl(null, session.id), {
    d: session.d,
    mo: session.mo,
    settlementVersion,
  });

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
      initialPreferCreditors={saved.preferCreditors}
      notice={notice.text}
      onSendUpdate={
        settlementVersion > 1
          ? async () => {
              await postToGroup(updateText);
            }
          : undefined
      }
      onClose={onClose}
      onChange={(payments, meta) => {
        commit({
          ...db,
          sessions: db.sessions.map((s) =>
            s.id === session.id
              ? saveManualPayments(s, payments, {
                  preferCreditors: meta?.preferCreditors ?? saved.preferCreditors,
                })
              : s
          ),
        });
        void flushStore();
      }}
    />
  );
}
