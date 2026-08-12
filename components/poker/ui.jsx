"use client";

import React from "react";
import { C } from "./colors";
import { ChevronDown } from "./icons";

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

/** בורר מקטעים (כמו טאבים קטנים): options = [[value, label], ...]. */
export function SegBar({ value, onChange, options }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 5,
        background: C.card,
        padding: 5,
        borderRadius: 11,
        border: `1px solid ${C.line}`,
      }}
    >
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            flex: 1,
            padding: 9,
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: value === v ? 700 : 500,
            background: value === v ? C.brass : "transparent",
            color: value === v ? C.feltDeep : C.cream,
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** תג קטן במסגרת פליז. */
export function Tag({ children }) {
  return (
    <span
      style={{
        color: C.brass,
        fontSize: 11,
        border: `1px solid ${C.brassSoft}`,
        borderRadius: 6,
        padding: "1px 5px",
      }}
    >
      {children}
    </span>
  );
}

/** כפתור ניווט קטן (חודש/שנה בבאנר). */
export function NavBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: C.feltDeep,
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        padding: 5,
        cursor: disabled ? "default" : "pointer",
        color: disabled ? C.line : C.cream,
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

/** כפתור עגול קטן (+/− ליד שחקן בלייב). */
export function RoundBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: C.feltDeep,
        border: `1px solid ${C.line}`,
        borderRadius: "50%",
        width: 32,
        height: 32,
        cursor: "pointer",
        color: C.cream,
        display: "grid",
        placeItems: "center",
      }}
    >
      {children}
    </button>
  );
}

/** כותרת קבוצה קטנה מעל רשימת מרוויחים/מפסידים. */
export function GroupLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        letterSpacing: 1,
        color: C.dim,
        padding: "6px 4px 2px",
      }}
    >
      {children}
    </div>
  );
}

/** כרטיס סטטיסטיקה קטן בפרופיל שחקן. */
export function Stat({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 11,
        padding: "10px 6px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 10.5, color: C.dim, marginBottom: 3 }}>{label}</div>
      <div
        style={{
          fontSize: 14.5,
          fontWeight: 700,
          color: color || C.cream,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** סגנון בסיסי לשדות טקסט (לייב / כינויים). */
export const inputStyle = {
  flex: 1,
  minWidth: 0,
  background: C.feltDeep,
  color: C.cream,
  border: `1px solid ${C.line}`,
  borderRadius: 9,
  padding: "9px 11px",
  fontSize: 14,
  fontFamily: "inherit",
};

/** בחירה מעוצבת (select מותאם) עם חץ מותאם. options = [[value, label], ...]. */
export function Select({ value, onChange, options, label, grow }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flex: grow ? 1 : "0 0 auto",
      }}
    >
      <span style={{ fontSize: 11.5, color: C.dim }}>{label}</span>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={(e) => onChange(isNaN(+e.target.value) ? e.target.value : +e.target.value)}
          style={{
            appearance: "none",
            width: "100%",
            background: C.card,
            color: C.cream,
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: "11px 32px 11px 12px",
            fontSize: 14.5,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            color: C.dim,
          }}
        />
      </div>
    </label>
  );
}
