"use client";

import React, { useEffect, useState } from "react";

/* ============================================================================
   פאנל "משחק עכשיו" לצופים.

   רכיב נפרד ולא גרסה מרוככת של LiveTab, משתי סיבות: LiveTab מחזיק עשר יחידות
   state ונטען פעם אחת בלבד, כך שהוא לא בנוי להתעדכן מבחוץ; והוא מלא בפקדי
   עריכה שלצופה אין מה לעשות איתם. כאן רק מציגים.

   המבנה שנשמר ב-poker:live:
     { players: [{ name, buyin (₪), cashout (צ'יפים, מחרוזת) }],
       entriesCount, addAmt, startedAt, ts }
   ============================================================================ */

const C = {
  card: "#15493A",
  cardHi: "#1B5644",
  line: "#2C6B54",
  brass: "#D9A441",
  cream: "#EFE7D2",
  dim: "#9DBBAC",
  win: "#5BC38C",
  loss: "#E27A63",
};

const r2 = (v) => Math.round(v * 100) / 100;

function elapsed(startedAt, now) {
  if (!startedAt) return null;
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")} שעות` : `${m} דק׳`;
}

export default function LiveNow({ live, chipsPerShekel = 2 }) {
  const [now, setNow] = useState(() => Date.now());
  const running = live?.players?.length > 0;

  useEffect(() => {
    if (!running || !live?.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [running, live?.startedAt]);

  if (!running) return null;

  const players = live.players;
  const pot = r2(players.reduce((s, p) => s + (+p.buyin || 0), 0));
  const cps = chipsPerShekel || 2;
  const clock = elapsed(live.startedAt, now);

  const rows = players
    .map((p) => ({
      name: p.name,
      buyin: +p.buyin || 0,
      net: p.cashout === "" || p.cashout == null ? null : r2((+p.cashout || 0) / cps - (+p.buyin || 0)),
    }))
    .sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity));

  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 15,
        padding: "13px 14px 6px",
        margin: "13px 0",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 11,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: C.win,
            boxShadow: `0 0 0 3px ${C.win}22`,
          }}
        />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.cream }}>משחק עכשיו</h2>
        <span style={{ marginInlineStart: "auto", fontSize: 12.5, color: C.dim }}>
          קופה {pot}₪{clock ? ` · ${clock}` : ""}
        </span>
      </header>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((p) => (
          <li
            key={p.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderTop: `1px solid ${C.line}55`,
            }}
          >
            <span style={{ fontSize: 14, color: C.cream, flex: 1 }}>{p.name}</span>
            <span style={{ fontSize: 12, color: C.dim }}>{p.buyin}₪</span>
            <span
              style={{
                minWidth: 62,
                textAlign: "left",
                fontSize: 14,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: p.net == null ? C.dim : p.net >= 0 ? C.win : C.loss,
              }}
            >
              {p.net == null ? "בשולחן" : `${p.net > 0 ? "+" : ""}${p.net}`}
            </span>
          </li>
        ))}
      </ul>

      <p style={{ margin: "9px 0 8px", fontSize: 11.5, color: C.dim, textAlign: "center" }}>
        מתעדכן לבד · סכומים סופיים רק בסוף הערב
      </p>
    </section>
  );
}
