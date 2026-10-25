"use client";

import React, { useMemo, useState } from "react";
import { C } from "../../lib/poker/colors";
import { r2 } from "../../lib/poker/helpers";
import { fmtGap } from "../../lib/poker/format";
import { potOverview } from "../../lib/paymentTracking";
import {
  autoShortfallMapForPot,
  potRecordedFor,
  sessionHasBuyinChips,
  sessionHasPot,
  settlementPlayersFor,
} from "../../lib/nightShare";
import { settlementBasis } from "../../lib/savedSettlement";
import { flushStore } from "../../lib/store";

/**
 * דשבורד קופת חיסכון — אדמין בלבד (מודל 25.10).
 * לכל ערב שני מספרים נפרדים: "רשום" — ה־5% הרשמי (session.savingsPot),
 * שנשמר תמיד במלואו וניתן לעריכה; ו"בפועל" — כמה מזומן באמת נשמר
 * (session.savingsPotActual, ברירת מחדל = הרשום, ניתן לעריכה).
 * היתרה הראשית היא ה"בפועל". פער הערב (חוסר/עודף במאזן) מוצג כשורה
 * נפרדת ולעולם לא מתקזז מול הקופה.
 */
/* עריכת "בפועל" של ערב אחד — ראו את התיעוד המלא מעל savePotActual.
   חולץ לרמת המודול כדי שבדיקות יוכלו לשמור על מסלול מחיקת
   ה־manualSettlement הקפוא (A(b)). */
export function withActual(s, v) {
  const next = { ...s, savingsPotActual: v > 0 ? r2(v) : undefined };
  const ms = s.manualSettlement;
  const nowIso = new Date().toISOString();
  if (ms?.frozenActual != null) {
    if (v <= 0) {
      const { manualSettlement, ...rest } = next;
      return rest;
    }
    return { ...next, manualSettlement: { ...ms, frozenActual: r2(v) } };
  }
  if (!ms && v > 0 && sessionHasPot(next)) {
    const map = autoShortfallMapForPot(next, potRecordedFor(next));
    if (Object.keys(map).length) {
      const players = settlementPlayersFor(next);
      const cps = sessionHasBuyinChips(next) ? next.cps || 2 : 1;
      return {
        ...next,
        manualSettlement: {
          basis: settlementBasis(players, cps),
          manualPayments: [],
          preferCreditors: [],
          shortfall: map,
          frozenActual: r2(v),
          settlementVersion: 2,
          settlementUpdatedAt: nowIso,
        },
      };
    }
  }
  return next;
}

