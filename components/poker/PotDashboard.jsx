"use client";

import React, { useMemo, useState } from "react";
import { C } from "../../lib/poker/colors";
import { r2 } from "../../lib/poker/helpers";
import { potOverview } from "../../lib/paymentTracking";
import { flushStore } from "../../lib/store";

/**
 * דשבורד קופה צדדית — אדמין בלבד.
 * לכל ערב: הקופה שיושמה בפועל בחלוקה (מחושבת מהיתרות — זה מה שירד
 * מהתשלום של עדן) והקופה המתועדת (ניתנת לעריכה, למעקב מזומן).
 */
export function PotDashboard({ db, commit, isAdmin }) {
  const [editingId, setEditingId] = useState(null);
  const [potValue, setPotValue] = useState("");

  const overview = useMemo(() => potOverview(db), [db]);
  if (!isAdmin) return null;

  const savePot = (sessionId) => {
    const v = Number(potValue);
    if (!Number.isFinite(v) || v < 0) {
      alert("סכום לא תקין");
      return;
    }
    if (!commit) return;
    commit({
      ...db,
      sessions: db.sessions.map((s) =>
        s.id === sessionId ? { ...s, savingsPot: v > 0 ? r2(v) : undefined } : s
      ),
    });
    void flushStore().catch(() => {});
    setEditingId(null);
    setPotValue("");
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.brass }}>
        💰 קופה צדדית — דשבורד מנהל
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {stat("יתרה מתועדת", overview.balance, "מתועד פחות נמשך", true)}
        {stat("יושם בחלוקות", overview.totalApplied, "ירד מהתשלום שלך")}
        {stat("נמשך", overview.withdrawn)}
      </div>

      <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.6 }}>
        הסכום שיורד מהתשלום שלך מחושב אוטומטית מהיתרות כדי שהחלוקה תתאזן.
        הסכום המתועד הוא למעקב המזומן שלך — ניתן לעריכה בכל ערב.
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
                <span style={{ color: C.win }}>
                  יושם: <b style={{ fontVariantNumeric: "tabular-nums" }}>{e.applied}₪</b>
                </span>
                {editingId === e.id ? (
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ color: C.dim }}>מתועד:</span>
                    <input
                      type="number"
                      value={potValue}
                      onChange={(ev) => setPotValue(ev.target.value)}
                      style={{
                        width: 80,
                        background: C.feltDeep,
                        color: C.cream,
                        border: `1px solid ${C.brass}`,
                        borderRadius: 8,
                        padding: "4px 8px",
                        fontFamily: "inherit",
                        fontSize: 13,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => savePot(e.id)}
                      style={{
                        background: C.brass,
                        color: C.feltDeep,
                        border: "none",
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      שמור
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setPotValue("");
                      }}
                      style={{
                        background: "transparent",
                        color: C.dim,
                        border: `1px solid ${C.line}`,
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      ביטול
                    </button>
                  </span>
                ) : (
                  <span style={{ color: C.cream }}>
                    מתועד:{" "}
                    <b style={{ fontVariantNumeric: "tabular-nums" }}>
                      {e.recorded != null ? `${e.recorded}₪` : "—"}
                    </b>{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(e.id);
                        setPotValue(e.recorded != null ? String(e.recorded) : String(e.applied));
                      }}
                      style={{
                        background: "transparent",
                        color: C.brass,
                        border: `1px solid ${C.line}`,
                        borderRadius: 8,
                        padding: "2px 8px",
                        fontSize: 11.5,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        marginRight: 4,
                      }}
                    >
                      ערוך
                    </button>
                  </span>
                )}
              </div>
              {e.recorded != null && Math.abs(e.recorded - e.applied) > 2 && (
                <div style={{ fontSize: 11.5, color: C.brass, marginTop: 4 }}>
                  שים לב: המתועד שונה מהמיושם ב־{r2(Math.abs(e.recorded - e.applied))}₪ (הפרש עיגול/תיעוד)
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
