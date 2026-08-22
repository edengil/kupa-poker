"use client";

import React, { useState } from "react";
import { planLabel } from "../Rsvp";
import { C } from "./colors";

/* תכנון ערב + כתובות מארחים — חולץ מ-PokerApp.jsx. */
const HOSTS = [
  { label: "אצלי", text: "אצל עדן · לויתן 4, נתניה · קומה 23, דירה 2303 · קוד בניין #4770#" },
  { label: "אופיר סנה", text: "אצל אופיר סנה · לויתן 4, נתניה · קומה 15, דירה 1503 · קוד בניין #4770#" },
  { label: "דור ועדן לירז", text: "אצל דור ועדן לירז · תותחנים 16, כפר יונה" },
  { label: "שגיא גיל", text: "אצל שגיא גיל · יהדות הדממה 11, הרצליה" },
  { label: "איציק", text: "אצל איציק · יוסף בורג 10, נתניה · קומה 2, דירה 6 · קוד בניין #7580" },
];

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
  const plan = db.plan && db.plan.iso >= todayIso ? db.plan : null;
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

  if (!plan && !editing) {
    return (
      <button
        onClick={startEdit}
        style={{
          width: "100%",
          padding: "11px 12px",
          borderRadius: 12,
          border: `1px dashed ${C.line}`,
          background: "transparent",
          color: C.dim,
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        📅 תכנן את הערב הבא — החברים יאשרו הגעה מהלינק
      </button>
    );
  }

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.brass}66`,
        borderRadius: 12,
        padding: "11px 12px",
        marginBottom: 12,
      }}
    >
      {editing ? (
        <>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.brass, marginBottom: 8 }}>
            📅 תכנון הערב הבא
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
              flex: 1, padding: "10px 12px", borderRadius: 10, border: "none",
              background: C.brass, color: C.feltDeep, fontFamily: "inherit",
              fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            }}>
              שמור
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
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.brass }}>♠ הערב הבא</div>
              <div style={{ fontSize: 13.5, color: C.cream }}>{planLabel(plan)}</div>
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
            <div style={{ fontSize: 12.5, color: C.cream, marginBottom: display.note ? 4 : 8, opacity: 0.92 }}>
              📍 {display.location}
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
  );
}
