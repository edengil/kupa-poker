"use client";

import React, { useRef } from "react";
import { C } from "./colors";
import { exportDb, normalize } from "./db";
import { Download, Upload } from "./icons";

/* גיבוי וייצוא/ייבוא JSON — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function BackupCard({ db, commit }) {
  const fileRef = useRef();

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        commit(normalize(JSON.parse(r.result)));
        alert("יובא בהצלחה");
      } catch {
        alert("קובץ לא תקין");
      }
    };
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
        גיבוי וייבוא
      </div>
      <p style={{ fontSize: 12, color: C.dim, marginTop: 0, lineHeight: 1.6 }}>
        ייצא קובץ לגיבוי או להעברה בין הארטיפקט לאתר ה-Netlify. הייבוא הוא הדרך האמינה לטעון
        נתונים קיימים.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => exportDb(db)}
          style={{
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
          }}
        >
          <Download size={16} />
          ייצוא
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          style={{
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
          }}
        >
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
    </div>
  );
}
