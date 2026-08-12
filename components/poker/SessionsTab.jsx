"use client";

import React, { useState } from "react";
import { C } from "./colors";
import { fmt } from "./format";
import { AL, balance, canon, toWhatsApp } from "./helpers";
import { Empty, IconBtn } from "./ui";
import { Pencil, Share2, Trash2 } from "./icons";
import { ShareSheet } from "./ShareSheet";

/* טאב ערבים שמורים — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function SessionsTab({ db, commit, goEdit }) {
  const [share, setShare] = useState(null);
  const A = AL(db);
  if (!db.sessions.length) {
    return <Empty text="עדיין אין ערבים. עבור להזנה או ללייב." />;
  }

  const del = (id) => {
    // אישור לפני מחיקה — ערב שנמחק בטעות לוקח איתו את כל רישום הכסף שלו
    if (typeof window !== "undefined" && !window.confirm("למחוק את הערב? אי אפשר לבטל.")) return;
    commit({
      ...db,
      sessions: db.sessions.filter((s) => s.id !== id),
    });
  };

  const edit = (s) => {
    const raw = s.raw || toWhatsApp(s.entries, s, null, A);
    commit({
      ...db,
      sessions: db.sessions.filter((x) => x.id !== s.id),
    });
    goEdit(raw);
  };

  const list = [...db.sessions].sort((a, b) => b.iso.localeCompare(a.iso));

  return (
    <div
      style={{
        marginTop: 4,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {list.map((s) => {
        const b = balance(s.entries);
        return (
          <div
            key={s.id}
            style={{
              background: C.card,
              border: `1px solid ${b.gap === 0 ? C.line : C.brass}`,
              borderRadius: 12,
              padding: 13,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <b style={{ fontSize: 15 }}>
                {s.d}.{s.mo}.{s.y}
              </b>
              <div style={{ display: "flex", gap: 6 }}>
                <IconBtn onClick={() => setShare(s)}>
                  <Share2 size={15} />
                </IconBtn>
                <IconBtn onClick={() => edit(s)}>
                  <Pencil size={15} />
                </IconBtn>
                <IconBtn onClick={() => del(s.id)} danger>
                  <Trash2 size={15} />
                </IconBtn>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {s.entries.map((e, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12.5,
                    padding: "3px 9px",
                    borderRadius: 20,
                    background: C.feltDeep,
                    color: e.amount >= 0 ? C.win : C.loss,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {canon(e.name, A)} {fmt(e.amount)}
                </span>
              ))}
            </div>
            <div
              style={{
                marginTop: 9,
                fontSize: 12.5,
                color: b.gap === 0 ? C.dim : C.brass,
              }}
            >
              {b.gap === 0 ? "✓ מאוזן" : `⚠ פער ${fmt(b.gap)}`}
            </div>
          </div>
        );
      })}
      {share && (
        <ShareSheet
          title={`סיכום פוקר ${share.d}.${share.mo}`}
          text={toWhatsApp(share.entries, share, null, A)}
          onClose={() => setShare(null)}
        />
      )}
    </div>
  );
}
