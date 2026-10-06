"use client";

import React, { useMemo, useState } from "react";
import { SavedSettlementEditor } from "./SavedSettlementEditor";
import { SendSettlementLink } from "./SendSettlementLink";
import { C } from "../../lib/poker/colors";
import { festiveCardSoft, festiveGlow, sectionEyebrow } from "../../lib/poker/festive";
import { settlementTextForSession } from "../../lib/nightShare";
import { paymentPlan, markTransfer } from "../../lib/paymentTracking";
import { settlementVersionLabel } from "../../lib/savedSettlement";
import { confirmationStatusText, sessionConfirmations, settlementLinkSummary } from "../../lib/nightConfirmations";
import { latestSession, pastSettlementSessions } from "../../lib/lastSession";
import { allTransfersPaid } from "../../lib/settlementClosed";
import { canMarkTransfer, couplePartner } from "../../lib/paymentAccess";
import { announceSettlementClosed } from "../../lib/announceSettlementClosed";
import { notifyPaymentConfirmed } from "../../lib/poker/notifyTransfersClient";
import { flushStore } from "../../lib/store";
import { AL, canon } from "../../lib/poker/helpers";
import {
  playerOfNightCandidates,
  playerOfNightTally,
  voteForPlayer,
} from "../../lib/poker/playerOfNight";
import { ChevronDown } from "./icons";

/**
 * כרטיס «חלוקה אחרונה» בראש טאב הטבלה — מי מעביר למי.
 * מחושב תמיד מחדש; גלוי גם לצופים ב־/g/{slug}.
 * onMarkPayment(session, index, paid) — לצופים (RPC); אחרת commit מקומי.
 * collapsible — כותרת שפותחת וסוגרת את הכרטיס (ערבים קודמים מתחילים סגורים).
 */
