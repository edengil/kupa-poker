"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";
import { sectionTitle } from "../../../lib/poker/festive";
import { RecordCard } from "./RecordCard";

/* מילוי זוגי — חולץ מ־RecordsTab. */
export function CoupleSection({ recs }) {
  return (
    <>
  <div style={sectionTitle({ margin: "12px 2px 0" })}>
    ↔ מילוי זוגי
  </div>
  {!recs.coupleFills ? (
    <div style={{
      background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
      border: `1px dashed ${C.brass}55`,
      borderRadius: 14,
      padding: "12px 14px", fontSize: 13, color: C.dim, lineHeight: 1.6,
    }}>
      עדיין אין מילויים. בלייב, כששני בני הזוג בשולחן: לחיצה על השם / ↔ לבחירת כיוון
      (למשל עדן → אורן · 30). כל פעולה = 30 ג&apos;יטונים. נשמר רק אצלך, לא נשלח לקבוצה.
    </div>
  ) : (
    <>
      {recs.coupleFills.monthTop && (
        <RecordCard icon="🤝" title={`מילוי זוגי של החודש · ${recs.coupleFills.monthLabel}`}
          holder={recs.coupleFills.monthTop.label}
          value={`${recs.coupleFills.monthTop.chips} ג'`}
          sub={`${recs.coupleFills.monthTop.count} מילויים · ${recs.coupleFills.monthTop.couple || ""}`}
          runner={recs.coupleFills.monthTop2 &&
            `${recs.coupleFills.monthTop2.label} · ${recs.coupleFills.monthTop2.chips} ג' (${recs.coupleFills.monthTop2.count}×)`}
          third={recs.coupleFills.monthTop3 &&
            `${recs.coupleFills.monthTop3.label} · ${recs.coupleFills.monthTop3.chips} ג' (${recs.coupleFills.monthTop3.count}×)`} />
      )}
      {recs.coupleFills.allTop && (
        <RecordCard icon="🔗" title="מילוי זוגי · כל הזמנים"
          holder={recs.coupleFills.allTop.label}
          value={`${recs.coupleFills.allTop.chips} ג'`}
          sub={`${recs.coupleFills.allTop.count} פעמים · ${recs.coupleFills.allTop.couple || ""}`}
          runner={recs.coupleFills.allTop2 &&
            `${recs.coupleFills.allTop2.label} · ${recs.coupleFills.allTop2.chips} ג'`}
          third={recs.coupleFills.allTop3 &&
            `${recs.coupleFills.allTop3.label} · ${recs.coupleFills.allTop3.chips} ג'`} />
      )}
    </>
  )}
    </>
  );
}
