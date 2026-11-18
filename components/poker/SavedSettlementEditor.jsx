"use client";

import { LiveSettlementBuilder } from "./LiveSettlementBuilder";
import {
  sessionHasBuyinChips,
  nightSummaryText,
  settlementPlayersFor,
  isLegacySettlement,
  edenNameIn,
  potPlanFor,
  POT_SINK_NAME,
} from "@/lib/nightShare";
import { savedSettlement } from "@/lib/savedSettlement";
import {
  saveManualPayments,
  markedTransfersBlockingSave,
  markedSaveBlockMessage,
} from "@/lib/paymentTracking";
import { settlementEditNotice } from "@/lib/settlementEditNotice";
import {
  resolveBrowserInviteUrl,
  settlementUpdateMessage,
} from "@/lib/settlementInvite";
import { postToGroup } from "@/lib/postToGroup";
import { flushStore } from "@/lib/store";
import { AL } from "@/lib/poker/helpers";

/**
 * עריכת חלוקה ידנית לערב שמור — נשמרת ב־session.manualSettlement
 * ומתחברת לסימוני «שולם». העורך נפתח גם אחרי שסומנו תשלומים; סימון נשמר
 * אם אותה העברה נשארת בדיוק כפי שהייתה, וכל שמירה מקדמת גרסה. העברה
 * מסומנת נעולה: שמירה שמשנה אותה נחסמת עד שמבטלים את סימונה (החלטה 4).
 */
export function SavedSettlementEditor({ db, sessionId, commit, onClose }) {
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  const players = settlementPlayersFor(session);
  const cps = sessionHasBuyinChips(session) ? session.cps || 2 : 1;
  const legacy = isLegacySettlement(session);
  const potAmount = legacy ? 0 : potPlanFor(session);
  const saved = savedSettlement(players, cps, session.manualSettlement, {
    potAmount,
    potSinkName: POT_SINK_NAME,
    edenName: edenNameIn(session),
  });
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
      initialShortfall={saved.shortfall}
      potAmount={potAmount}
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
        /* נעילת החלטה 4 (18.11): שמירה שמשנה העברה מסומנת נחסמת כאן,
           בשער העורך — השגיאה מוצגת בבונה דרך ערוץ ה־err הקיים, והשמירה
           לא מתבצעת. ביטול הסימון (מכרטיס הערב/החלוקה) פותח את העריכה. */
        const preferCreditors = meta?.preferCreditors ?? saved.preferCreditors;
        const blocked = markedTransfersBlockingSave(session, payments, { preferCreditors });
        if (blocked.length) {
          throw new Error(markedSaveBlockMessage(blocked));
        }
        commit({
          ...db,
          sessions: db.sessions.map((s) =>
            s.id === session.id
              ? saveManualPayments(s, payments, { preferCreditors })
              : s
          ),
        });
        void flushStore();
      }}
    />
  );
}
