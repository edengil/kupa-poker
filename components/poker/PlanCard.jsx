"use client";

import React, { useState, useEffect } from "react";
import { planLabel } from "../Rsvp";
import { C } from "./colors";
import { festiveCard, festiveGlow, brassCta, sectionEyebrow } from "./festive";
import { HOSTS, wazeNavigateUrl } from "./hosts";

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
  const todayIso = new Date().toISOString().slice(0, 10);
  // מציגים הזמנה רק אם עוד לא עבר התאריך ואין ערב שמור לאותו יום
  const planStale =
    !!db.plan &&
    (db.plan.iso < todayIso || (db.sessions || []).some((s) => s.iso === db.plan.iso));
  const plan = db.plan && !planStale ? db.plan : null;

  // מנקים הזמנה שפג תוקפה / שכבר נשמר עליה ערב — שלא תישאר "מחכה"
  useEffect(() => {
    if (planStale && db.plan) commit({ ...db, plan: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStale, db.plan?.iso]);

  const [editing, setEditing] = useState(false);
  const [iso, setIso] = useState("");
  const [time, setTime] = useState("21:00");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  const startEdit = () => {
    const fields = splitPlanFields(plan);
    setIso(plan?.iso || todayIso);
    setTime(plan?.time || "21:00");
    setLocation(fields.location);
    setNote(fields.note);
    setEditing(true);
  };
  const save = () => {
    if (!iso) return;
    const next = {
      iso,
      time,
      location: location.trim(),
      note: note.trim(),
      createdAt: Date.now(),
    };
    commit({ ...db, plan: next });
    setEditing(false);
    // ההזמנה יוצאת לקבוצת הוואטסאפ עם הלינק — שהחברים יאשרו הגעה
    if (typeof onPlanShared === "function") onPlanShared(next, { isUpdate: !!plan });
  };
  const clear = () => {
    commit({ ...db, plan: null });
    setEditing(false);
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
  const wazeUrl = display?.location ? wazeNavigateUrl(display.location) : null;

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
          הערב הבא
        </div>
        <span style={{ color: C.dim }}>תכנן תאריך — החברים יאשרו הגעה מהלינק</span>
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
                  <>
                    <div style={{ marginTop: 4, color: C.dim }}>ניווט בווייז:</div>
                    <a
                      href={wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: C.brass, wordBreak: "break-all" }}
                    >
                      {wazeUrl}
                    </a>
                  </>
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
            {typeof renderRsvps === "function" && renderRsvps(plan.iso)}
          </>
        )}
      </div>
    </div>
  );
}
