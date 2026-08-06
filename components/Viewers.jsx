"use client";

import React, { useEffect, useState } from "react";
import { watchPresence } from "../lib/realtime";

/* ============================================================================
   מי צופה בקבוצה.

   שני מקורות שונים: נוכחות בזמן אמת (מי פתוח עכשיו) ויומן הכניסות
   (מי נכנס מתי, גם אם סגר מזמן). הפאנל סגור כברירת מחדל כדי לא לגנוב
   מקום מהטבלה עצמה.
   ============================================================================ */

const C = {
  card: "#15493A",
  cardHi: "#1B5644",
  line: "#2C6B54",
  brass: "#D9A441",
  cream: "#EFE7D2",
  dim: "#9DBBAC",
  win: "#5BC38C",
};

const short = (v) => {
  if (!v) return "";
  const d = new Date(v);
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שע׳`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function Viewers({ supabase, slug, groupId }) {
  const [online, setOnline] = useState([]);
  const [log, setLog] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    return watchPresence(supabase, slug, setOnline);
  }, [supabase, slug]);

  // היומן נטען רק כשפותחים, ואין טעם למשוך אותו ברקע כל הזמן
  useEffect(() => {
    if (!open || !groupId) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("group_views")
        .select("user_id, name, email, at")
        .eq("group_id", groupId)
        .order("at", { ascending: false })
        .limit(200);
      if (error || !alive) return;

      // מקבצים לאדם — כמה פעמים ומתי לאחרונה
      const byPerson = new Map();
      for (const row of data) {
        const key = row.user_id || row.email;
        const prev = byPerson.get(key);
        if (prev) prev.count += 1;
        else byPerson.set(key, { ...row, count: 1 });
      }
      setLog([...byPerson.values()]);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, groupId, open]);

  const label = (p) => p.name || (p.email || "").split("@")[0] || "אנונימי";
  const onlineIds = new Set(online.map((p) => p.id));

  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        margin: "11px 0",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "11px 13px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "right",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: online.length ? C.win : C.dim,
            boxShadow: online.length ? `0 0 0 3px ${C.win}22` : "none",
            flex: "0 0 auto",
          }}
        />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.cream }}>
          {online.length ? `${online.length} צופים עכשיו` : "אף אחד לא צופה"}
        </span>
        <span style={{ fontSize: 12, color: C.dim }}>{open ? "סגור" : "יומן"}</span>
      </button>

      {online.length > 0 && (
        <div style={{ padding: "0 13px 11px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {online.map((p) => (
            <span
              key={p.id}
              style={{
                background: C.cardHi,
                border: `1px solid ${C.win}55`,
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 12.5,
                color: C.cream,
              }}
            >
              {label(p)}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: "4px 13px 11px" }}>
          {!log.length ? (
            <p style={{ color: C.dim, fontSize: 12.5, margin: "10px 0" }}>אף אחד עוד לא פתח את הלינק.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {log.map((p) => (
                <li
                  key={p.user_id || p.email}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 0",
                    borderBottom: `1px solid ${C.line}44`,
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13.5, color: C.cream }}>
                    {label(p)}
                    {onlineIds.has(p.user_id) && (
                      <span style={{ color: C.win, fontSize: 11, marginInlineStart: 6 }}>● עכשיו</span>
                    )}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.dim }}>
                    {p.count} כניסות · {short(p.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
