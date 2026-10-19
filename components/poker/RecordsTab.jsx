"use client";

import React, { useMemo, useState } from "react";
import { C } from "../../lib/poker/colors";
import { ScopeChip } from "./ScopeChip";
import { fmt } from "../../lib/poker/format";
import { computeRecords, computePeriodRecords, recordPeriods } from "../../lib/poker/computeRecords";
import { computeHeadToHead, headToHeadYears } from "../../lib/poker/headToHead";
import { computePaymentSpeed } from "../../lib/poker/paymentSpeed";
import { computeBustRecords } from "../../lib/poker/bustRecords";
import { computeAttendance } from "../../lib/poker/attendance";
import { compareSeries, COMPARE_MAX } from "../../lib/poker/compareChart";
import { periodTotals } from "../../lib/poker/totals";
import { Empty } from "./ui";
import { sectionTitle } from "../../lib/poker/festive";
import { PersonalHighlightsCard } from "./PersonalHighlightsCard";
import { PersonalStatsCard } from "./PersonalStatsCard";
import { knownPlayerNames } from "../../lib/poker/personalHighlights";
import { sortPlayerNamesByAttendanceAndRating } from "../../lib/poker/skillRating";
import { RecordCard } from "./records/RecordCard";
import { PeriodSection } from "./records/PeriodSection";
import { LiveSection } from "./records/LiveSection";
import { HeadToHeadSection } from "./records/HeadToHeadSection";
import { CompareSection } from "./records/CompareSection";
import { TipsSection } from "./records/TipsSection";
import { AllTimeSection } from "./records/AllTimeSection";
import { ExtraSection } from "./records/ExtraSection";
import { ChipsSection } from "./records/ChipsSection";
import { CoupleSection } from "./records/CoupleSection";

