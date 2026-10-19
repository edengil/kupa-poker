"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";
import { festiveCardSoft } from "../../../lib/poker/festive";

/* כרטיס שיא אחד (אייקון, כותרת, מחזיק, ערך, מקומות 2–3) — חולץ מ־RecordsTab,
   שם הוגדר בתוך הרכיב וסומן 63 פעמים ע"י react-hooks/static-components. */
export function RecordCard({ icon, title, holder, value, tone, sub, runner, third }) {
  return (
  <div style={{
    ...festiveCardSoft,
    borderRadius: 14,
    padding: "13px 14px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxShadow: `0 3px 12px ${C.feltDeep}33`,
  }}>
    <span style={{ fontSize: 26, flex: "0 0 auto" }}>{icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.dim }}>{title}</div>
      <div style={{ fontSize: 15.5, fontWeight: 700, color: C.cream }}>{holder}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.dim }}>{sub}</div>}
      {runner && (
        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>🥈 {runner}</div>
      )}
      {third && (
        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>🥉 {third}</div>
      )}
    </div>
    <b style={{
      fontSize: 16,
      color: tone || C.brass,
      fontVariantNumeric: "tabular-nums",
      flex: "0 0 auto",
    }}>{value}</b>
  </div>
  );
}

/** תאריך שיא בפורמט d.m.yy. */
export function recordDate(r) {
  return `${r.d}.${r.mo}.${String(r.y).slice(2)}`;
}
