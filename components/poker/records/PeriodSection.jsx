"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";
import { fmt } from "../../../lib/poker/format";
import { sectionTitle } from "../../../lib/poker/festive";
import { ScopeChip } from "../ScopeChip";
import { SummaryCardButton } from "../SummaryCardButton";
import { RecordCard, recordDate as dt } from "./RecordCard";

/* שיאים לפי תקופה (חודש/שנה נבחרים) — חולץ מ־RecordsTab. */
export function PeriodSection({ db, periods, periodKind, setPeriodKind, effMonthKey, setPeriodMonthKey, effPeriodYear, setPeriodYear, scoped }) {
  return (
    <>
  {/* שיאים לפי תקופה — כל כרטיס מחושב רק מערבי החודש/השנה הנבחרים */}
  <div style={sectionTitle({ margin: "12px 2px 0" })}>
    🗓️ שיאים לפי תקופה
  </div>
  <div style={{ display: "flex", gap: 6, margin: "0 2px 10px" }}>
    <ScopeChip active={periodKind === "month"} onClick={() => setPeriodKind("month")}>חודשי</ScopeChip>
    <ScopeChip active={periodKind === "year"} onClick={() => setPeriodKind("year")}>שנתי</ScopeChip>
  </div>
  <label style={{ display: "block", margin: "0 2px 12px" }}>
    <div style={{ fontSize: 12, color: C.dim, marginBottom: 5 }}>
      {periodKind === "month" ? "חודש" : "שנה"}
    </div>
    {periodKind === "month" ? (
      <select
        value={effMonthKey || ""}
        onChange={(e) => setPeriodMonthKey(e.target.value)}
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
        {periods.months.map((m) => (
          <option key={m.key} value={m.key}>{m.label}</option>
        ))}
      </select>
    ) : (
      <select
        value={effPeriodYear}
        onChange={(e) => setPeriodYear(Number(e.target.value))}
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
        {periods.years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    )}
  </label>
  {!scoped ? (
    <div style={{
      background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
      border: `1px dashed ${C.brass}55`,
      borderRadius: 14,
      padding: "12px 14px", fontSize: 13, color: C.dim, lineHeight: 1.6,
    }}>
      🗓️ אין ערבים מתועדים בתקופה שנבחרה — בחרו תקופה אחרת.
    </div>
  ) : (
    <>
      <p style={{ margin: "0 2px 8px", color: C.dim, fontSize: 11.5, lineHeight: 1.6 }}>
        כל השיאים כאן מחושבים רק מ־{scoped.nights} הערבים של {scoped.label}.
      </p>
      <SummaryCardButton
        db={db}
        scope={
          periodKind === "month"
            ? { kind: "month", y: scoped.y, mo: scoped.mo }
            : { kind: "year", y: scoped.y }
        }
      />
      {periodKind === "month" ? (
        <>
          {scoped.recs.monthKing && (
            <RecordCard icon="👑" title={`מלך ${scoped.label}`} holder={scoped.recs.monthKing.name}
              value={fmt(scoped.recs.monthKing.amount)} tone={C.win}
              runner={scoped.recs.monthKing2 && `${scoped.recs.monthKing2.name} · ${fmt(scoped.recs.monthKing2.amount)}`}
              third={scoped.recs.monthKing3 && `${scoped.recs.monthKing3.name} · ${fmt(scoped.recs.monthKing3.amount)}`} />
          )}
          {scoped.recs.tips?.monthKing && (
            <RecordCard icon="🏅" title={`מלך הטיפים · ${scoped.label}`} holder={scoped.recs.tips.monthKing.name}
              value={`${scoped.recs.tips.monthKing.chips} ג'`} tone={C.win}
              runner={scoped.recs.tips.monthKing2 && `${scoped.recs.tips.monthKing2.name} · ${scoped.recs.tips.monthKing2.chips} ג'`}
              third={scoped.recs.tips.monthKing3 && `${scoped.recs.tips.monthKing3.name} · ${scoped.recs.tips.monthKing3.chips} ג'`} />
          )}
        </>
      ) : (
        <>
          {scoped.recs.yearKing && (
            <RecordCard icon="🏆" title={`מוביל ${scoped.label}`} holder={scoped.recs.yearKing.name}
              value={fmt(scoped.recs.yearKing.amount)} tone={C.win}
              runner={scoped.recs.yearKing2 && `${scoped.recs.yearKing2.name} · ${fmt(scoped.recs.yearKing2.amount)}`}
              third={scoped.recs.yearKing3 && `${scoped.recs.yearKing3.name} · ${fmt(scoped.recs.yearKing3.amount)}`} />
          )}
          {scoped.recs.tips?.allKing && (
            <RecordCard icon="🏅" title={`מלך הטיפים · ${scoped.label}`} holder={scoped.recs.tips.allKing.name}
              value={`${scoped.recs.tips.allKing.chips} ג'`} tone={C.win}
              runner={scoped.recs.tips.allKing2 && `${scoped.recs.tips.allKing2.name} · ${scoped.recs.tips.allKing2.chips} ג'`}
              third={scoped.recs.tips.allKing3 && `${scoped.recs.tips.allKing3.name} · ${scoped.recs.tips.allKing3.chips} ג'`} />
          )}
        </>
      )}
      {scoped.recs.bestNight && (
        <RecordCard icon="🔥" title={`ערב השיא · ${scoped.label}`} holder={scoped.recs.bestNight.name}
          value={fmt(scoped.recs.bestNight.amount)} tone={C.win} sub={dt(scoped.recs.bestNight)}
          runner={scoped.recs.bestNight2 && `${scoped.recs.bestNight2.name} · ${fmt(scoped.recs.bestNight2.amount)} · ${dt(scoped.recs.bestNight2)}`}
          third={scoped.recs.bestNight3 && `${scoped.recs.bestNight3.name} · ${fmt(scoped.recs.bestNight3.amount)} · ${dt(scoped.recs.bestNight3)}`} />
      )}
      {scoped.recs.worstNight && scoped.recs.worstNight.amount < 0 && (
        <RecordCard icon="🥶" title={`הערב הקשה · ${scoped.label}`} holder={scoped.recs.worstNight.name}
          value={fmt(scoped.recs.worstNight.amount)} tone={C.loss} sub={dt(scoped.recs.worstNight)} />
      )}
      {scoped.recs.most && (
        <RecordCard icon="🎯" title={`הכי הרבה ערבים · ${scoped.label}`} holder={scoped.recs.most.name}
          value={`${scoped.recs.most.nights}`}
          runner={scoped.recs.most2 && `${scoped.recs.most2.name} · ${scoped.recs.most2.nights}`}
          third={scoped.recs.most3 && `${scoped.recs.most3.name} · ${scoped.recs.most3.nights}`} />
      )}
      {scoped.recs.mostWins && scoped.recs.mostWins.wins > 0 && (
        <RecordCard icon="✅" title={`הכי הרבה ערבים חיוביים · ${scoped.label}`} holder={scoped.recs.mostWins.name}
          value={`${scoped.recs.mostWins.wins} ערבים`} tone={C.win}
          runner={scoped.recs.mostWins2 && scoped.recs.mostWins2.wins > 0 &&
            `${scoped.recs.mostWins2.name} · ${scoped.recs.mostWins2.wins} ערבים`}
          third={scoped.recs.mostWins3 && scoped.recs.mostWins3.wins > 0 &&
            `${scoped.recs.mostWins3.name} · ${scoped.recs.mostWins3.wins} ערבים`} />
      )}
      {periodKind === "month" ? (
        <>
          {scoped.recs.chips?.bestMonth && (
            <RecordCard icon="🪙" title={`שיא הכי הרבה ג'יטונים בסיום · ${scoped.label}`}
              holder={scoped.recs.chips.bestMonth.name}
              value={`${scoped.recs.chips.bestMonth.chips} ג'`} tone={C.win}
              sub={dt(scoped.recs.chips.bestMonth)} />
          )}
          {scoped.recs.coupleFills?.monthTop && (
            <RecordCard icon="🤝" title={`מילוי זוגי · ${scoped.label}`}
              holder={scoped.recs.coupleFills.monthTop.label}
              value={`${scoped.recs.coupleFills.monthTop.chips} ג'`}
              sub={`${scoped.recs.coupleFills.monthTop.count} מילויים · ${scoped.recs.coupleFills.monthTop.couple || ""}`} />
          )}
        </>
      ) : (
        <>
          {scoped.recs.chips?.bestYear && (
            <RecordCard icon="🪙" title={`שיא הכי הרבה ג'יטונים בסיום · ${scoped.label}`}
              holder={scoped.recs.chips.bestYear.name}
              value={`${scoped.recs.chips.bestYear.chips} ג'`} tone={C.win}
              sub={dt(scoped.recs.chips.bestYear)} />
          )}
          {scoped.recs.coupleFills?.allTop && (
            <RecordCard icon="🔗" title={`מילוי זוגי · ${scoped.label}`}
              holder={scoped.recs.coupleFills.allTop.label}
              value={`${scoped.recs.coupleFills.allTop.chips} ג'`}
              sub={`${scoped.recs.coupleFills.allTop.count} פעמים · ${scoped.recs.coupleFills.allTop.couple || ""}`} />
          )}
        </>
      )}
    </>
  )}

    </>
  );
}