/* טאב שיאים — חולץ מ-PokerApp.jsx. */
export function RecordsTab({ db, viewerName = null, showMine = false, allowPick = false }) {
  const [mineOnly, setMineOnly] = useState(false);
  const [picked, setPicked] = useState("");
  const recs = useMemo(() => computeRecords(db), [db]);
  const currentYear = new Date().getFullYear();
  const [h2hScope, setH2hScope] = useState(currentYear); // שנה ליריבויות, או "all"
  const h2h = useMemo(
    () => computeHeadToHead(db, h2hScope === "all" ? {} : { year: h2hScope }),
    [db, h2hScope]
  );
  const h2hYearOptions = useMemo(() => {
    const ys = headToHeadYears(db);
    return ys.includes(currentYear) ? ys : [currentYear, ...ys];
  }, [db, currentYear]);
  /* שיאים לפי תקופה: חודש נבחר או שנה נבחרת (ברירת מחדל — התקופה האחרונה עם ערבים) */
  const periods = useMemo(() => recordPeriods(db), [db]);
  const [periodKind, setPeriodKind] = useState("month"); // "month" | "year"
  const [periodMonthKey, setPeriodMonthKey] = useState("");
  const [periodYear, setPeriodYear] = useState(null);
  const effMonthKey = periods.months.some((m) => m.key === periodMonthKey)
    ? periodMonthKey
    : periods.months[0]?.key;
  const effPeriodYear =
    periodYear != null && periods.years.includes(periodYear)
      ? periodYear
      : periods.years[0] ?? currentYear;
  const scoped = useMemo(() => {
    if (periodKind === "month") {
      const m = periods.months.find((x) => x.key === effMonthKey);
      return m ? computePeriodRecords(db, { kind: "month", y: m.y, mo: m.mo }) : null;
    }
    return computePeriodRecords(db, { kind: "year", y: effPeriodYear });
  }, [db, periodKind, periods, effMonthKey, effPeriodYear]);
  const paymentSpeed = useMemo(() => computePaymentSpeed(db), [db]);
  const busts = useMemo(() => computeBustRecords(db), [db]);
  const attendance = useMemo(() => computeAttendance(db), [db]);
  /* השוואת שחקנים: עד 4 קווי מצטבר על ציר אחד; ברירת מחדל — שני המובילים במאזן */
  const [cmpYear, setCmpYear] = useState(currentYear);
  const [cmpPicked, setCmpPicked] = useState(null);
  const cmpDefault = useMemo(() => {
    const totals = periodTotals(db, "all").totals;
    return [...totals].sort((a, b) => b.amount - a.amount).slice(0, 2).map((t) => t.name);
  }, [db]);
  const cmpSelection = cmpPicked ?? cmpDefault;
  const cmp = useMemo(
    () => compareSeries(db, cmpSelection, cmpYear === "all" ? {} : { year: cmpYear }),
    [db, cmpSelection, cmpYear]
  );
  const toggleCmpPlayer = (name) => {
    const cur = cmpPicked ?? cmpDefault;
    if (cur.includes(name)) {
      if (cur.length > 1) setCmpPicked(cur.filter((n) => n !== name));
    } else if (cur.length < COMPARE_MAX) {
      setCmpPicked([...cur, name]);
    }
  };
  // בוחר השחקנים בשיאים אישיים: קודם מי שמגיע הכי הרבה ערבים ומדורג הכי גבוה,
  // בסוף מי שלא מגיע או מדורג נמוך.
  const names = useMemo(
    () => sortPlayerNamesByAttendanceAndRating(knownPlayerNames(db), db),
    [db]
  );
  const personalOf = allowPick && picked ? picked : mineOnly ? viewerName : null;

  if (!recs) return <Empty text="עוד אין ערבים — אין שיאים." />;

  if (showMine && mineOnly) {
    return (
      <div style={{ marginTop: 4 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: "6px 2px 4px", color: C.cream }}>
          ♠ שיאים
        </h2>
        <div style={{ display: "flex", gap: 6, margin: "6px 2px 12px" }}>
          <ScopeChip active={false} onClick={() => setMineOnly(false)}>הכל</ScopeChip>
          <ScopeChip active onClick={() => setMineOnly(true)}>שלי</ScopeChip>
        </div>
        <PersonalStatsCard db={db} playerName={viewerName} />
        <PersonalHighlightsCard db={db} playerName={viewerName} />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 4 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "6px 2px 4px", color: C.cream }}>
        ♠ שיאים
      </h2>
      <p style={{ color: C.dim, fontSize: 12, margin: "0 2px 12px" }}>
        מ־{recs.totalNights} ערבים מתועדים
      </p>
      {showMine && (
        <div style={{ display: "flex", gap: 6, margin: "0 2px 12px" }}>
          <ScopeChip active={!mineOnly} onClick={() => setMineOnly(false)}>הכל</ScopeChip>
          <ScopeChip active={mineOnly} onClick={() => setMineOnly(true)}>שלי</ScopeChip>
        </div>
      )}
      {allowPick && names.length > 0 && (
        <label style={{ display: "block", margin: "0 2px 12px" }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 5 }}>שיאים אישיים של שחקן</div>
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
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
            <option value="">כל השיאים — בחר שחקן</option>
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
      {personalOf && (
        <>
          <PersonalStatsCard db={db} playerName={personalOf} />
          <PersonalHighlightsCard db={db} playerName={personalOf} />
        </>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {recs.lastNight && (
          <>
            <div style={sectionTitle()}>
              ♠ מהערב האחרון · {recs.lastNight.label} · {recs.lastNight.count} שחקנים
            </div>
            {recs.lastNight.top && (
              <RecordCard icon="🌟" title="גיבור הערב" holder={recs.lastNight.top.name}
                value={fmt(recs.lastNight.top.amount)} tone={C.win}
                sub={recs.lastNight.personalBest ? "🚀 שיא אישי חדש — התוצאה הטובה שלו אי פעם" : undefined} />
            )}
            {recs.lastNight.bottom && (
              <RecordCard icon="🥀" title="הנפילה של הערב" holder={recs.lastNight.bottom.name}
                value={fmt(recs.lastNight.bottom.amount)} tone={C.loss} />
            )}
            {recs.lastNight.moved > 0 && (
              <RecordCard icon="💸" title="עבר ידיים בערב" holder="סך כל הזכיות"
                value={fmt(recs.lastNight.moved)} />
            )}
            {recs.lastNight.broken.length > 0 && (
              <div style={{
                background: C.card, border: `1px solid ${C.brass}66`,
                borderRadius: 14, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 12, color: C.brass, fontWeight: 700, marginBottom: 6 }}>
                  🏆 שיאים שנשברו בערב הזה
                </div>
                {recs.lastNight.broken.map((line, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: C.cream, lineHeight: 1.7 }}>{line}</div>
                ))}
              </div>
            )}
            <div style={sectionTitle({ margin: "8px 2px 0" })}>
              🏛 כל הזמנים
            </div>
          </>
        )}
        {recs.monthKing && (
          <RecordCard icon="👑" title={`מלך ${recs.monthLabel}`} holder={recs.monthKing.name}
            value={fmt(recs.monthKing.amount)} tone={C.win}
            runner={recs.monthKing2 && `${recs.monthKing2.name} · ${fmt(recs.monthKing2.amount)}`}
            third={recs.monthKing3 && `${recs.monthKing3.name} · ${fmt(recs.monthKing3.amount)}`} />
        )}
        {recs.yearKing && (
          <RecordCard icon="🏆" title={`מוביל ${recs.yearLabel}`} holder={recs.yearKing.name}
            value={fmt(recs.yearKing.amount)} tone={C.win}
            runner={recs.yearKing2 && `${recs.yearKing2.name} · ${fmt(recs.yearKing2.amount)}`}
            third={recs.yearKing3 && `${recs.yearKing3.name} · ${fmt(recs.yearKing3.amount)}`} />
        )}
        {recs.allKing && (
          <RecordCard icon="🐐" title="מלך כל הזמנים" holder={recs.allKing.name}
            value={fmt(recs.allKing.amount)} tone={C.win}
            runner={recs.allKing2 && `${recs.allKing2.name} · ${fmt(recs.allKing2.amount)}`}
            third={recs.allKing3 && `${recs.allKing3.name} · ${fmt(recs.allKing3.amount)}`} />
        )}

        <PeriodSection db={db} periods={periods} periodKind={periodKind} setPeriodKind={setPeriodKind} effMonthKey={effMonthKey} setPeriodMonthKey={setPeriodMonthKey} effPeriodYear={effPeriodYear} setPeriodYear={setPeriodYear} scoped={scoped} />
        <LiveSection recs={recs} paymentSpeed={paymentSpeed} attendance={attendance} busts={busts} />
        <HeadToHeadSection h2h={h2h} h2hScope={h2hScope} setH2hScope={setH2hScope} h2hYearOptions={h2hYearOptions} />
        <CompareSection cmp={cmp} cmpYear={cmpYear} setCmpYear={setCmpYear} cmpSelection={cmpSelection} toggleCmpPlayer={toggleCmpPlayer} names={names} h2hYearOptions={h2hYearOptions} />
        <TipsSection recs={recs} />
        <AllTimeSection recs={recs} />
        <ExtraSection recs={recs} />
        {recs.attendTop && (
          <RecordCard icon="🪑" title="לא מפספס — הכי הרבה ערבים ברצף" holder={recs.attendTop.name}
            value={`${recs.attendTop.attendMax} ערבים`}
            runner={recs.attendTop2 && `${recs.attendTop2.name} · ${recs.attendTop2.attendMax} ערבים`}
            third={recs.attendTop3 && `${recs.attendTop3.name} · ${recs.attendTop3.attendMax} ערבים`} />
        )}
        {recs.most && (
          <RecordCard icon="🎯" title="המתמיד — הכי הרבה ערבים" holder={recs.most.name}
            value={`${recs.most.nights}`}
            runner={recs.most2 && `${recs.most2.name} · ${recs.most2.nights}`}
            third={recs.most3 && `${recs.most3.name} · ${recs.most3.nights}`} />
        )}

        <ChipsSection recs={recs} />
        <CoupleSection recs={recs} />
      </div>
    </div>
  );
}