export function LastSettlementCard({
  db,
  commit,
  readOnly = false,
  viewerName = null,
  isAdmin = false,
  sessionId = null,
  onMarkPayment = null,
  onVotePlayer = null,
  collapsible = false,
  defaultOpen = true,
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(defaultOpen);
  const A = useMemo(() => AL(db), [db]);
  const me = viewerName ? canon(viewerName, A) : null;

  const card = useMemo(() => {
    const session = sessionId
      ? (db?.sessions || []).find((s) => s.id === sessionId) || null
      : latestSession(db?.sessions);
    if (!session) return null;
    const text = settlementTextForSession(session);
    const isLatest = latestSession(db?.sessions)?.id === session.id;
    return { session, isLatest, text: text || "", ...paymentPlan(session) };
  }, [db?.sessions, sessionId]);

  /* הצבעת שחקן הערב — הקולות על הערב עצמו; צופה מצביע דרך RPC, מנהל דרך commit */
  const potnSession = card?.session || null;
  const potn = useMemo(() => playerOfNightTally(potnSession, A), [potnSession, A]);
  const potnCandidates = useMemo(
    () => playerOfNightCandidates(potnSession, A),
    [potnSession, A]
  );
  const [voting, setVoting] = useState(false);

  if (!card) return null;

  const { session, isLatest, text, transfers } = card;
  const dateLabel = `${session.d}.${session.mo}.${session.y}`;
  const heading = isLatest ? `חלוקה · ערב אחרון · ${dateLabel}` : `חלוקה · ערב ${dateLabel}`;
  const expanded = !collapsible || open;
  const confirmations = sessionConfirmations(session);
  const summary = settlementLinkSummary(confirmations?.rows);

  const partner = couplePartner(me, A);
  const isMine = (transfer) => {
    if (!me) return false;
    const from = canon(transfer.from, A);
    return from === me || from === partner;
  };
  const isSelf = (transfer) => me && canon(transfer.from, A) === me;
  const mine = me ? transfers.map((t, i) => ({ t, i })).filter(({ t }) => isMine(t)) : [];
  const others = me ? transfers.map((t, i) => ({ t, i })).filter(({ t }) => !isMine(t)) : transfers.map((t, i) => ({ t, i }));

  const canMark = (!readOnly && !!commit) || typeof onMarkPayment === "function";
  const canEditManual = !readOnly && !!commit;
  const canSendLink = isAdmin || canEditManual;

  const myVote = me ? session.playerOfNightVotes?.[me] : undefined;
  const canVote = !!me && (typeof onVotePlayer === "function" || (!readOnly && !!commit));
  const vote = async (candidate) => {
    if (!canVote || voting) return;
    setVoting(true);
    try {
      if (typeof onVotePlayer === "function") {
        /* השרת משווה לשמות כפי שנשמרו בערב — שולחים את השם הגולמי מהרשומה */
        const rawCandidate =
          (session.entries || []).find((e) => canon(e.name, A) === candidate)?.name ||
          candidate;
        await onVotePlayer(session, rawCandidate, me);
      } else if (commit) {
        const next = voteForPlayer(session, me, candidate, A);
        if (next !== session) {
          commit({
            ...db,
            sessions: db.sessions.map((s) => (s.id === session.id ? next : s)),
          });
          await flushStore();
        }
      }
    } finally {
      setVoting(false);
    }
  };

  const mayToggle = (transfer) => {
    if (!canMark) return false;
    if (!readOnly && commit) return true;
    return canMarkTransfer({ viewerName, transfer, isAdmin, aliases: A });
  };

  const mark = async (index, value) => {
    if (!mayToggle(transfers[index]) || busy != null) return;
    setBusy(index);
    try {
      const next = markTransfer(session, index, value, viewerName);
      if (typeof onMarkPayment === "function") {
        await onMarkPayment(session, index, value, "paid", viewerName);
      } else if (commit) {
        commit({
          ...db,
          sessions: db.sessions.map((s) => (s.id === session.id ? next : s)),
        });
        await flushStore();
      }
      if (value && allTransfersPaid(next)) {
        await announceSettlementClosed(session.id);
      }
      if (value) {
        // שחקן אישר תשלום — מתריע למנהל
        const t = transfers[index];
        void notifyPaymentConfirmed(session.id, {
          transferIndex: index,
          payerName: viewerName || t?.from,
          payeeName: t?.to,
          amount: t?.amount,
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ transfer, index }) => {
    const mineRow = isMine(transfer);
    const statusRow = confirmations?.rows[index];
    const closed = !!statusRow?.closed;
    return (
      <label
        key={index}
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: "9px 0",
          borderBottom: `1px solid ${C.line}`,
          background: mineRow ? `${C.brass}14` : "transparent",
          borderRadius: mineRow ? 8 : 0,
          paddingInline: mineRow ? 8 : 0,
        }}
      >
        {mayToggle(transfer) && (
          <input
            type="checkbox"
            checked={closed}
            disabled={busy === index || (closed && !statusRow.confirmed)}
            onChange={(e) => mark(index, e.target.checked)}
            aria-label={`${confirmationStatusText(statusRow)}: ${transfer.from} אל ${transfer.to}, ${transfer.amount} שקלים`}
            style={{ width: 20, height: 20, accentColor: C.win }}
          />
        )}
        {!mayToggle(transfer) && <span style={{ width: 20 }} />}
        <span style={{ flex: 1 }}>
          {isSelf(transfer) ? (
            <>
              אתה מעביר ל־<b>{transfer.to}</b>
            </>
          ) : (
            <>
              {transfer.from} אל {transfer.to}
            </>
          )}
        </span>
        <b>{transfer.amount}₪</b>
        <span style={{ color: closed ? C.win : C.dim, fontSize: 12 }}>
          {confirmationStatusText(statusRow)}
        </span>
      </label>
    );
  };

  return (
    <section
      style={{
        ...festiveCardSoft,
        position: "relative",
        overflow: "hidden",
        padding: "13px 14px 12px",
        marginBottom: 12,
      }}
      aria-label={isLatest ? `חלוקה אחרונה ${dateLabel}` : `חלוקה ${dateLabel}`}
      data-testid={isLatest ? "last-settlement-card" : `past-settlement-card-${session.id}`}
    >
      {editing && (
        <SavedSettlementEditor
          db={db}
          commit={commit}
          sessionId={session.id}
          onClose={() => setEditing(false)}
        />
      )}
      <div style={festiveGlow} aria-hidden />
      <div style={{ position: "relative" }}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            data-testid={`settlement-toggle-${session.id}`}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 0,
              marginBottom: 8,
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              textAlign: "right",
              fontFamily: "inherit",
            }}
          >
            <span style={{ ...sectionEyebrow, flex: 1 }}>
              <span>♠</span>
              {heading}
            </span>
            <ChevronDown
              size={18}
              color={C.dim}
              style={{ transform: open ? "rotate(180deg)" : "none" }}
            />
          </button>
        ) : (
          <div style={{ ...sectionEyebrow, marginBottom: 8 }}>
            <span>♠</span>
            {heading}
          </div>
        )}
        <p
          style={{
            margin: expanded ? "0 0 8px" : 0,
            fontSize: 12.5,
            color: C.dim,
            lineHeight: 1.5,
          }}
        >
          {summary}
        </p>
        {settlementVersionLabel(session) ? (
          <p
            data-testid="settlement-version"
            style={{ margin: "0 0 8px", fontSize: 12, color: C.brass, lineHeight: 1.5 }}
          >
            {settlementVersionLabel(session)}
          </p>
        ) : null}
        {expanded && (
        <>
        {canMark && (
          <p style={{ margin: "0 0 8px", fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
            כל אחד מסמן רק את ההעברה שלו. זוגות מסמנים אחד לשני. המנהל מסמן הכל.
          </p>
        )}
        {canEditManual && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              color: C.brass,
              background: C.feltDeep,
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              padding: 8,
              marginBottom: 8,
            }}
          >
            עריכת מי מעביר למי
          </button>
        )}
        {canSendLink && transfers.length > 0 && <SendSettlementLink session={session} />}
        <div
          dir="rtl"
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 14.5,
            lineHeight: 1.65,
            color: C.cream,
            fontVariantNumeric: "tabular-nums",
            background: C.feltDeep,
            border: `1px solid ${C.brass}44`,
            borderRadius: 10,
            padding: "11px 12px",
          }}
        >
          {transfers.length === 0 ? (
            <div style={{ color: C.dim, fontSize: 13 }}>אין העברות לתשלום בערב הזה.</div>
          ) : (
            <>
              {mine.length > 0 && (
                <>
                  <div style={{ fontSize: 12, color: C.brass, marginBottom: 4, fontWeight: 700 }}>
                    {partner ? "ההעברות שלך ושל בן או בת הזוג" : "מה שאתה צריך להעביר"}
                  </div>
                  {mine.map(({ t, i }) => (
                    <Row key={`mine-${i}`} transfer={t} index={i} />
                  ))}
                </>
              )}
              {others.length > 0 && (
                <>
                  {mine.length > 0 && (
                    <div style={{ fontSize: 12, color: C.dim, margin: "10px 0 4px", fontWeight: 600 }}>
                      שאר ההעברות
                    </div>
                  )}
                  {others.map(({ t, i }) => (
                    <Row key={`other-${i}`} transfer={t} index={i} />
                  ))}
                </>
              )}
            </>
          )}
          {text.trim() && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", color: C.dim, fontSize: 12 }}>
                נוסח החלוקה המלא
              </summary>
              {text}
            </details>
          )}
        </div>
        {session.handOfNight && (
          <div
            style={{
              marginTop: 8,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: C.cream,
              background: `${C.brass}12`,
              border: `1px solid ${C.brass}44`,
              borderRadius: 10,
              padding: "9px 12px",
            }}
          >
            🃏 <b>יד הערב:</b> {session.handOfNight}
          </div>
        )}
        {potnCandidates.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.brass, marginBottom: 6 }}>
              ⭐ שחקן הערב
              {potn.winner
                ? ` · מוביל: ${potn.winner.name} (${potn.winner.count} קולות)`
                : " · עדיין אין קולות"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {potnCandidates.map((name) => {
                const count = potn.counts[name] || 0;
                const mineVote = myVote === name;
                const style = {
                  fontSize: 12.5,
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: `1px solid ${mineVote ? C.brass : C.line}`,
                  background: mineVote ? `${C.brass}22` : C.feltDeep,
                  color: mineVote ? C.brass : C.cream,
                  fontFamily: "inherit",
                  cursor: canVote ? "pointer" : "default",
                  fontWeight: mineVote ? 700 : 500,
                };
                return canVote ? (
                  <button
                    key={name}
                    type="button"
                    disabled={voting}
                    onClick={() => vote(name)}
                    style={style}
                    aria-pressed={mineVote}
                  >
                    {name}
                    {count ? ` · ${count}` : ""}
                  </button>
                ) : (
                  <span key={name} style={style}>
                    {name}
                    {count ? ` · ${count}` : ""}
                  </span>
                );
              })}
            </div>
            {!canVote && !me && (
              <div style={{ fontSize: 11.5, color: C.dim, marginTop: 5 }}>
                התחבר כדי להצביע לשחקן הערב.
              </div>
            )}
            {myVote && (
              <div style={{ fontSize: 11.5, color: C.dim, marginTop: 5 }}>
                הצבעת ל־{myVote} — אפשר לשנות בלחיצה על שם אחר.
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </section>
  );
}

/**
 * חלוקות של ערבים קודמים — כרטיס מתקפל לכל ערב, סגור כברירת מחדל,
 * עם אותם סימוני «שולם». ערב חדש לא מעלים את החלוקה של הקודם.
 */
export function SettlementHistory({ db, excludeId = null, ...cardProps }) {
  const past = useMemo(
    () => pastSettlementSessions(db?.sessions, { excludeId }),
    [db?.sessions, excludeId]
  );
  if (!past.length) return null;
  return (
    <div data-testid="settlement-history" style={{ marginBottom: 12 }}>
      <div style={{ ...sectionEyebrow, color: C.dim, margin: "0 2px 8px" }}>חלוקות קודמות</div>
      {past.map((s) => (
        <LastSettlementCard
          key={s.id}
          db={db}
          sessionId={s.id}
          collapsible
          defaultOpen={false}
          {...cardProps}
        />
      ))}
    </div>
  );
}
