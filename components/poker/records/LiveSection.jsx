"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";
import { sectionTitle } from "../../../lib/poker/festive";
import { formatPaymentDelay } from "../../../lib/poker/paymentSpeed";
import { formatSurvivalMs } from "../../../lib/poker/bustRecords";
import { RecordCard } from "./RecordCard";

/* תשלום מהיר, תנודתיות, אמינות הגעה ושיאי יציאה מערבי לייב — חולץ מ־RecordsTab. */
export function LiveSection({ recs, paymentSpeed, attendance, busts }) {
  return (
    <>
  {/* תשלום, תנודתיות מתגלגלת, הגעה וערבי לייב */}
  <div style={sectionTitle({ margin: "12px 2px 0" })}>
    ⚡ תשלום, הגעה ולייב
  </div>
  {paymentSpeed.fastest ? (
    <RecordCard icon="⚡" title="המשלם המהיר" holder={paymentSpeed.fastest.name}
      value={formatPaymentDelay(paymentSpeed.fastest.medianHours)}
      sub={`חציון מפרסום החלוקה לאישור התשלום · ${paymentSpeed.fastest.samples} אישורים`}
      runner={paymentSpeed.rows[1] && paymentSpeed.rows[1].name !== paymentSpeed.fastest.name &&
        `${paymentSpeed.rows[1].name} · ${formatPaymentDelay(paymentSpeed.rows[1].medianHours)}`} />
  ) : (
    <div style={{
      background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
      border: `1px dashed ${C.brass}55`,
      borderRadius: 14,
      padding: "12px 14px", fontSize: 13, color: C.dim, lineHeight: 1.6,
    }}>
      ⚡ המשלם המהיר: עדיין אין אישורי תשלום עם זמן — המדד יופיע אחרי שיסמנו «שולם» בלינק החלוקה בשני ערבים לפחות.
    </div>
  )}
  {recs.rollingRoller && (
    <RecordCard icon="🎢" title="תנודתיות · 30 הימים האחרונים" holder={recs.rollingRoller.name}
      value={`±${recs.rollingRoller.sd}₪`}
      sub={`${recs.rollingRoller.nights} ערבים בחלון המתגלגל`} />
  )}
  {attendance.enough && attendance.mostReliable ? (
    <RecordCard icon="🎯" title="אמינות הגעה" holder={attendance.mostReliable.name}
      value={`${attendance.mostReliable.reliability}%`}
      sub={`אישר הגעה והגיע ${attendance.mostReliable.attended} מתוך ${attendance.mostReliable.saidYes} · מ־${attendance.nights} ערבים`}
      runner={attendance.biggestNoShow &&
        `הכי הרבה הברזות: ${attendance.biggestNoShow.name} · ${attendance.biggestNoShow.noShows}`} />
  ) : (
    <div style={{
      background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
      border: `1px dashed ${C.brass}55`,
      borderRadius: 14,
      padding: "12px 14px", fontSize: 13, color: C.dim, lineHeight: 1.6,
    }}>
      🎯 אמינות הגעה: אין עדיין מספיק נתונים — אישורי ההגעה התחילו להישמר רק מעכשיו, והמדד ייבנה מהערבים הבאים שיישמרו מהלייב.
    </div>
  )}
  {busts?.fastestExit && (
    <RecordCard icon="🏃" title="היציאה המהירה ביותר · ערבי לייב בלבד" holder={busts.fastestExit.name}
      value={formatSurvivalMs(busts.fastestExit.survivalMs)}
      sub={`מ־${busts.liveNights} ערבי לייב עם יומן פעולות`} />
  )}
  {busts?.ironMan && (
    <RecordCard icon="🦾" title="איש הברזל · ערבי לייב בלבד" holder={busts.ironMan.name}
      value={formatSurvivalMs(busts.ironMan.avgMs)}
      sub={`הישרדות ממוצעת בערב · ${busts.ironMan.nights} ערבי לייב`} />
  )}
  {!busts?.fastestExit && (
    <div style={{
      background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
      border: `1px dashed ${C.brass}55`,
      borderRadius: 14,
      padding: "12px 14px", fontSize: 13, color: C.dim, lineHeight: 1.6,
    }}>
      🏃 שיאי יציאה: יופיעו אחרי הערב הבא שיישמר מהלייב — יומן הפעולות התחיל להישמר עם הערב, ורק ממנו נמדדים זמני יציאה.
    </div>
  )}

    </>
  );
}
