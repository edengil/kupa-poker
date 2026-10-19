"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";
import { fmt, MONTHS } from "../../../lib/poker/format";
import { RecordCard, recordDate as dt } from "./RecordCard";

/* שיאי כל הזמנים — חולץ מ־RecordsTab. */
export function AllTimeSection({ recs }) {
  return (
    <>
  {recs.crownKing && (
    <RecordCard icon="🥇" title="מלך המלכים — הכי הרבה חודשים במקום הראשון" holder={recs.crownKing.name}
      value={`${recs.crownKing.count} כתרים`}
      runner={recs.crownKing2 && `${recs.crownKing2.name} · ${recs.crownKing2.count} כתרים`}
      third={recs.crownKing3 && `${recs.crownKing3.name} · ${recs.crownKing3.count} כתרים`} />
  )}
  {recs.bestNight && (
    <RecordCard icon="🔥" title="ערב השיא בהיסטוריה" holder={recs.bestNight.name}
      value={fmt(recs.bestNight.amount)} tone={C.win} sub={dt(recs.bestNight)}
      runner={recs.bestNight2 && `${recs.bestNight2.name} · ${fmt(recs.bestNight2.amount)} · ${dt(recs.bestNight2)}`}
      third={recs.bestNight3 && `${recs.bestNight3.name} · ${fmt(recs.bestNight3.amount)} · ${dt(recs.bestNight3)}`} />
  )}
  {recs.worstNight && recs.worstNight.amount < 0 && (
    <RecordCard icon="🥶" title="הערב הקשה בהיסטוריה" holder={recs.worstNight.name}
      value={fmt(recs.worstNight.amount)} tone={C.loss} sub={dt(recs.worstNight)}
      runner={recs.worstNight2 && recs.worstNight2.amount < 0 &&
        `${recs.worstNight2.name} · ${fmt(recs.worstNight2.amount)} · ${dt(recs.worstNight2)}`}
      third={recs.worstNight3 && recs.worstNight3.amount < 0 &&
        `${recs.worstNight3.name} · ${fmt(recs.worstNight3.amount)} · ${dt(recs.worstNight3)}`} />
  )}
  {recs.bestMonth && (
    <RecordCard icon="📅" title="החודש הטוב אי פעם" holder={recs.bestMonth.name}
      value={fmt(recs.bestMonth.amount)} tone={C.win}
      sub={`${MONTHS[recs.bestMonth.mo - 1]} ${recs.bestMonth.y}`} />
  )}
  {recs.bestYear && (
    <RecordCard icon="🗓️" title="השנה הטובה אי פעם" holder={recs.bestYear.name}
      value={fmt(recs.bestYear.amount)} tone={C.win} sub={`${recs.bestYear.y}`} />
  )}
  {recs.liveStreak && (
    <RecordCard icon="⚡" title="רצף ניצחונות פעיל" holder={recs.liveStreak.name}
      value={`${recs.liveStreak.tail} ערבים`} />
  )}
  {recs.bestStreak && (
    <RecordCard icon="🎖️" title="רצף הניצחונות הארוך אי פעם" holder={recs.bestStreak.name}
      value={`${recs.bestStreak.maxStreak} ערבים`}
      runner={recs.bestStreak2 && `${recs.bestStreak2.name} · ${recs.bestStreak2.maxStreak} ערבים`}
      third={recs.bestStreak3 && `${recs.bestStreak3.name} · ${recs.bestStreak3.maxStreak} ערבים`} />
  )}
  {recs.lossStreak && (
    <RecordCard icon="🌧️" title="הרצף הקשה אי פעם" holder={recs.lossStreak.name}
      value={`${recs.lossStreak.lossMax} ערבים`} tone={C.loss}
      runner={recs.lossStreak2 && `${recs.lossStreak2.name} · ${recs.lossStreak2.lossMax} ערבים`}
      third={recs.lossStreak3 && `${recs.lossStreak3.name} · ${recs.lossStreak3.lossMax} ערבים`} />
  )}
  {recs.comeback && (
    <RecordCard icon="🎢" title="הקאמבק הגדול" holder={recs.comeback.name}
      value={fmt(recs.comeback.jump)} tone={C.win}
      sub={`מ־${fmt(recs.comeback.from)} ל־${fmt(recs.comeback.to)} בערב אחד`} />
  )}
  {recs.winRate && (
    <RecordCard icon="🎲" title="אחוז הניצחונות הגבוה ביותר" holder={recs.winRate.name}
      value={`${recs.winRate.rate}%`} tone={C.win}
      sub={`מתוך ${recs.winRate.nights} ערבים (מינימום 5)`}
      runner={recs.winRate2 && `${recs.winRate2.name} · ${recs.winRate2.rate}%`}
      third={recs.winRate3 && `${recs.winRate3.name} · ${recs.winRate3.rate}%`} />
  )}
  {recs.bestAvg && (
    <RecordCard icon="📈" title="הממוצע הטוב ביותר לערב" holder={recs.bestAvg.name}
      value={fmt(recs.bestAvg.avg)} tone={C.win}
      sub={`על פני ${recs.bestAvg.nights} ערבים (מינימום 5)`}
      runner={recs.bestAvg2 && `${recs.bestAvg2.name} · ${fmt(recs.bestAvg2.avg)}`}
      third={recs.bestAvg3 && `${recs.bestAvg3.name} · ${fmt(recs.bestAvg3.avg)}`} />
  )}
  {recs.mostWins && recs.mostWins.wins > 0 && (
    <RecordCard icon="✅" title="הכי הרבה ערבים חיוביים" holder={recs.mostWins.name}
      value={`${recs.mostWins.wins} ערבים`} tone={C.win}
      sub={`מתוך ${recs.mostWins.nights}`}
      runner={recs.mostWins2 && recs.mostWins2.wins > 0 &&
        `${recs.mostWins2.name} · ${recs.mostWins2.wins} ערבים`}
      third={recs.mostWins3 && recs.mostWins3.wins > 0 &&
        `${recs.mostWins3.name} · ${recs.mostWins3.wins} ערבים`} />
  )}
  {recs.roller && recs.roller.sd > 0 && (
    <RecordCard icon="🌪️" title="רכבת ההרים — הכי תנודתי" holder={recs.roller.name}
      value={`±${recs.roller.sd}₪`}
      sub="כמה רחוק הוא מהממוצע של עצמו בערב טיפוסי" />
  )}
  {recs.stormyNight && recs.stormyNight.moved > 0 && (
    <RecordCard icon="💸" title="הערב הסוער — הכי הרבה כסף החליף ידיים" holder={dt(recs.stormyNight)}
      value={fmt(recs.stormyNight.moved)} />
  )}
  {recs.duration?.longest && (
    <RecordCard icon="⏳" title="המשחק הכי ארוך" holder={dt(recs.duration.longest)}
      value={recs.duration.longest.label}
      sub={recs.duration.nightsWithTimes
        ? `מ־${recs.duration.nightsWithTimes} ערבים עם התחלה וסיום`
        : undefined}
      runner={recs.duration.longest2 &&
        `${dt(recs.duration.longest2)} · ${recs.duration.longest2.label}`}
      third={recs.duration.longest3 &&
        `${dt(recs.duration.longest3)} · ${recs.duration.longest3.label}`} />
  )}
  {recs.duration?.shortest && (
    <RecordCard icon="🏁" title="המשחק הכי קצר" holder={dt(recs.duration.shortest)}
      value={recs.duration.shortest.label}
      runner={recs.duration.shortest2 &&
        `${dt(recs.duration.shortest2)} · ${recs.duration.shortest2.label}`}
      third={recs.duration.shortest3 &&
        `${dt(recs.duration.shortest3)} · ${recs.duration.shortest3.label}`} />
  )}

    </>
  );
}
