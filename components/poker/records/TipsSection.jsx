"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";
import { sectionTitle } from "../../../lib/poker/festive";
import { RecordCard, recordDate as dt } from "./RecordCard";
import { fmt } from "../../../lib/poker/format";

/* שיאי טיפים — חולץ מ־RecordsTab. */
export function TipsSection({ recs }) {
  return (
    <>
  {/* שיאי טיפים גבוה ברשימה — אחרי מלכי החודש/שנה/כל הזמנים — כדי לעודד טיפים */}
  <div style={sectionTitle({ margin: "12px 2px 0" })}>
    💸 שיאי טיפים
  </div>
  <p style={{ margin: "0 2px 8px", color: C.dim, fontSize: 11.5, lineHeight: 1.6 }}>
    כל כרטיס מודד משהו אחר: &quot;טיפ בודד&quot; הוא פעולה אחת, &quot;ג&apos;יטוני טיפ בערב&quot; הוא סכום כל הטיפים של אותו שחקן באותו ערב.
  </p>
  {!recs.tips ? (
    <div style={{
      background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
      border: `1px dashed ${C.brass}55`,
      borderRadius: 14,
      padding: "12px 14px", fontSize: 13, color: C.dim, lineHeight: 1.6,
    }}>
      עדיין אין טיפים. בקבוצה: <b style={{ color: C.cream }}>אופיר טיפ 10</b>
      {" "}או <b style={{ color: C.cream }}>אופיר 10 טיפ</b>
      {" "}(ג&apos;יטונים מהערימה שלו). אחרי שמירת הערב השיאים יופיעו כאן.
    </div>
  ) : (
    <>
      {recs.tips.biggestTip && (
        <RecordCard icon="💎" title="הטיפ הבודד הגדול ביותר" holder={recs.tips.biggestTip.name}
          value={`${recs.tips.biggestTip.amount} ג'`} tone={C.win}
          sub={dt(recs.tips.biggestTip)}
          runner={recs.tips.biggestTip2 &&
            `${recs.tips.biggestTip2.name} · ${recs.tips.biggestTip2.amount} ג' · ${dt(recs.tips.biggestTip2)}`}
          third={recs.tips.biggestTip3 &&
            `${recs.tips.biggestTip3.name} · ${recs.tips.biggestTip3.amount} ג' · ${dt(recs.tips.biggestTip3)}`} />
      )}
      {recs.tips.mostTipsNight && (
        <RecordCard icon="🔁" title="הכי הרבה טיפים בערב אחד" holder={recs.tips.mostTipsNight.name}
          value={`${recs.tips.mostTipsNight.count} טיפים`}
          sub={dt(recs.tips.mostTipsNight)}
          runner={recs.tips.mostTipsNight2 &&
            `${recs.tips.mostTipsNight2.name} · ${recs.tips.mostTipsNight2.count} טיפים · ${dt(recs.tips.mostTipsNight2)}`} />
      )}
      {recs.tips.mostTipChipsNight && (
        <RecordCard icon="🪙" title="הכי הרבה ג'יטוני טיפ בערב אחד" holder={recs.tips.mostTipChipsNight.name}
          value={`${recs.tips.mostTipChipsNight.chips} ג'`}
          sub={dt(recs.tips.mostTipChipsNight)}
          runner={recs.tips.mostTipChipsNight2 &&
            `${recs.tips.mostTipChipsNight2.name} · ${recs.tips.mostTipChipsNight2.chips} ג' · ${dt(recs.tips.mostTipChipsNight2)}`}
          third={recs.tips.mostTipChipsNight3 &&
            `${recs.tips.mostTipChipsNight3.name} · ${recs.tips.mostTipChipsNight3.chips} ג' · ${dt(recs.tips.mostTipChipsNight3)}`} />
      )}
      {recs.tips.lastTipsNight && (
        <RecordCard icon="🕘" title="טיפי הערב האחרון"
          holder={recs.tips.lastTipsNight.leader ? recs.tips.lastTipsNight.leader.name : "ללא מוביל"}
          value={`${recs.tips.lastTipsNight.chips} ג'`}
          sub={`${dt(recs.tips.lastTipsNight)} · ${recs.tips.lastTipsNight.count} טיפים`} />
      )}
      {recs.tips.monthKing && (
        <RecordCard icon="🏅" title={`מלך הטיפים · ${recs.tips.monthLabel}`}
          holder={recs.tips.monthKing.name}
          value={`${recs.tips.monthKing.chips} ג'`} tone={C.win}
          runner={recs.tips.monthKing2 &&
            `${recs.tips.monthKing2.name} · ${recs.tips.monthKing2.chips} ג'`}
          third={recs.tips.monthKing3 &&
            `${recs.tips.monthKing3.name} · ${recs.tips.monthKing3.chips} ג'`} />
      )}
      {recs.tips.allKing && (
        <RecordCard icon="🐐" title="מלך הטיפים · כל הזמנים" holder={recs.tips.allKing.name}
          value={`${recs.tips.allKing.chips} ג'`} tone={C.win}
          runner={recs.tips.allKing2 &&
            `${recs.tips.allKing2.name} · ${recs.tips.allKing2.chips} ג'`}
          third={recs.tips.allKing3 &&
            `${recs.tips.allKing3.name} · ${recs.tips.allKing3.chips} ג'`} />
      )}
    </>
  )}

    </>
  );
}
