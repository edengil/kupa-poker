"use client";

import React from "react";
import { C } from "../../lib/poker/colors";
import { botHealthView, formatAgoHe } from "../../lib/wa/health.js";

/* מתג בוט וואטסאפ — חולץ מ-PokerApp.jsx.
   שורת הסטטוס התחתונה היא אינדיקטור בריאות הערוץ (config.botHealth,
   נכתב מהשרת על כל שליחה דרך lib/wa/healthServer): אם הערוץ נפל —
   רואים כאן מתי נרשם הכשל האחרון ומה הייתה השגיאה, במקום לגלות
   בדיעבד שהבוט שתק. */
export function BotToggle({ on, onChange, health = null }) {
  const view = health ? botHealthView(health) : null;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${on ? C.win + "77" : C.line}`,
        borderRadius: 12,
        padding: "10px 12px",
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: on ? C.win : C.dim,
          boxShadow: on ? `0 0 0 3px ${C.win}22` : "none",
          flex: "0 0 auto",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.cream }}>
          בוט הוואטסאפ {on ? "פעיל" : "כבוי"}
        </div>
        <div style={{ fontSize: 11.5, color: C.dim }}>
          {on ? "מגיב לפקודות בקבוצה. נכבה לבד בסוף הערב." : "נדלק לבד כשנפתח משחק, או ידנית כאן."}
        </div>
        {view?.state === "down" && (
          <div style={{ fontSize: 11.5, color: C.loss, marginTop: 3 }}>
            ⚠️ הערוץ נפל — כשל שליחה אחרון {formatAgoHe(view.lastFailAt)}
            {view.lastFailHint ? ` · ${view.lastFailHint}` : ""}
          </div>
        )}
        {view?.state === "up" && (
          <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>
            הערוץ חי · שליחה אחרונה {formatAgoHe(view.lastOkAt)}
          </div>
        )}
      </div>
      <button
        onClick={() => onChange(!on)}
        style={{
          border: "none",
          cursor: "pointer",
          borderRadius: 999,
          padding: "7px 16px",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 700,
          background: on ? C.feltDeep : C.brass,
          color: on ? C.cream : C.feltDeep,
        }}
      >
        {on ? "כבה" : "הדלק"}
      </button>
    </div>
  );
}
