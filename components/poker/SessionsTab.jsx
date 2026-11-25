"use client";

import React, { useState } from "react";
import { C } from "@/lib/poker/colors";
import { fmt, fmtGap } from "@/lib/poker/format";
import { AL, canon, r2 } from "@/lib/poker/helpers";
import { Empty, IconBtn, StatusChip } from "./ui";
import { ChevronDown, Pencil, Share2, Trash2 } from "./icons";
import { ShareSheet } from "./ShareSheet";
import { nightSummaryText, settlementTextForSession, potRecordedFor, potActualFor, nightGap } from "@/lib/nightShare";
import { resolveBrowserInviteUrl, withSettlementLink } from "@/lib/settlementInvite";
import { SavedSettlementEditor } from "./SavedSettlementEditor";
import { SessionEditSheet } from "./SessionEditSheet";
import {
  confirmationStatusText,
  confirmationsStartOpen,
  latestNightConfirmations,
  latestNightAdminConfirmations,
  potConfirmationStatusText,
} from "@/lib/nightConfirmations";
import { markTransfer, markReceipt, markPotPaid } from "@/lib/paymentTracking";
import { withActual, withRecordedPot, potEditBlockReason } from "@/lib/poker/potEdits";
import { withSettlementApproval } from "@/lib/settlementApproval";
import { flushStore } from "@/lib/store";
import { allTransfersPaid } from "@/lib/settlementClosed";
import { announceSettlementClosed } from "@/lib/announceSettlementClosed";
import { notifyPaymentConfirmed } from "@/lib/poker/notifyTransfersClient";

