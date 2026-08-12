"use client";

import React from "react";
import { C } from "./colors";

/* ============================================================================
   רכיבי UI קטנים ומשותפים.

   חולצו מ-PokerApp.jsx (שנכתב אוטומטית ב-React.createElement) אל JSX נקי,
   כחלק מריענון הדרגתי של הקובץ הגדול. ההתנהגות והעיצוב זהים לחלוטין למקור —
   רק קריאים יותר וניתנים לשימוש חוזר.
   ============================================================================ */

/** כפתור אייקון קטן (שיתוף / עריכה / מחיקה). danger צובע באדום. */
export function IconBtn({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: C.feltDeep,
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        padding: 7,
        cursor: "pointer",
        color: danger ? C.loss : C.dim,
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

/** מצב ריק — טקסט מרוכז בתוך כרטיס מקווקו. */
export function Empty({ text }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: 26,
        textAlign: "center",
        color: C.dim,
        background: C.card,
        border: `1px dashed ${C.line}`,
        borderRadius: 14,
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {text}
    </div>
  );
}
