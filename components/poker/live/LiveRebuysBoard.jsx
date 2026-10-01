"use client";

import { C } from "../../../lib/poker/colors";
import { fmt } from "../../../lib/poker/format";

/* לוח ריבאיים בזמן אמת — מי קנה מחדש הכי הרבה וכמה נכנס לקופה עד עכשיו. */
export function LiveRebuysBoard({ board }) {
  if (!board || !board.knownEvents || board.rows.length === 0) return null;
  const active = board.rows.filter((r) => (r.rebuys ?? 0) > 0);
  return (
    <div
      style={{
        marginTop: 10,
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
        padding: 13,
        fontSize: 13.5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: active.length ? 8 : 0,
        }}
      >
        <span style={{ color: C.dim }}>🔁 ריבאיים עד עכשיו</span>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>
          {board.totalRebuys} · בקופה {board.totalPot.toLocaleString("en-US")}₪
        </b>
      </div>
      {board.topRebuyer && (
        <div style={{ color: C.dim, fontSize: 12, marginBottom: active.length > 1 ? 6 : 0 }}>
          החוזר הגדול: <b style={{ color: C.brass }}>{board.topRebuyer.name}</b> ·{" "}
          {board.topRebuyer.rebuys} ריבאיים · {fmt(board.topRebuyer.buyin)}₪ בקופה
        </div>
      )}
      {active.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {active.slice(0, 5).map((r) => (
            <div
              key={r.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12.5,
                color: C.dim,
              }}
            >
              <span style={{ color: C.cream }}>{r.name}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {r.rebuys} ריבאיים · {r.buyin.toLocaleString("en-US")}₪
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
