"use client";

import React, { useMemo, useState } from "react";
import { C } from "../../lib/poker/colors";
import { r2 } from "../../lib/poker/helpers";
import { fmtGap } from "../../lib/poker/format";
import { potOverview } from "../../lib/paymentTracking";
import { withActual } from "../../lib/poker/potEdits";
import { flushStore } from "../../lib/store";

/**
 * דשבורד קופת חיסכון — אדמין בלבד (מודל 25.10).
 * לכל ערב שני מספרים נפרדים: "רשום" — ה־5% הרשמי (session.savingsPot),
 * שנשמר תמיד במלואו וניתן לעריכה; ו"בפועל" — כמה מזומן באמת נשמר
 * (session.savingsPotActual, ברירת מחדל = הרשום, ניתן לעריכה).
 * היתרה הראשית היא ה"בפועל". פער הערב (חוסר/עודף במאזן) מוצג כשורה
 * נפרדת ולעולם לא מתקזז מול הקופה.
 */
export function PotDashboard({ db, commit, isAdmin }) {
  const [editingId, setEditingId] = useState(null);
  const [potValue, setPotValue] = useState("");
  const [editingActualId, setEditingActualId] = useState(null);
  const [actualValue, setActualValue] = useState("");

  const overview = useMemo(() => potOverview(db), [db]);
  if (!isAdmin) return null;

  const savePot = async (sessionId) => {
    const v = Number(potValue);
    if (!Number.isFinite(v) || v < 0) {
      alert("סכום לא תקין");
      return;
    }
    if (!commit) return;
    /* גל 7 (7.5): היתרה המצטברת נגזרת מ־potOverview — העריכה נוגעת
       רק בשדה של הערב, והיתרה מתעדכנת מאליה מהנגזרת. (לפני הגל,
       B5 תחזק כאן את db.savingsPot ידנית בהפרש; המונה הופסק.) */
    commit({
      ...db,
      sessions: db.sessions.map((s) =>
        s.id === sessionId ? { ...s, savingsPot: v > 0 ? r2(v) : undefined } : s
      ),
    });
    /* בודקים את תוצאת השטיפה (גל 4, 4.6 — בדפוס signOut של OwnerApp):
       שמירה שלא הגיעה לענן לא סוגרת את העורך כאילו הכול תקין. הערך
       נשמר מקומית ויישטף בכתיבה הבאה, אבל המנהל חייב לדעת. */
    if ((await flushStore().catch(() => false)) === false) {
      alert("הערך נשמר במכשיר אבל לא הגיע לענן (בעיית רשת או התנגשות). העורך נשאר פתוח — נסה שוב בעוד רגע.");
      return;
    }
    setEditingId(null);
    setPotValue("");
  };

  /* עריכת "בפועל" — נוגעת רק בשדה של הערב, לא ביתרה הרשומה המצטברת.
     היא משנה את סכום ההעברה לקופה בתוכנית (R3) — ורק אותו: סכומי השחקנים
     נשארים כפי שהיו תחת הרשום (כמו ב־24.10, שם המפה נכתבה מול 93 והבפועל
     70 שינה רק את שורת הקופה; ההפרש הוא עודף פנימי). צופה מחשב עם הרשום
     בלבד (הבפועל פרטי למנהל), ולכן "מקפיאים" את חלוקת החוסר של הרשום
     כמפה ידנית (frozenActual) — לערב בלי חלוקה שמורה כחלוקה חדשה
     אוטומטית (frozenAuto), ולערב עם חלוקה ידנית כמפה מחליפה בתוך אותה
     חלוקה (frozenReal, ממצא ביקורת 8) — כך מנהל וצופה מקבלים אותם
     סכומי שחקנים בדיוק. מחיקת הבפועל משחררת את ההקפאה: מפה אוטומטית
     נמחקת כולה, וחלוקה אמיתית נשארת עם המפה הקפואה (אותם סכומים). */
  const savePotActual = async (sessionId) => {
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
    // כמו savePot (4.6): כשל שטיפה = העורך נשאר פתוח עם הודעה
    if ((await flushStore().catch(() => false)) === false) {
      alert("הערך נשמר במכשיר אבל לא הגיע לענן (בעיית רשת או התנגשות). העורך נשאר פתוח — נסה שוב בעוד רגע.");
      return;
    }
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
    padding: "2px 8px",
    fontFamily: "inherit",
    fontSize: 16,
  };
  const saveBtnStyle = {
    background: C.brass,
    color: C.feltDeep,
    border: "none",
    borderRadius: 8,
    padding: "6px 12px",
    minHeight: 28,
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
    padding: "6px 12px",
    minHeight: 28,
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
        aria-label="סכום קופה לעריכה"
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
