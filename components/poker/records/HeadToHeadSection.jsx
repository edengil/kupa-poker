"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";
import { fmt } from "../../../lib/poker/format";
import { sectionTitle } from "../../../lib/poker/festive";
import { RecordCard } from "./RecordCard";

/* ראש־בראש לפי שנה — חולץ מ־RecordsTab. */
export function HeadToHeadSection({ h2h, h2hScope, setH2hScope, h2hYearOptions }) {
  return (
    <>
  {/* ראש־בראש לפי שנה: הנטו של כל שחקן בערבים שבהם היריב ישב איתו בשולחן */}
  <div style={sectionTitle({ margin: "12px 2px 0" })}>
    ⚔️ ראש בראש · {h2hScope === "all" ? "כל הזמנים" : h2hScope}
  </div>
  <p style={{ margin: "0 2px 8px", color: C.dim, fontSize: 11.5, lineHeight: 1.6 }}>
    היריבויות עם הכי הרבה ערבים משותפים (מינימום 3). הנטו הוא של כל שחקן באותם ערבים.
  </p>
  <label style={{ display: "block", margin: "0 2px 12px" }}>
    <div style={{ fontSize: 12, color: C.dim, marginBottom: 5 }}>שנה ליריבויות</div>
    <select
      value={String(h2hScope)}
      onChange={(e) =>
        setH2hScope(e.target.value === "all" ? "all" : Number(e.target.value))
      }
      style={{
        width: "100%",
        background: C.card,
        color: C.cream,
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 14,
        fontFamily: "inherit",
      }}
    >
      {h2hYearOptions.map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
      <option value="all">כל הזמנים</option>
    </select>
  </label>
  {h2h && h2h.topRivalries.length > 0 ? (
    h2h.topRivalries.map((p) => (
      <RecordCard
        key={`${p.a}|${p.b}`}
        icon="⚔️"
        title={`${p.a} ⚔ ${p.b}`}
        holder={p.aNet >= p.bNet ? `מוביל: ${p.a}` : `מוביל: ${p.b}`}
        value={`${p.nights} ערבים`}
        sub={`נטו בערבים המשותפים: ${p.a} ${fmt(p.aNet)} · ${p.b} ${fmt(p.bNet)}`}
      />
    ))
  ) : (
    <div style={{
      background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
      border: `1px dashed ${C.brass}55`,
      borderRadius: 14,
      padding: "12px 14px", fontSize: 13, color: C.dim, lineHeight: 1.6,
    }}>
      ⚔️{" "}
      {h2hScope === "all"
        ? "אין מספיק ערבים משותפים — צריך לפחות 3 ערבים משותפים לאותם שני שחקנים יחד."
        : h2h
          ? `אין מספיק ערבים משותפים ב־${h2hScope} — צריך לפחות 3 ערבים משותפים לאותם שני שחקנים יחד.`
          : `אין ערבים מתועדים ב־${h2hScope}.`}
    </div>
  )}

    </>
  );
}
