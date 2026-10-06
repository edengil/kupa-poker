"use client";

import React, { useState, useEffect, useMemo } from "react";
import { planLabel } from "../Rsvp";
import { C } from "../../lib/poker/colors";
import { festiveCard, festiveGlow, brassCta, sectionEyebrow } from "../../lib/poker/festive";
import { HOSTS, wazeShortUrl } from "../../lib/poker/hosts";
import { isPlanStale, planTodayIso } from "../../lib/planTiming";
import { computeNightHype } from "../../lib/poker/nightHype";
import { requestEmailInvites } from "../../lib/sendEmailInvites";
import { requestCalendarEvent } from "../../lib/requestCalendarEvent";
import { requestCalendarSync } from "../../lib/requestCalendarSync";
import { emailRsvpStatus, parseEmailImport, applyEmailImport } from "../../lib/poker/emailRsvp";
import { buildGoogleCalendarUrl } from "../../lib/poker/calendarInvite";
import { flushStore } from "../../lib/store";
import { waShare } from "../../lib/poker/helpers";
import { CheckCircle2, Copy, Share2 } from "./icons";

/* תכנון ערב + בחירת מארח. הכתובות עצמן ב-hosts.js. */

function splitPlanFields(plan) {
  if (!plan) return { location: "", note: "" };
  if (plan.location != null && plan.location !== "") {
    return { location: plan.location || "", note: plan.note || "" };
  }
  /* תוכניות ישנות: note שימש גם למיקום וגם להערות */
  if (plan.note && (HOSTS.some((h) => h.text === plan.note) || /^אצל\s/.test(plan.note))) {
    return { location: plan.note || "", note: "" };
  }
  return { location: "", note: plan.note || "" };
}

/* תכנון הערב הבא. נשמר בתוך ה-DB (db.plan) ולכן זורם לצופים דרך אותו
   snapshot — הם רואים את התאריך ועונים מגיע/לא בטבלת ה-RSVP. */