/* טאב ערבים שמורים — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function SessionsTab({ db, commit, isAdmin, viewerName = null, readOnly = false }) {
  const [share, setShare] = useState(null);
  const [settlementId, setSettlementId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [potEdit, setPotEdit] = useState(null);
  const [potEditValue, setPotEditValue] = useState("");
  const A = AL(db);
  const latestView = latestNightConfirmations(db.sessions);
  /* תצוגת מנהל למקטע האישורים: שורת הקופה מצטרפת לשורות ולמונה.
     לא־מנהל נשאר עם התצוגה המשותפת בדיוק כמו היום — בלי שורת קופה. */
  const adminView = isAdmin ? latestNightAdminConfirmations(db.sessions) : null;
  const view = adminView || latestView;
  const [confirmOpen, setConfirmOpen] = useState(() => confirmationsStartOpen(view));
  const latestId = latestView?.session?.id ?? null;
  const latestSession = view?.session ?? null;

  if (!db.sessions.length) {
    return <Empty text="עדיין אין ערבים. עבור להזנה או ללייב." />;
  }

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const drop = String(pendingDelete.id);
    commit({
      ...db,
      sessions: db.sessions.filter((s) => s.id !== pendingDelete.id),
      deletedSessionIds: [...new Set([...(db.deletedSessionIds || []), drop])],
    });
    setPendingDelete(null);
  };

  /* אישורי כלל 3: קביעה/ביטול של אישור הצפייה או אישור הסכומים לערב. */
  const toggleApproval = (s, field) => {
    if (!isAdmin || !commit) return;
    commit({
      ...db,
      sessions: db.sessions.map((x) =>
        x.id === s.id ? withSettlementApproval(x, field, !x[field]) : x
      ),
    });
    void flushStore();
  };

  const openShare = (s) => {
    setShare({
      session: s,
      text: withSettlementLink(nightSummaryText(s, A), resolveBrowserInviteUrl(null, s.id)),
      /* כלל 3: טקסט החלוקה לוואטסאפ רק אחרי אישור צפייה של המנהל. */
      settlement: s.settlementApprovedAt ? settlementTextForSession(s, { manager: true }) || undefined : undefined,
    });
  };

  const byDate = [...db.sessions].sort((a, b) => b.iso.localeCompare(a.iso));
  const list = latestId
    ? [latestView.session, ...byDate.filter((s) => s.id !== latestId)]
    : byDate;

  /* סימוני האישורים מהכרטיס — מנהל בלבד, באותו חיווט כמו כרטיס החלוקה:
     פונקציות הסימון הקיימות + commit + flushStore, ואירועי האישור נרשמים
     על שם המסמן. ביטול סימון תמיד זמין (החלטת עדן 4): «שולם» מתבטל
     מהצ'קבוקס, ו«התקבל» מכפתור הביטול הייעודי — כמו בכרטיס החלוקה. */
  const applySession = (next) => {
    commit({
      ...db,
      sessions: db.sessions.map((s) => (s.id === next.id ? next : s)),
    });
  };

  const mark = async (index, value) => {
    if (!isAdmin || !latestSession || busy != null) return;
    setBusy(index);
    try {
      const next = markTransfer(latestSession, index, value, viewerName);
      applySession(next);
      const persisted = Boolean(await flushStore());
      if (value && persisted && allTransfersPaid(next)) {
        await announceSettlementClosed(latestSession.id);
      }
      if (value && persisted) {
        const t = view.rows[index];
        void notifyPaymentConfirmed(latestSession.id, {
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

  const unmarkReceived = async (index) => {
    if (!isAdmin || !latestSession || busy != null) return;
    setBusy(index);
    try {
      const next = markReceipt(latestSession, index, false, viewerName);
      if (next !== latestSession) {
        applySession(next);
        await flushStore();
      }
    } finally {
      setBusy(null);
    }
  };

  const markPot = async (value) => {
    if (!isAdmin || !latestSession || busy != null) return;
    setBusy("pot");
    try {
      const next = markPotPaid(latestSession, value, viewerName);
      if (next !== latestSession) {
        applySession(next);
        await flushStore();
      }
    } finally {
      setBusy(null);
    }
  };

  /* עריכת סכום הקופה מהכרטיס (החלטת עדן 1): «בפועל» דרך withActual
     (המסלול הראשי — סכומי השחקנים מוגנים בהקפאה) ו«רשום» באותו מנגנון
     של כרטיס החלוקה. בדיקת השטיפה כמו בדשבורד הקופה: כשל = הודעה
     והעורך נשאר פתוח. */
  const savePotAmount = async () => {
    if (!latestSession || !potEdit) return;
    /* B4: עריכת קופה במצב צפייה־בלבד נחסמת עם הודעה מפורשת (23.11). */
    const blocked = potEditBlockReason({ readOnly });
    if (blocked) {
      alert(blocked);
      return;
    }
    const v = Number(potEditValue);
    if (!Number.isFinite(v) || v < 0) {
      alert("סכום לא תקין");
      return;
    }
    commit({
      ...db,
      sessions: db.sessions.map((s) => {
        if (s.id !== latestSession.id) return s;
        /* Pot Boost: "רשום" רק דרך withRecordedPot (הקפאה־מודע). */
        return potEdit === "actual"
          ? withActual(s, v)
          : withRecordedPot(s, v);
      }),
    });
    if ((await flushStore().catch(() => false)) === false) {
      alert("הערך נשמר במכשיר אבל לא הגיע לענן (בעיית רשת או התנגשות). העורך נשאר פתוח — נסה שוב בעוד רגע.");
      return;
    }
    setPotEdit(null);
    setPotEditValue("");
  };

  const openPotEdit = (field) => {
    if (!latestSession) return;
    setPotEditValue(
      String(field === "actual" ? potActualFor(latestSession) : potRecordedFor(latestSession))
    );
    setPotEdit(field);
  };

  return (
    <div
      style={{
        marginTop: 4,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {list.map((s) => {
        /* פער הערב הקנוני (כלל 11.11 — nightGap, יציאות + טיפים מול
           המונפקים). לא balance().gap הגולמי: הוא תויג כאן בעבר בטעות
           «קופת חיסכון», אבל הקופה היא ה־5% מהקניות (potRecordedFor) —
           מושג אחר, עם שורת הקופה הייעודית שלו. לערב סכום־בלבד הפער
           הקנוני זהה לסכום הנטו, כמו תמיד. */
        const gap = nightGap(s);
        const winners = (s.entries || []).filter((e) => e.amount > 0);
        const even = (s.entries || []).filter((e) => e.amount === 0);
        const debtors = (s.entries || []).filter((e) => e.amount < 0);
        const ordered = [...winners, ...even, ...debtors];
        return (
          <div
            key={s.id}
            style={{
              background: C.card,
              border: `1px solid ${gap === 0 ? C.line : `${C.brass}88`}`,
              borderRadius: 12,
              padding: 13,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <b style={{ fontSize: 15 }}>
                {s.d}.{s.mo}.{s.y}
              </b>
              <div style={{ display: "flex", gap: 6 }}>
                {/* שער כלל 3 (25.11.2026): אישורי המנהל לערב הזה — צפייה
                    בחלוקה, ובנפרד הצגת סכומים. מנהל בלבד. */}
                {isAdmin && commit && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleApproval(s, "settlementApprovedAt")}
                      data-testid={`session-approve-view-${s.id}`}
                      aria-pressed={!!s.settlementApprovedAt}
                      style={{
                        background: s.settlementApprovedAt ? C.win : C.feltDeep,
                        color: s.settlementApprovedAt ? C.feltDeep : C.brass,
                        border: `1px solid ${C.line}`,
                        borderRadius: 8,
                        padding: "6px 8px",
                        fontSize: 12,
                        fontFamily: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {s.settlementApprovedAt ? "✓ צפייה אושרה" : "אשר צפייה בחלוקה"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleApproval(s, "settlementAmountsApprovedAt")}
                      data-testid={`session-approve-amounts-${s.id}`}
                      aria-pressed={!!s.settlementAmountsApprovedAt}
                      disabled={!s.settlementApprovedAt}
                      style={{
                        background: s.settlementAmountsApprovedAt ? C.win : C.feltDeep,
                        color: s.settlementAmountsApprovedAt ? C.feltDeep : C.brass,
                        border: `1px solid ${C.line}`,
                        borderRadius: 8,
                        padding: "6px 8px",
                        fontSize: 12,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        opacity: s.settlementApprovedAt ? 1 : 0.5,
                      }}
                    >
                      {s.settlementAmountsApprovedAt ? "✓ סכומים גלויים" : "אשר הצגת סכומים"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSettlementId(s.id)}
                  data-testid={`session-settlement-${s.id}`}
                  style={{
                    background: C.feltDeep,
                    color: C.brass,
                    border: `1px solid ${C.line}`,
                    borderRadius: 8,
                    padding: "6px 8px",
                    fontSize: 12,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  חלוקה ותשלומים
                </button>
                <IconBtn onClick={() => openShare(s)} aria-label={`שיתוף ערב ${s.d}.${s.mo}.${s.y}`}>
                  <Share2 size={15} />
                </IconBtn>
                <IconBtn
                  onClick={() => setEditing(s)}
                  data-testid={`session-edit-${s.id}`}
                  aria-label={`עריכת ערב ${s.d}.${s.mo}.${s.y}`}
                >
                  <Pencil size={15} />
                </IconBtn>
                <IconBtn
                  onClick={() => setPendingDelete({ id: s.id, label: `${s.d}.${s.mo}.${s.y}` })}
                  danger
                  aria-label={`מחיקת ערב ${s.d}.${s.mo}.${s.y}`}
                  data-testid={`session-delete-${s.id}`}
                >
                  <Trash2 size={15} />
                </IconBtn>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ordered.map((e, i) => {
                const zero = e.amount === 0;
                return (
                  <span
                    key={i}
                    style={{
                      fontSize: 12.5,
                      padding: "3px 9px",
                      borderRadius: 20,
                      background: C.feltDeep,
                      color: zero ? C.dim : e.amount > 0 ? C.win : C.loss,
                      border: zero ? `1px dashed ${C.line}` : "1px solid transparent",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {canon(e.name, A)}{" "}
                    {zero ? "באפס" : <b style={{ fontWeight: 800 }}>{fmt(e.amount)}</b>}
                  </span>
                );
              })}
            </div>
            <div
              style={{
                marginTop: 9,
                fontSize: 12.5,
                color: gap === 0 ? C.dim : gap < 0 ? C.dim : C.brass,
              }}
            >
              {gap === 0 || (gap < 0 && !isAdmin)
                ? "✓ מאוזן"
                : `⚠ פער ${fmtGap(gap)}`}
              {even.length > 0 ? ` · ${even.length} סגרו באפס` : ""}
            </div>
            {s.id === latestId && view && (
              <div
                data-testid="latest-night-confirmations"
                style={{
                  marginTop: 12,
                  background: C.feltDeep,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  data-testid="night-confirm-toggle"
                  aria-expanded={confirmOpen}
                  aria-label={`אישורי העברה בערב ${s.d}.${s.mo}.${s.y}`}
                  onClick={() => setConfirmOpen((open) => !open)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    border: "none",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    textAlign: "right",
                  }}
                >
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: C.brass }}>
                      אישורי העברה · ערב אחרון · {s.d}.{s.mo}.{s.y}
                    </span>
                    <span style={{ display: "block", marginTop: 3, fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
                      {view.rows.length === 0
                        ? "אין העברות — כולם סגורים."
                        : `נסגרו ${view.closedCount} מתוך ${view.rows.length}`}
                    </span>
                  </span>
                  <ChevronDown
                    size={18}
                    color={C.dim}
                    style={{ transform: confirmOpen ? "rotate(180deg)" : "none" }}
                  />
                </button>
                {confirmOpen &&
                  view.rows.map((row) =>
                    row.pot ? (
                      <div
                        key="pot"
                        data-testid="night-confirm-pot-row"
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          padding: "8px 12px",
                          borderTop: `1px dashed ${C.brass}55`,
                          background: `${C.brass}14`,
                          fontSize: 13.5,
                        }}
                      >
                        <input
                          type="checkbox"
                          data-testid="night-confirm-pot-toggle"
                          checked={row.closed}
                          disabled={busy != null}
                          onChange={(e) => markPot(e.target.checked)}
                          aria-label={`הפקדה לקופת חיסכון, ${row.amount} שקלים`}
                          style={{ width: 20, height: 20, accentColor: C.win }}
                        />
                        <span style={{ flex: 1 }}>
                          {row.from} אל <b>קופת חיסכון</b>
                          <span style={{ color: C.brass, fontSize: 11, marginInlineStart: 6 }}>
                            (רשום: {potRecordedFor(s)}₪
                            {potActualFor(s) !== potRecordedFor(s) ? ` · בפועל ${potActualFor(s)}₪` : ""})
                          </span>
                          {!potEdit && (
                            <>
                              <button
                                type="button"
                                data-testid="night-confirm-pot-edit-actual"
                                onClick={() => openPotEdit("actual")}
                                style={{
                                  marginInlineStart: 4,
                                  fontSize: 10,
                                  padding: "2px 6px",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  border: `1px solid ${C.line}`,
                                  background: "transparent",
                                  color: C.dim,
                                  fontFamily: "inherit",
                                }}
                              >
                                ערוך בפועל
                              </button>
                              <button
                                type="button"
                                data-testid="night-confirm-pot-edit-recorded"
                                onClick={() => openPotEdit("recorded")}
                                style={{
                                  marginInlineStart: 4,
                                  fontSize: 10,
                                  padding: "2px 6px",
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  border: `1px solid ${C.line}`,
                                  background: "transparent",
                                  color: C.dim,
                                  fontFamily: "inherit",
                                }}
                              >
                                ערוך רשום
                              </button>
                            </>
                          )}
                          {potEdit && (
                            <span style={{ display: "inline-flex", gap: 4, alignItems: "center", marginInlineStart: 6 }}>
                              <input
                                type="number"
                                data-testid="night-confirm-pot-edit-input"
                                value={potEditValue}
                                onChange={(e) => setPotEditValue(e.target.value)}
                                aria-label={potEdit === "actual" ? "סכום קופת חיסכון בפועל" : "סכום קופת חיסכון רשום"}
                                style={{
                                  width: 70,
                                  padding: "0px 6px",
                                  borderRadius: 6,
                                  border: `1px solid ${C.line}`,
                                  background: C.felt,
                                  color: C.cream,
                                  fontSize: 16,
                                }}
                              />
                              <button
                                type="button"
                                data-testid="night-confirm-pot-edit-save"
                                onClick={savePotAmount}
                                style={{
                                  fontSize: 11,
                                  padding: "6px 10px",
                                  minHeight: 26,
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  border: "none",
                                  background: C.brass,
                                  color: C.feltDeep,
                                  fontWeight: 700,
                                  fontFamily: "inherit",
                                }}
                              >
                                שמור
                              </button>
                              <button
                                type="button"
                                onClick={() => setPotEdit(null)}
                                style={{
                                  fontSize: 11,
                                  padding: "6px 10px",
                                  minHeight: 26,
                                  borderRadius: 6,
                                  cursor: "pointer",
                                  border: `1px solid ${C.line}`,
                                  background: "transparent",
                                  color: C.dim,
                                  fontFamily: "inherit",
                                }}
                              >
                                ביטול
                              </button>
                            </span>
                          )}
                        </span>
                        <b>{row.amount}₪</b>
                        <StatusChip closed={row.closed} testId="night-confirm-pot-state">
                          {potConfirmationStatusText(row)}
                        </StatusChip>
                      </div>
                    ) : (
                      <div
                        key={row.index}
                        data-testid={`night-confirm-row-${row.index}`}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          padding: "8px 12px",
                          borderTop: `1px solid ${C.line}`,
                          fontSize: 13.5,
                        }}
                      >
                        {isAdmin && (
                          <input
                            type="checkbox"
                            data-testid={`night-confirm-toggle-${row.index}`}
                            checked={row.closed}
                            disabled={busy === row.index || (row.closed && !row.confirmed)}
                            onChange={(e) => mark(row.index, e.target.checked)}
                            aria-label={`${confirmationStatusText(row)}: ${row.from} אל ${row.to}, ${row.amount} שקלים`}
                            style={{ width: 20, height: 20, accentColor: C.win }}
                          />
                        )}
                        <span style={{ flex: 1 }}>
                          {row.from} אל {row.to}
                        </span>
                        <b>{row.amount}₪</b>
                        <StatusChip closed={row.closed} testId={`night-confirm-state-${row.index}`}>
                          {confirmationStatusText(row)}
                        </StatusChip>
                        {isAdmin && row.received && (
                          <button
                            type="button"
                            data-testid={`night-confirm-unmark-received-${row.index}`}
                            disabled={busy === row.index}
                            aria-label={`בטל סימון התקבל: ${row.from} אל ${row.to}, ${row.amount} שקלים`}
                            onClick={() => unmarkReceived(row.index)}
                            style={{
                              fontSize: 11,
                              padding: "3px 8px",
                              borderRadius: 6,
                              cursor: "pointer",
                              border: `1px solid ${C.line}`,
                              background: "transparent",
                              color: C.dim,
                              fontFamily: "inherit",
                              whiteSpace: "nowrap",
                            }}
                          >
                            בטל «התקבל»
                          </button>
                        )}
                      </div>
                    )
                  )}
                {confirmOpen && (
                  <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.line}` }}>
                    <button
                      type="button"
                      data-testid="night-confirm-edit-settlement"
                      onClick={() => setSettlementId(s.id)}
                      style={{
                        background: C.feltDeep,
                        color: C.brass,
                        border: `1px solid ${C.line}`,
                        borderRadius: 8,
                        padding: "6px 8px",
                        fontSize: 12,
                        fontFamily: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      ערוך חלוקה
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {settlementId && (
        <SavedSettlementEditor
          db={db}
          commit={commit}
          sessionId={settlementId}
          onClose={() => setSettlementId(null)}
        />
      )}
      {editing && (
        <SessionEditSheet
          db={db}
          session={editing}
          commit={commit}
          onClose={() => setEditing(null)}
        />
      )}
      {share && (
        <ShareSheet
          title={`סיכום פוקר ${share.session.d}.${share.session.mo}`}
          text={share.text}
          settlement={share.settlement}
          session={share.session}
          onClose={() => setShare(null)}
        />
      )}
      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-session-title"
          data-testid="delete-session-confirm"
          onClick={() => setPendingDelete(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 340,
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: 14,
              padding: 18,
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            }}
          >
            <div id="delete-session-title" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>
              למחוק את הערב?
            </div>
            <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.45, marginBottom: 16 }}>
              ערב {pendingDelete.label} יימחק לצמיתות, כולל כל הרישום והחלוקה שלו. אי אפשר לבטל.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "stretch" }}>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                data-testid="delete-session-cancel"
                style={{
                  flex: 1,
                  background: C.feltDeep,
                  color: C.text || C.cream,
                  border: `1px solid ${C.line}`,
                  borderRadius: 10,
                  padding: "11px 12px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                data-testid="delete-session-confirm-btn"
                style={{
                  flex: 1,
                  background: C.loss,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 12px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                כן, למחוק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
