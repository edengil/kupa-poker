"use client";

import React from "react";
import { C } from "../../../lib/poker/colors";
import { fmt } from "../../../lib/poker/format";
import { sectionTitle } from "../../../lib/poker/festive";
import { formatNightClock, fmtPct } from "../../../lib/poker/extraRecords";
import { durWords } from "../../../lib/poker/helpers";
import { RecordCard, recordDate as dt } from "./RecordCard";

/* קצב, קנייה ואירוח (recs.extra) — חולץ מ־RecordsTab. */
export function ExtraSection({ recs }) {
  return (
    <>
  {recs.extra && (
    <>
      <div style={sectionTitle({ margin: "12px 2px 0" })}>
        📊 קצב, קנייה ואירוח
      </div>
      {recs.extra.hourly && (
        <RecordCard icon="⏳" title="ממוצע לשעה"
          holder={recs.extra.hourly.name}
          value={`${fmt(recs.extra.hourly.avgHourly)} לשעה`}
          tone={recs.extra.hourly.avgHourly >= 0 ? C.win : C.loss}
          sub={`מ־${recs.extra.hourly.hourlyNights} ערבים עם התחלה וסיום`}
          runner={recs.extra.hourly2 &&
            `${recs.extra.hourly2.name} · ${fmt(recs.extra.hourly2.avgHourly)} לשעה`}
          third={recs.extra.hourly3 &&
            `${recs.extra.hourly3.name} · ${fmt(recs.extra.hourly3.avgHourly)} לשעה`} />
      )}
      {recs.extra.latest && (
        <RecordCard icon="🌙" title="מגיע הכי מאוחר"
          holder={recs.extra.latest.name}
          value={formatNightClock(recs.extra.latest.avgFirstMins)}
          sub={`שעת כניסה ראשונה ממוצעת · ${recs.extra.latest.arrivalNights} ערבים`}
          runner={recs.extra.latest2 &&
            `${recs.extra.latest2.name} · ${formatNightClock(recs.extra.latest2.avgFirstMins)}`}
          third={recs.extra.latest3 &&
            `${recs.extra.latest3.name} · ${formatNightClock(recs.extra.latest3.avgFirstMins)}`} />
      )}
      {recs.extra.earliest && recs.extra.earliest.name !== recs.extra.latest?.name && (
        <RecordCard icon="🌅" title="מגיע הכי מוקדם"
          holder={recs.extra.earliest.name}
          value={formatNightClock(recs.extra.earliest.avgFirstMins)}
          sub={`שעת כניסה ראשונה ממוצעת · ${recs.extra.earliest.arrivalNights} ערבים`} />
      )}
      {recs.extra.roi && (
        <RecordCard icon="📊" title="רווח ביחס לקנייה"
          holder={recs.extra.roi.name}
          value={fmtPct(recs.extra.roi.lifetimeRoi)}
          tone={recs.extra.roi.lifetimeRoi >= 0 ? C.win : C.loss}
          sub="נטו חלקי הקנייה על כל ההיסטוריה. קנייה 150₪ וסיום +100₪ = +67%."
          runner={recs.extra.roi2 &&
            `${recs.extra.roi2.name} · ${fmtPct(recs.extra.roi2.lifetimeRoi)}`}
          third={recs.extra.roi3 &&
            `${recs.extra.roi3.name} · ${fmtPct(recs.extra.roi3.lifetimeRoi)}`} />
      )}
      {recs.extra.pot && (
        <RecordCard icon="🏦" title="שיא קופה"
          holder={dt(recs.extra.pot)}
          value={`${fmt(recs.extra.pot.buyin).replace(/^[+−]/, "")}₪`}
          sub={`סך הקניות בערב · ${recs.extra.pot.players} שחקנים`}
          runner={recs.extra.pot2 &&
            `${dt(recs.extra.pot2)} · ${fmt(recs.extra.pot2.buyin).replace(/^[+−]/, "")}₪`}
          third={recs.extra.pot3 &&
            `${dt(recs.extra.pot3)} · ${fmt(recs.extra.pot3.buyin).replace(/^[+−]/, "")}₪`} />
      )}
      {recs.extra.hostTop && (
        <RecordCard icon="🏠" title="נטו כשמארחים אצלך"
          holder={recs.extra.hostTop.name}
          value={`${recs.extra.hostTop.n} פעמים · ${fmt(recs.extra.hostTop.net)}`}
          tone={recs.extra.hostTop.net >= 0 ? C.win : C.loss}
          sub="מי שאירח הכי הרבה · נטו בערבים אצלו"
          runner={recs.extra.hostTop2 &&
            `${recs.extra.hostTop2.name} · ${recs.extra.hostTop2.n} פעמים · נטו ${fmt(recs.extra.hostTop2.net)}`}
          third={recs.extra.hostTop3 &&
            `${recs.extra.hostTop3.name} · ${recs.extra.hostTop3.n} פעמים · נטו ${fmt(recs.extra.hostTop3.net)}`} />
      )}
      {recs.extra.highBuyLoser && (
        <RecordCard icon="🛒" title="קונה הרבה ומפסיד"
          holder={recs.extra.highBuyLoser.name}
          value={`${fmt(recs.extra.highBuyLoser.avgBuyin).replace(/^[+−]/, "")}₪ קנייה ממוצעת`}
          tone={C.loss}
          sub={`נטו כולל ${fmt(recs.extra.highBuyLoser.net)} · ${recs.extra.highBuyLoser.buyinNights} ערבים`} />
      )}
      {recs.extra.lowBuyWinner && (
        <RecordCard icon="🍀" title="קונה מעט ומרוויח"
          holder={recs.extra.lowBuyWinner.name}
          value={`${fmt(recs.extra.lowBuyWinner.avgBuyin).replace(/^[+−]/, "")}₪ קנייה ממוצעת`}
          tone={C.win}
          sub={`נטו כולל ${fmt(recs.extra.lowBuyWinner.net)} · ${recs.extra.lowBuyWinner.buyinNights} ערבים`} />
      )}
      {recs.extra.longestDay && (
        <RecordCard icon="📆" title="היום בשבוע הכי ארוך לקבוצה"
          holder={`יום ${recs.extra.longestDay.day}`}
          value={durWords(recs.extra.longestDay.avgMs)}
          sub={`ממוצע משך · ${recs.extra.longestDay.n} ערבים · לפי יום התחלה`} />
      )}
      {recs.extra.richestDay && (
        <RecordCard icon="💰" title="היום בשבוע הכי פעיל לקבוצה"
          holder={`יום ${recs.extra.richestDay.day}`}
          value={fmt(recs.extra.richestDay.avgMoved)}
          sub={`ממוצע כסף שהחליף ידיים · ${recs.extra.richestDay.n} ערבים`} />
      )}
      {recs.extra.hero && (
        <RecordCard icon="🌟" title="הכי הרבה פעמים גיבור הערב"
          holder={recs.extra.hero.name}
          value={`${recs.extra.hero.hero} פעמים`}
          sub="הנטו הגבוה בערב"
          runner={recs.extra.hero2 &&
            `${recs.extra.hero2.name} · ${recs.extra.hero2.hero} פעמים`}
          third={recs.extra.hero3 &&
            `${recs.extra.hero3.name} · ${recs.extra.hero3.hero} פעמים`} />
      )}
    </>
  )}
    </>
  );
}
