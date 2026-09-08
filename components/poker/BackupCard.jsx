"use client";

import React, { useRef, useState } from "react";
import { C } from "./colors";
import { exportDb, validateImport } from "./db";
import { exportSessionsCsv } from "./csvExport";
import { Download, Upload } from "./icons";

const btn = {
  flex: 1,
  padding: 11,
  borderRadius: 10,
  border: `1px solid ${C.line}`,
  background: C.feltDeep,
  color: C.cream,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  fontFamily: "inherit",
};

/* גיבוי JSON + ייצוא CSV לאקסל — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function BackupCard({ db, commit }) {
  const fileRef = useRef();
  const [candidate, setCandidate] = useState(null);
  const [error, setError] = useState("");

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCandidate(null);
    setError("");
    const r = new FileReader();
    r.onload = () => {
      try {
        setCandidate(validateImport(JSON.parse(r.result)));
      } catch (e) {
        setError(e.message || "קובץ לא תקין");
      }
    };
    r.onerror = () => setError("לא ניתן לקרוא את הקובץ.");
    r.readAsText(f);
    e.target.value = "";
  };

  return (
    <div
      style={{
        marginTop: 12,
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 14,
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Download size={16} />
        גיבוי וייצוא
      </div>
      <p style={{ fontSize: 12, color: C.dim, marginTop: 0, lineHeight: 1.6 }}>
        גיבוי מלא ב־JSON, ייבוא חזרה, או ייצוא ערבים ושחקנים לקובץ שאפשר לפתוח באקסל.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => exportSessionsCsv(db)} style={btn}>
          <Download size={16} />
          ייצוא
        </button>
        <button type="button" onClick={() => exportDb(db)} style={btn}>
          <Download size={16} />
          גיבוי JSON
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} style={btn}>
          <Upload size={16} />
          ייבוא
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={onFile}
          style={{ display: "none" }}
        />
      </div>
      {error && <p role="alert" style={{ color: C.loss }}>{error}</p>}
      {candidate && <div style={{ marginTop: 12, lineHeight: 1.7 }}>
        <p>הגיבוי מכיל {candidate.sessions.length} ערבים ו־{candidate.yearly.length} מאזנים שנתיים. אישור יחליף את הנתונים הנוכחיים. תחילה יירד גיבוי של הנתונים הקיימים.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={() => { exportDb(db); commit(candidate); setCandidate(null); }}>גבה והחלף נתונים</button>
          <button style={btn} onClick={() => setCandidate(null)}>ביטול</button>
        </div>
      </div>}
    </div>
  );
}
