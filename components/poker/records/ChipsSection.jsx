"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";
import { sectionTitle } from "../../../lib/poker/festive";
import { RecordCard, recordDate as dt } from "./RecordCard";

/* שיאי ג׳יטונים — חולץ מ־RecordsTab. */
export function ChipsSection({ recs }) {
  return (
    <>
  {/* מקטעים חדשים — תמיד מוצגים, גם בלי נתונים, כדי שיראו שהפיצ'ר קיים.
      ערבים ישנים נשמרו בלי שדה chips; מהערב הבא שיישמר מהלייב הם יופיעו. */}
  <div style={sectionTitle({ margin: "12px 2px 0" })}>
    🪙 שיאי ג&apos;יטונים
    {recs.chips ? ` · מ־${recs.chips.nightsWithChips} ערבים עם יציאה` : ""}
  </div>
  {!recs.chips ? (
    <div style={{
      background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
      border: `1px dashed ${C.brass}55`,
      borderRadius: 14,
      padding: "12px 14px", fontSize: 13, color: C.dim, lineHeight: 1.6,
    }}>
      עדיין אין ערבים עם יציאת ג&apos;יטונים (שמורה או משוחזרת מקנייה+נטו).
      מהערב הבא שתשמור מהלייב — יישמרו ג&apos;יטונים אמיתיים. לערבים ישנים: (קנייה אחרונה בצ&apos;אט + נטו) × 2.
    </div>
  ) : (
    <>
      {recs.chips.bestMonth && (
        <RecordCard icon="🪙" title={`שיא הכי הרבה ג'יטונים בסיום · ${recs.chips.monthLabel}`}
          holder={recs.chips.bestMonth.name}
          value={`${recs.chips.bestMonth.chips} ג'`}
          tone={C.win}
          sub={dt(recs.chips.bestMonth)}
          runner={recs.chips.bestMonth2 &&
            `${recs.chips.bestMonth2.name} · ${recs.chips.bestMonth2.chips} ג' · ${dt(recs.chips.bestMonth2)}`}
          third={recs.chips.bestMonth3 &&
            `${recs.chips.bestMonth3.name} · ${recs.chips.bestMonth3.chips} ג' · ${dt(recs.chips.bestMonth3)}`} />
      )}
      {recs.chips.bestYear && (
        <RecordCard icon="🪙" title={`שיא הכי הרבה ג'יטונים בסיום · ${recs.chips.yearLabel}`}
          holder={recs.chips.bestYear.name}
          value={`${recs.chips.bestYear.chips} ג'`}
          tone={C.win}
          sub={dt(recs.chips.bestYear)}
          runner={recs.chips.bestYear2 &&
            `${recs.chips.bestYear2.name} · ${recs.chips.bestYear2.chips} ג' · ${dt(recs.chips.bestYear2)}`}
          third={recs.chips.bestYear3 &&
            `${recs.chips.bestYear3.name} · ${recs.chips.bestYear3.chips} ג' · ${dt(recs.chips.bestYear3)}`} />
      )}
      {recs.chips.bestCashout && (
        <RecordCard icon="🪙" title="שיא הכי הרבה ג'יטונים בסיום · כל הזמנים"
          holder={recs.chips.bestCashout.name}
          value={`${recs.chips.bestCashout.chips} ג'`}
          tone={C.win}
          sub={dt(recs.chips.bestCashout)}
          runner={recs.chips.bestCashout2 &&
            `${recs.chips.bestCashout2.name} · ${recs.chips.bestCashout2.chips} ג' · ${dt(recs.chips.bestCashout2)}`}
          third={recs.chips.bestCashout3 &&
            `${recs.chips.bestCashout3.name} · ${recs.chips.bestCashout3.chips} ג' · ${dt(recs.chips.bestCashout3)}`} />
      )}
    </>
  )}

    </>
  );
}