export function PotDashboard({ db, commit, isAdmin }) {
  const [editingId, setEditingId] = useState(null);
  const [potValue, setPotValue] = useState("");
  const [editingActualId, setEditingActualId] = useState(null);
  const [actualValue, setActualValue] = useState("");

  const overview = useMemo(() => potOverview(db), [db]);
  if (!isAdmin) return null;

  const savePot = (sessionId) => {
    const v = Number(potValue);
    if (!Number.isFinite(v) || v < 0) {
      alert("סכום לא תקין");
      return;
    }
    if (!commit) return;
    /* B5 (עדן, 18.10): העריכה מעדכנת גם את היתרה המצטברת של הקבוצה בהפרש —
       אחרת התיעוד של הערב והיתרה האמיתית מתפצלים. */
    const old = Number(db.sessions.find((s) => s.id === sessionId)?.savingsPot) || 0;
    const newTotal = r2((Number(db.savingsPot) || 0) + r2(v - old));
    commit({
      ...db,
      sessions: db.sessions.map((s) =>
        s.id === sessionId ? { ...s, savingsPot: v > 0 ? r2(v) : undefined } : s
      ),
      savingsPot: newTotal > 0 ? newTotal : undefined,
    });
    void flushStore().catch(() => {});
    setEditingId(null);
    setPotValue("");
  };

  /* עריכת "בפועל" — נוגעת רק בשדה של הערב, לא ביתרה הרשומה המצטברת.
     היא משנה את סכום ההעברה לקופה בתוכנית (R3) — ורק אותו: סכומי השחקנים
     נשארים כפי שהיו תחת הרשום (כמו ב־24.10, שם המפה נכתבה מול 93 והבפועל
     70 שינה רק את שורת הקופה; ההפרש הוא עודף פנימי). צופה מחשב עם הרשום
     בלבד (הבפועל פרטי למנהל), ולכן לערב בלי חלוקה שמורה "מקפיאים" את
     חלוקת החוסר האוטומטית של הרשום כמפה ידנית (frozenActual) — כך מנהל
     וצופה מקבלים אותם סכומי שחקנים בדיוק. מפה שעדן ערך בעצמו לא נוגעים
     בה; מחיקת הבפועל משחררת מפה קפואה וחוזרת לחישוב האוטומטי. */
  const savePotActual = (sessionId) => {
    const v = Number(actualValue);
    if (!Number.isFinite(v) || v < 0) {
      alert("סכום לא תקין");
      return;
    }
    if (!commit) return;
    commit({
      ...db,
      sessions: db.sessions.map((s) => (s.id === sessionId ? withActual(s, v) : s)),
    });
    void flushStore().catch(() => {});
    setEditingActualId(null);
    setActualValue("");
  };

  const stat = (label, value, sub, accent = false) => (
    <div
      style={{
        background: C.feltDeep,
        border: `1px solid ${accent ? `${C.brass}66` : C.line}`,
        borderRadius: 10,
        padding: "10px 12px",
        flex: "1 1 0",
        minWidth: 100,
      }}
    >
      <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent ? C.brass : C.cream, fontVariantNumeric: "tabular-nums" }}>
        {value}₪
      </div>
      {sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const editBtnStyle = {
    background: "transparent",
    color: C.brass,
    border: `1px solid ${C.line}`,
    borderRadius: 8,
    padding: "2px 8px",
    fontSize: 11.5,
    cursor: "pointer",
    fontFamily: "inherit",
    marginRight: 4,
  };
  const inputStyle = {
    width: 80,
    background: C.feltDeep,
    color: C.cream,
    border: `1px solid ${C.brass}`,
    borderRadius: 8,
    padding: "4px 8px",
    fontFamily: "inherit",
    fontSize: 13,
  };
  const saveBtnStyle = {
    background: C.brass,
    color: C.feltDeep,
    border: "none",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
  const cancelBtnStyle = {
    background: "transparent",
    color: C.dim,
    border: `1px solid ${C.line}`,
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const amountEditor = ({ value, onChange, onSave, onCancel }) => (
    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        type="number"
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        style={inputStyle}
      />
      <button type="button" onClick={onSave} style={saveBtnStyle}>
        שמור
      </button>
      <button type="button" onClick={onCancel} style={cancelBtnStyle}>
        ביטול
      </button>
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.brass }}>
        💰 קופת חיסכון — דשבורד מנהל
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {stat("יתרה בפועל", overview.balance, "המזומן שבקופה — היתרה הראשית", true)}
        {stat("יתרה רשומה", overview.balanceRecorded, "לפי ה־5% הרשמי")}
        {stat("נמשך", overview.withdrawn)}
      </div>

      <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6 }}>
        הקופה היא ה־5% מהקניות של כל ערב (הסכום ה&quot;רשום&quot;) — היא נשמרת תמיד
        במלואה. &quot;בפועל&quot; הוא כמה מזומן באמת נשמר; אם נשמר סכום אחר, עורכים
        אותו כאן. פער של ערב (חוסר או עודף במאזן) מוצג בנפרד ולעולם לא יורד
        מהקופה — חוסר מתחלק בין המרוויחים בחלוקת ההעברות.
      </div>

      {overview.evenings.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 13 }}>אין ערבים עדיין.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {overview.evenings.map((e) => (
            <div
              key={e.id}
              style={{
                background: C.card,
                border: `1px solid ${C.line}`,
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <b style={{ fontSize: 14 }}>ערב {e.date}</b>
                <span style={{ fontSize: 12, color: C.dim }}>
                  אתה: {e.edenGross}₪ גולמי → משלם {e.edenPaid}₪
                  {e.edenWon > 0 && ` · מקבל ${e.edenWon}₪`}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  fontSize: 13,
                  flexWrap: "wrap",
                }}
              >
                {editingId === e.id ? (
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ color: C.dim }}>רשום:</span>
                    {amountEditor({
                      value: potValue,
                      onChange: setPotValue,
                      onSave: () => savePot(e.id),
                      onCancel: () => {
                        setEditingId(null);
                        setPotValue("");
                      },
                    })}
                  </span>
                ) : (
                  <span style={{ color: C.cream }}>
                    רשום:{" "}
                    <b style={{ fontVariantNumeric: "tabular-nums" }}>{e.recorded}₪</b>{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(e.id);
                        setPotValue(String(e.recorded));
                      }}
                      style={editBtnStyle}
                    >
                      ערוך
                    </button>
                  </span>
                )}
                {editingActualId === e.id ? (
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ color: C.dim }}>בפועל:</span>
                    {amountEditor({
                      value: actualValue,
                      onChange: setActualValue,
                      onSave: () => savePotActual(e.id),
                      onCancel: () => {
                        setEditingActualId(null);
                        setActualValue("");
                      },
                    })}
                  </span>
                ) : (
                  <span style={{ color: C.cream }}>
                    בפועל:{" "}
                    <b style={{ fontVariantNumeric: "tabular-nums" }}>{e.actual}₪</b>{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingActualId(e.id);
                        setActualValue(String(e.actual));
                      }}
                      style={editBtnStyle}
                    >
                      ערוך
                    </button>
                  </span>
                )}
                <span style={{ color: C.dim }}>
                  פער הערב: {fmtGap(e.gap)}₪
                </span>
              </div>
              {e.actual !== e.recorded && (
                <div style={{ fontSize: 11.5, color: C.dim, marginTop: 4 }}>
                  נשמרו בפועל {e.actual}₪ מתוך {e.recorded}₪ רשומים — היתרה
                  הראשית עוקבת אחרי ה&quot;בפועל&quot;.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
