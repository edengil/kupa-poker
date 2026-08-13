"use client";

import React, { useState } from "react";
import { C } from "./colors";
import { AL } from "./helpers";
import { IconBtn, inputStyle } from "./ui";
import { ChevronDown, Trash2, Users } from "./icons";

/* כרטיס כינויים — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function AliasCard({ db, commit }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const entries = Object.entries(AL(db));

  const add = () => {
    if (!from.trim() || !to.trim()) return;
    commit({
      ...db,
      aliases: {
        ...db.aliases,
        [from.trim()]: to.trim(),
      },
    });
    setFrom("");
    setTo("");
  };

  const rm = (k) => {
    const a = { ...db.aliases };
    delete a[k];
    commit({ ...db, aliases: a });
  };

  return (
    <div
      style={{
        marginTop: 22,
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "none",
          border: "none",
          color: C.cream,
          padding: 14,
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={16} />
          כינויים / איחוד שמות ({entries.length})
        </span>
        <ChevronDown size={17} style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          <p style={{ fontSize: 12.5, color: C.dim, marginTop: 0 }}>
            למשל &quot;דו&quot; ← &quot;דן ינקלויץ&quot;. השם השמאלי יומר לימני בכל החישובים.
          </p>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {entries.map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "7px 0",
                  fontSize: 14,
                }}
              >
                <span>
                  {k} <span style={{ color: C.dim }}>←</span> <b>{v}</b>
                </span>
                <IconBtn onClick={() => rm(k)} danger>
                  <Trash2 size={14} />
                </IconBtn>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="שם בטקסט"
              style={inputStyle}
            />
            <span style={{ alignSelf: "center", color: C.dim }}>←</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="שם אמיתי"
              style={inputStyle}
            />
            <button
              onClick={add}
              style={{
                background: C.brass,
                color: C.feltDeep,
                border: "none",
                borderRadius: 9,
                padding: "0 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