export function PlanCard({ db, commit, renderRsvps, onPlanShared }) {
  const todayIso = planTodayIso();
  // הזמנה פגה רק אחרי שהתאריך עבר (שעון ישראל) — לא בגלל ערב שמור באותו יום
  const planStale = isPlanStale(db.plan, todayIso);
  const plan = db.plan && !planStale ? db.plan : null;

  // מנקים הזמנה שפג תוקפה — שלא תישאר "מחכה" לימים שעברו
  useEffect(() => {
    if (planStale && db.plan) commit({ ...db, plan: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStale, db.plan?.iso]);

  // סנכרון תשובות מהיומן — פעם אחת בטעינה כשהסנכרון האחרון ישן מ-5 דקות
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    const eventId = plan?.calendarEventId;
    if (!eventId) return;
    const lastSync = plan?.calendarSyncedAt || 0;
    if (Date.now() - lastSync < 5 * 60 * 1000) return;
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        await requestCalendarSync();
        // השרת עדכן את ה-DB — רענון מקומי יגיע דרך ה-Realtime/poll הרגיל
      } catch {
        /* שקט — הסנכרון הבא ינסה שוב */
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.calendarEventId]);

  const [editing, setEditing] = useState(false);
  const hype = useMemo(() => (plan ? computeNightHype(db) : null), [db, plan]);
  const [iso, setIso] = useState("");
  const [time, setTime] = useState("20:00");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [sendStatus, setSendStatus] = useState(null); // null | sending | sent | error
  const [inviteNote, setInviteNote] = useState("");
  const [sendError, setSendError] = useState("");
  const [inviteFallbackText, setInviteFallbackText] = useState("");
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);

  /* ייבוא אימיילים מרשימת "שם: email" — שומר לפרופילים ושולח זימונים לחדשים.
     השרת מדלג על מי שכבר קיבל זימון לערב הזה, אז השליחה החוזרת בטוחה. */
  const doEmailImport = async () => {
    const { matched, unmatched, invalid } = parseEmailImport(db, importText);
    if (!matched.length && !unmatched.length && !invalid.length) return;
    setImporting(true);
    try {
      commit(applyEmailImport(db, matched));
      await flushStore();
      setImportText("");
      let sent = 0;
      let sendError = false;
      if (matched.length && plan?.iso) {
        try {
          const r = await requestEmailInvites(plan.iso);
          sent = (r.sent || []).length;
          if (sent) setInviteNote(`📧 נשלחו ${sent} זימונים באימייל לכתובות החדשות`);
        } catch {
          sendError = true;
        }
      }
      setImportResult({ saved: matched.length, unmatched, invalid, sent, sendError });
    } finally {
      setImporting(false);
    }
  };

  const startEdit = () => {
    const fields = splitPlanFields(plan);
    setIso(plan?.iso || todayIso);
    setTime(plan?.time || "20:00");
    setLocation(fields.location);
    setNote(fields.note);
    setEditing(true);
    setSendStatus(null);
    setSendError("");
    setInviteFallbackText("");
  };

  const announce = async (next, isUpdate) => {
    if (typeof onPlanShared !== "function") return;
    setSendStatus("sending");
    setSendError("");
    setInviteFallbackText("");
    setShared(false);
    try {
      await onPlanShared(next, { isUpdate });
      setSendStatus("sent");
    } catch (e) {
      setSendStatus("error");
      setSendError(e?.message || "השליחה לקבוצה נכשלה");
      setInviteFallbackText(typeof e?.inviteText === "string" ? e.inviteText : "");
    }
  };

  const copyInvite = async () => {
    if (!inviteFallbackText) return;
    try {
      await navigator.clipboard.writeText(inviteFallbackText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const shareInvite = async () => {
    if (!inviteFallbackText) return;
    const ok = await waShare(inviteFallbackText);
    if (ok) {
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    }
  };

  const save = async () => {
    if (!iso) return;
    const isUpdate = !!plan;
    const next = {
      iso,
      time,
      location: location.trim(),
      note: note.trim(),
      createdAt: Date.now(),
      // עריכת אותו ערב שומרת את הזימונים והאישורים שכבר הגיעו מהאימייל
      ...(isUpdate && plan.iso === iso
        ? { emailInvites: plan.emailInvites, emailRsvps: plan.emailRsvps }
        : {}),
    };
    commit({ ...db, plan: next });
    setEditing(false);
    // ההזמנה יוצאת לקבוצת הוואטסאפ עם הלינק — שהחברים יאשרו הגעה
    await announce(next, isUpdate);
    // זימון ביומן גוגל לכל מי שיש לו כתובת שמורה (אם היומן מחובר) —
    // אחרת נופל בחזרה לזימון אישי באימייל. כשלון כאן לא חוסם את פתיחת הערב.
    try {
      await flushStore();
      const cal = await requestCalendarEvent(next.iso);
      if (cal.configured && cal.eventId) {
        setInviteNote(`📅 נוצר אירוע ביומן ונשלח זימון ל־${cal.attendees || 0} שחקנים`);
      } else {
        const r = await requestEmailInvites(next.iso);
        const sentCount = (r.sent || []).length;
        const missingCount = (r.missingEmail || []).length;
        if (sentCount || missingCount) {
          setInviteNote(
            `📧 נשלחו ${sentCount} זימונים באימייל${missingCount ? ` · ל־${missingCount} שחקנים אין אימייל שמור` : ""}`
          );
        } else {
          setInviteNote("");
        }
      }
    } catch (e) {
      setInviteNote(`שליחת הזימונים נכשלה: ${e?.message || "נסו שוב"}`);
    }
  };
  const clear = () => {
    commit({ ...db, plan: null });
    setEditing(false);
    setSendStatus(null);
    setSendError("");
    setInviteFallbackText("");
  };
  const resend = () => {
    if (plan) announce(plan, true);
  };

  const field = {
    background: C.feltDeep,
    border: `1px solid ${C.line}`,
    borderRadius: 9,
    color: C.cream,
    fontFamily: "inherit",
    fontSize: 13.5,
    padding: "9px 10px",
    colorScheme: "dark",
  };

  const display = plan ? splitPlanFields(plan) : null;
  const wazeUrl = display?.location ? wazeShortUrl(display.location) : null;

  if (!plan && !editing) {
    return (
      <button
        onClick={startEdit}
        style={{
          width: "100%",
          padding: "14px 14px",
          borderRadius: 14,
          border: `1px dashed ${C.brass}77`,
          background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
          color: C.cream,
          fontFamily: "inherit",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: 12,
          textAlign: "right",
          lineHeight: 1.45,
        }}
      >
        <div style={{ ...sectionEyebrow, marginBottom: 4 }}>
          <span style={{ fontSize: 13 }}>♠</span>
          הערב הבא · הזמנה לקבוצה
        </div>
        <span style={{ color: C.dim }}>תכנן תאריך להיום או להמשך — שלח לוואטסאפ לאישורי הגעה</span>
      </button>
    );
  }

  return (
    <div
      style={{
        ...festiveCard,
        padding: "13px 13px 12px",
        marginBottom: 12,
      }}
    >
      <div aria-hidden style={festiveGlow} />
      <div style={{ position: "relative" }}>
        {editing ? (
          <>
            <div style={{ ...sectionEyebrow, marginBottom: 10 }}>
              <span style={{ fontSize: 13 }}>♠</span>
              תכנון הערב הבא
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="date" value={iso} min={todayIso}
                onChange={(e) => setIso(e.target.value)} style={{ ...field, flex: 1.4 }} />
              <input type="time" value={time}
                onChange={(e) => setTime(e.target.value)} style={{ ...field, flex: 1 }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 6 }}>
              מיקום
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {HOSTS.map((h) => (
                <button
                  key={h.label}
                  onClick={() => setLocation(h.text)}
                  style={{
                    padding: "5px 11px", borderRadius: 999,
                    border: `1px solid ${location === h.text ? C.brass : C.line}`,
                    background: location === h.text ? `${C.brass}22` : "transparent",
                    color: location === h.text ? C.brass : C.dim,
                    fontFamily: "inherit", fontSize: 12, cursor: "pointer",
                  }}
                >
                  📍 {h.label}
                </button>
              ))}
            </div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="כתובת / מיקום — לא חובה"
              style={{ ...field, width: "100%", boxSizing: "border-box", marginBottom: 10 }}
            />
            <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 6 }}>
              הערות
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="למשל: להביא חטיפים, חניה בחצר, לבוש חופשי…"
              rows={2}
              style={{
                ...field,
                width: "100%",
                boxSizing: "border-box",
                marginBottom: 10,
                resize: "vertical",
                lineHeight: 1.45,
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={save} style={{
                ...brassCta,
                flex: 1, padding: "10px 12px", borderRadius: 10,
                fontSize: 13.5,
              }}>
                שמור ושלח הזמנה
              </button>
              <button onClick={() => setEditing(false)} style={{
                padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.line}`,
                background: "transparent", color: C.dim, fontFamily: "inherit",
                fontSize: 13, cursor: "pointer",
              }}>
                ביטול
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: (display.location || display.note) ? 2 : 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...sectionEyebrow, marginBottom: 3 }}>
                  <span style={{ fontSize: 13 }}>♠</span>
                  הערב הבא
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.cream }}>{planLabel(plan)}</div>
              </div>
              <button onClick={startEdit} style={{
                padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.line}`,
                background: "transparent", color: C.cream, fontFamily: "inherit",
                fontSize: 12, cursor: "pointer",
              }}>
                עריכה
              </button>
              <button onClick={clear} style={{
                padding: "6px 12px", borderRadius: 8, border: "none",
                background: "transparent", color: C.dim, fontFamily: "inherit",
                fontSize: 12, cursor: "pointer",
              }}>
                בטל
              </button>
            </div>
            {display.location && (
              <div style={{ fontSize: 12.5, color: C.cream, marginBottom: display.note ? 4 : 8, opacity: 0.92, lineHeight: 1.45 }}>
                <div>📍 {display.location}</div>
                {wazeUrl && (
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      marginTop: 6,
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: `1px solid ${C.brass}66`,
                      background: `${C.brass}18`,
                      color: C.brass,
                      fontWeight: 700,
                      fontSize: 12.5,
                      textDecoration: "none",
                    }}
                  >
                    ניווט בווייז
                  </a>
                )}
              </div>
            )}
            {display.note && (
              <div style={{
                fontSize: 12.5,
                color: C.brass,
                marginBottom: 8,
                background: `${C.brass}14`,
                border: `1px solid ${C.brass}33`,
                borderRadius: 8,
                padding: "7px 10px",
                lineHeight: 1.4,
              }}>
                <span style={{ fontWeight: 700 }}>הערות · </span>
                {display.note}
              </div>
            )}
            {hype?.text && (
              <div style={{
                fontSize: 12.5,
                color: C.cream,
                marginBottom: 8,
                background: `${C.win}12`,
                border: `1px solid ${C.win}33`,
                borderRadius: 8,
                padding: "7px 10px",
                lineHeight: 1.5,
              }}>
                🔥 {hype.text}
              </div>
            )}
            {sendStatus === "sending" && (
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>שולח הזמנה לקבוצה…</div>
            )}
            {sendStatus === "sent" && (
              <div style={{ fontSize: 12, color: C.win, marginBottom: 8, fontWeight: 600 }}>
                נשלח לקבוצת הוואטסאפ
              </div>
            )}
            {sendStatus === "error" && (
              <div
                style={{
                  fontSize: 12,
                  color: C.loss,
                  marginBottom: 8,
                  background: `${C.loss}14`,
                  border: `1px solid ${C.loss}44`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  lineHeight: 1.4,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>ההזמנה נשמרה, אבל לא נשלחה לקבוצה</div>
                <div style={{ color: C.dim, marginBottom: 8 }}>{sendError}</div>
                {inviteFallbackText && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={shareInvite}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#25D366",
                        color: "#06301B",
                        fontFamily: "inherit",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      {shared ? (
                        <>
                          <CheckCircle2 size={16} />
                          מוכן — שלח לקבוצה בוואטסאפ
                        </>
                      ) : (
                        <>
                          <Share2 size={16} />
                          שתף הזמנה מהמכשיר
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={copyInvite}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: `1px solid ${C.line}`,
                        background: "transparent",
                        color: copied ? C.win : C.cream,
                        fontFamily: "inherit",
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      {copied ? (
                        <>
                          <CheckCircle2 size={15} />
                          הועתק — הדבק בקבוצה
                        </>
                      ) : (
                        <>
                          <Copy size={15} />
                          העתק טקסט הזמנה
                        </>
                      )}
                    </button>
                  </div>
                )}
                <button
                  onClick={resend}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.brass}`,
                    background: C.brass,
                    color: C.feltDeep,
                    fontFamily: "inherit",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  שלח שוב דרך הבוט
                </button>
              </div>
            )}
            {typeof onPlanShared === "function" && sendStatus !== "sending" && sendStatus !== "error" && (
              <button
                onClick={resend}
                style={{
                  width: "100%",
                  marginBottom: 8,
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  background: C.feltDeep,
                  color: C.cream,
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {sendStatus === "sent" ? "שלח שוב לקבוצת הוואטסאפ" : "שלח הזמנה לקבוצת הוואטסאפ"}
              </button>
            )}
            {typeof renderRsvps === "function" && renderRsvps(plan.iso)}
            {inviteNote && (
              <p role="status" style={{ fontSize: 12, color: C.dim, margin: "10px 2px 0", lineHeight: 1.5 }}>
                {inviteNote}
              </p>
            )}
            {(() => {
              const rows = emailRsvpStatus(db);
              const invited = rows.filter((r) => r.invited || r.answer);
              const missing = rows.filter((r) => !r.email && !r.invited && !r.answer);
              if (!invited.length && !missing.length) return null;
              const chip = (r) => ({
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 9px",
                borderRadius: 999,
                fontSize: 11.5,
                border: `1px solid ${r.answer === "yes" ? C.brass : C.line}`,
                color: r.answer === "yes" ? C.brass : r.answer === "no" ? C.loss : C.dim,
                background: C.feltDeep,
              });
              return (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, marginBottom: 6 }}>
                    📧 זימוני אימייל
                  </div>
                  {invited.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {invited.map((r) => (
                        <span key={r.name} style={chip(r)}>
                          {r.name}
                          {r.answer === "yes" ? " · מגיע ✅" : r.answer === "no" ? " · לא מגיע" : " · נשלח"}
                        </span>
                      ))}
                    </div>
                  )}
                  {missing.length > 0 && (
                    <p style={{ fontSize: 12, color: C.dim, margin: "6px 0 0", lineHeight: 1.5 }}>
                      בלי אימייל שמור: {missing.map((r) => r.name).join(", ")} — אפשר להוסיף בפרופיל השחקן
                    </p>
                  )}
                  {missing.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => { setImportOpen(!importOpen); setImportResult(null); }}
                        style={{ background: "none", border: `1px solid ${C.line}`, color: C.brass, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {importOpen ? "סגור ייבוא ▴" : "📥 ייבוא אימיילים ▾"}
                      </button>
                      {importOpen && (
                        <div style={{ marginTop: 8 }}>
                          <textarea
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            placeholder={"אופיר סנה: ofir@example.com\nאיציק תפילין: itzik@example.com"}
                            rows={4}
                            style={{ width: "100%", boxSizing: "border-box", background: C.feltDeep, color: C.cream, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}
                          />
                          <button
                            type="button"
                            onClick={doEmailImport}
                            disabled={importing || !importText.trim()}
                            style={{ marginTop: 6, background: C.brass, color: C.feltDeep, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: importing || !importText.trim() ? 0.6 : 1 }}
                          >
                            {importing ? "שומר…" : "שמור אימיילים"}
                          </button>
                          {importResult && (
                            <p style={{ fontSize: 12, color: C.dim, margin: "6px 0 0", lineHeight: 1.6 }}>
                              נשמרו {importResult.saved} אימיילים
                              {importResult.sent ? ` · נשלחו ${importResult.sent} זימונים` : ""}
                              {importResult.sendError ? " · השליחה נכשלה — נסו לשמור את הערב שוב" : ""}
                              {importResult.unmatched.length > 0 && <> · לא זוהו: {importResult.unmatched.join(", ")}</>}
                              {importResult.invalid.length > 0 && <> · כתובות לא תקינות: {importResult.invalid.join(", ")}</>}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {(() => {
                    const withEmail = rows.filter((r) => r.email);
                    const calUrl = buildGoogleCalendarUrl(plan, withEmail.map((r) => r.email));
                    if (!calUrl) return null;
                    return (
                      <div style={{ marginTop: 8 }}>
                        <a
                          href="/api/calendar/auth"
                          style={{ display: "inline-block", background: C.brass, color: C.feltDeep, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none", fontFamily: "inherit", marginBottom: 6 }}
                        >
                          🔗 חבר יומן גוגל
                        </a>
                        <p style={{ fontSize: 11, color: C.dim, margin: "0 0 8px", lineHeight: 1.5 }}>
                          חיבור חד-פעמי — אחריו כל ערב ייצור אוטומטית אירוע ביומן עם זימונים
                        </p>
                        <a
                          href={calUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: "inline-block", background: "none", border: `1px solid ${C.line}`, color: C.brass, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, textDecoration: "none", fontFamily: "inherit" }}
                        >
                          📅 זימון ביומן גוגל
                        </a>
                        <p style={{ fontSize: 11, color: C.dim, margin: "4px 0 0", lineHeight: 1.5 }}>
                          פותח אירוע ביומן עם {withEmail.length} השחקנים כאורחים — גוגל תשלח להם זימון כשתשמרו את האירוע
                        </p>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
