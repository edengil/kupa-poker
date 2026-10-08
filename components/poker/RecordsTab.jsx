"use client";

import React, { useMemo, useState } from "react";
import { C } from "../../lib/poker/colors";
import { ScopeChip } from "./ScopeChip";
import { fmt, MONTHS } from "../../lib/poker/format";
import { computeRecords, computePeriodRecords, recordPeriods } from "../../lib/poker/computeRecords";
import { computeHeadToHead, headToHeadYears } from "../../lib/poker/headToHead";
import { computePaymentSpeed, formatPaymentDelay } from "../../lib/poker/paymentSpeed";
import { computeBustRecords, formatSurvivalMs } from "../../lib/poker/bustRecords";
import { computeAttendance } from "../../lib/poker/attendance";
import { compareSeries, COMPARE_MAX } from "../../lib/poker/compareChart";
import { CompareChart } from "./CompareChart";
import { SummaryCardButton } from "./SummaryCardButton";
import { SERIES_COLORS } from "../../lib/poker/colors";
import { periodTotals } from "../../lib/poker/totals";
import { Empty } from "./ui";
import { festiveCardSoft, sectionTitle } from "../../lib/poker/festive";
import { PersonalHighlightsCard } from "./PersonalHighlightsCard";
import { PersonalStatsCard } from "./PersonalStatsCard";
import { knownPlayerNames } from "../../lib/poker/personalHighlights";
import { sortPlayerNamesByAttendanceAndRating } from "../../lib/poker/skillRating";
import { formatNightClock, fmtPct } from "../../lib/poker/extraRecords";
import { durWords } from "../../lib/poker/helpers";

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

  const Card = ({ icon, title, holder, value, tone, sub, runner, third }) => (
    <div style={{
      ...festiveCardSoft,
      borderRadius: 14,
      padding: "13px 14px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      boxShadow: `0 3px 12px ${C.feltDeep}33`,
    }}>
      <span style={{ fontSize: 26, flex: "0 0 auto" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.dim }}>{title}</div>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: C.cream }}>{holder}</div>
        {sub && <div style={{ fontSize: 11.5, color: C.dim }}>{sub}</div>}
        {runner && (
          <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>🥈 {runner}</div>
        )}
        {third && (
          <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>🥉 {third}</div>
        )}
      </div>
      <b style={{
        fontSize: 16,
        color: tone || C.brass,
        fontVariantNumeric: "tabular-nums",
        flex: "0 0 auto",
      }}>{value}</b>
    </div>
  );

  const dt = (r) => `${r.d}.${r.mo}.${String(r.y).slice(2)}`;

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
              <Card icon="🌟" title="גיבור הערב" holder={recs.lastNight.top.name}
                value={fmt(recs.lastNight.top.amount)} tone={C.win}
                sub={recs.lastNight.personalBest ? "🚀 שיא אישי חדש — התוצאה הטובה שלו אי פעם" : undefined} />
            )}
            {recs.lastNight.bottom && (
              <Card icon="🥀" title="הנפילה של הערב" holder={recs.lastNight.bottom.name}
                value={fmt(recs.lastNight.bottom.amount)} tone={C.loss} />
            )}
            {recs.lastNight.moved > 0 && (
              <Card icon="💸" title="עבר ידיים בערב" holder="סך כל הזכיות"
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
          <Card icon="👑" title={`מלך ${recs.monthLabel}`} holder={recs.monthKing.name}
            value={fmt(recs.monthKing.amount)} tone={C.win}
            runner={recs.monthKing2 && `${recs.monthKing2.name} · ${fmt(recs.monthKing2.amount)}`}
            third={recs.monthKing3 && `${recs.monthKing3.name} · ${fmt(recs.monthKing3.amount)}`} />
        )}
        {recs.yearKing && (
          <Card icon="🏆" title={`מוביל ${recs.yearLabel}`} holder={recs.yearKing.name}
            value={fmt(recs.yearKing.amount)} tone={C.win}
            runner={recs.yearKing2 && `${recs.yearKing2.name} · ${fmt(recs.yearKing2.amount)}`}
            third={recs.yearKing3 && `${recs.yearKing3.name} · ${fmt(recs.yearKing3.amount)}`} />
        )}
        {recs.allKing && (
          <Card icon="🐐" title="מלך כל הזמנים" holder={recs.allKing.name}
            value={fmt(recs.allKing.amount)} tone={C.win}
            runner={recs.allKing2 && `${recs.allKing2.name} · ${fmt(recs.allKing2.amount)}`}
            third={recs.allKing3 && `${recs.allKing3.name} · ${fmt(recs.allKing3.amount)}`} />
        )}

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
                  <Card icon="👑" title={`מלך ${scoped.label}`} holder={scoped.recs.monthKing.name}
                    value={fmt(scoped.recs.monthKing.amount)} tone={C.win}
                    runner={scoped.recs.monthKing2 && `${scoped.recs.monthKing2.name} · ${fmt(scoped.recs.monthKing2.amount)}`}
                    third={scoped.recs.monthKing3 && `${scoped.recs.monthKing3.name} · ${fmt(scoped.recs.monthKing3.amount)}`} />
                )}
                {scoped.recs.tips?.monthKing && (
                  <Card icon="🏅" title={`מלך הטיפים · ${scoped.label}`} holder={scoped.recs.tips.monthKing.name}
                    value={`${scoped.recs.tips.monthKing.chips} ג'`} tone={C.win}
                    runner={scoped.recs.tips.monthKing2 && `${scoped.recs.tips.monthKing2.name} · ${scoped.recs.tips.monthKing2.chips} ג'`}
                    third={scoped.recs.tips.monthKing3 && `${scoped.recs.tips.monthKing3.name} · ${scoped.recs.tips.monthKing3.chips} ג'`} />
                )}
              </>
            ) : (
              <>
                {scoped.recs.yearKing && (
                  <Card icon="🏆" title={`מוביל ${scoped.label}`} holder={scoped.recs.yearKing.name}
                    value={fmt(scoped.recs.yearKing.amount)} tone={C.win}
                    runner={scoped.recs.yearKing2 && `${scoped.recs.yearKing2.name} · ${fmt(scoped.recs.yearKing2.amount)}`}
                    third={scoped.recs.yearKing3 && `${scoped.recs.yearKing3.name} · ${fmt(scoped.recs.yearKing3.amount)}`} />
                )}
                {scoped.recs.tips?.allKing && (
                  <Card icon="🏅" title={`מלך הטיפים · ${scoped.label}`} holder={scoped.recs.tips.allKing.name}
                    value={`${scoped.recs.tips.allKing.chips} ג'`} tone={C.win}
                    runner={scoped.recs.tips.allKing2 && `${scoped.recs.tips.allKing2.name} · ${scoped.recs.tips.allKing2.chips} ג'`}
                    third={scoped.recs.tips.allKing3 && `${scoped.recs.tips.allKing3.name} · ${scoped.recs.tips.allKing3.chips} ג'`} />
                )}
              </>
            )}
            {scoped.recs.bestNight && (
              <Card icon="🔥" title={`ערב השיא · ${scoped.label}`} holder={scoped.recs.bestNight.name}
                value={fmt(scoped.recs.bestNight.amount)} tone={C.win} sub={dt(scoped.recs.bestNight)}
                runner={scoped.recs.bestNight2 && `${scoped.recs.bestNight2.name} · ${fmt(scoped.recs.bestNight2.amount)} · ${dt(scoped.recs.bestNight2)}`}
                third={scoped.recs.bestNight3 && `${scoped.recs.bestNight3.name} · ${fmt(scoped.recs.bestNight3.amount)} · ${dt(scoped.recs.bestNight3)}`} />
            )}
            {scoped.recs.worstNight && scoped.recs.worstNight.amount < 0 && (
              <Card icon="🥶" title={`הערב הקשה · ${scoped.label}`} holder={scoped.recs.worstNight.name}
                value={fmt(scoped.recs.worstNight.amount)} tone={C.loss} sub={dt(scoped.recs.worstNight)} />
            )}
            {scoped.recs.most && (
              <Card icon="🎯" title={`הכי הרבה ערבים · ${scoped.label}`} holder={scoped.recs.most.name}
                value={`${scoped.recs.most.nights}`}
                runner={scoped.recs.most2 && `${scoped.recs.most2.name} · ${scoped.recs.most2.nights}`}
                third={scoped.recs.most3 && `${scoped.recs.most3.name} · ${scoped.recs.most3.nights}`} />
            )}
            {scoped.recs.mostWins && scoped.recs.mostWins.wins > 0 && (
              <Card icon="✅" title={`הכי הרבה ערבים חיוביים · ${scoped.label}`} holder={scoped.recs.mostWins.name}
                value={`${scoped.recs.mostWins.wins} ערבים`} tone={C.win}
                runner={scoped.recs.mostWins2 && scoped.recs.mostWins2.wins > 0 &&
                  `${scoped.recs.mostWins2.name} · ${scoped.recs.mostWins2.wins} ערבים`}
                third={scoped.recs.mostWins3 && scoped.recs.mostWins3.wins > 0 &&
                  `${scoped.recs.mostWins3.name} · ${scoped.recs.mostWins3.wins} ערבים`} />
            )}
            {periodKind === "month" ? (
              <>
                {scoped.recs.chips?.bestMonth && (
                  <Card icon="🪙" title={`שיא הכי הרבה ג'יטונים בסיום · ${scoped.label}`}
                    holder={scoped.recs.chips.bestMonth.name}
                    value={`${scoped.recs.chips.bestMonth.chips} ג'`} tone={C.win}
                    sub={dt(scoped.recs.chips.bestMonth)} />
                )}
                {scoped.recs.coupleFills?.monthTop && (
                  <Card icon="🤝" title={`מילוי זוגי · ${scoped.label}`}
                    holder={scoped.recs.coupleFills.monthTop.label}
                    value={`${scoped.recs.coupleFills.monthTop.chips} ג'`}
                    sub={`${scoped.recs.coupleFills.monthTop.count} מילויים · ${scoped.recs.coupleFills.monthTop.couple || ""}`} />
                )}
              </>
            ) : (
              <>
                {scoped.recs.chips?.bestYear && (
                  <Card icon="🪙" title={`שיא הכי הרבה ג'יטונים בסיום · ${scoped.label}`}
                    holder={scoped.recs.chips.bestYear.name}
                    value={`${scoped.recs.chips.bestYear.chips} ג'`} tone={C.win}
                    sub={dt(scoped.recs.chips.bestYear)} />
                )}
                {scoped.recs.coupleFills?.allTop && (
                  <Card icon="🔗" title={`מילוי זוגי · ${scoped.label}`}
                    holder={scoped.recs.coupleFills.allTop.label}
                    value={`${scoped.recs.coupleFills.allTop.chips} ג'`}
                    sub={`${scoped.recs.coupleFills.allTop.count} פעמים · ${scoped.recs.coupleFills.allTop.couple || ""}`} />
                )}
              </>
            )}
          </>
        )}

        {/* תשלום, תנודתיות מתגלגלת, הגעה וערבי לייב */}
        <div style={sectionTitle({ margin: "12px 2px 0" })}>
          ⚡ תשלום, הגעה ולייב
        </div>
        {paymentSpeed.fastest ? (
          <Card icon="⚡" title="המשלם המהיר" holder={paymentSpeed.fastest.name}
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
          <Card icon="🎢" title="תנודתיות · 30 הימים האחרונים" holder={recs.rollingRoller.name}
            value={`±${recs.rollingRoller.sd}₪`}
            sub={`${recs.rollingRoller.nights} ערבים בחלון המתגלגל`} />
        )}
        {attendance.enough && attendance.mostReliable ? (
          <Card icon="🎯" title="אמינות הגעה" holder={attendance.mostReliable.name}
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
          <Card icon="🏃" title="היציאה המהירה ביותר · ערבי לייב בלבד" holder={busts.fastestExit.name}
            value={formatSurvivalMs(busts.fastestExit.survivalMs)}
            sub={`מ־${busts.liveNights} ערבי לייב עם יומן פעולות`} />
        )}
        {busts?.ironMan && (
          <Card icon="🦾" title="איש הברזל · ערבי לייב בלבד" holder={busts.ironMan.name}
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
            <Card
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

        {/* השוואת שחקנים — קווי מצטבר של עד 4 שחקנים על ציר ערבים אחד */}
        <div style={sectionTitle({ margin: "12px 2px 0" })}>
          📈 השוואת שחקנים · {cmpYear === "all" ? "כל הזמנים" : cmpYear}
        </div>
        <p style={{ margin: "0 2px 8px", color: C.dim, fontSize: 11.5, lineHeight: 1.6 }}>
          בחרו עד {COMPARE_MAX} שחקנים וראו את מרוץ הרווח המצטבר ערב־ערב — מי עקף את מי ומתי.
        </p>
        <label style={{ display: "block", margin: "0 2px 10px" }}>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 5 }}>שנה להשוואה</div>
          <select
            value={String(cmpYear)}
            onChange={(e) =>
              setCmpYear(e.target.value === "all" ? "all" : Number(e.target.value))
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "0 2px 10px" }}>
          {names.map((n) => {
            const idx = cmpSelection.indexOf(n);
            const active = idx >= 0;
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggleCmpPlayer(n)}
                aria-pressed={active}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  border: `1px solid ${active ? SERIES_COLORS[idx % SERIES_COLORS.length] : C.line}`,
                  background: active ? C.cardHi : "transparent",
                  color: active ? C.cream : C.dim,
                  fontWeight: active ? 700 : 400,
                }}
              >
                {active && (
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: SERIES_COLORS[idx % SERIES_COLORS.length],
                      display: "inline-block",
                    }}
                  />
                )}
                {n}
              </button>
            );
          })}
        </div>
        {cmp.nights.length >= 2 && cmp.series.length > 0 ? (
          <div style={{ ...festiveCardSoft, borderRadius: 14, padding: "12px 10px 6px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 2px 8px" }}>
              {cmp.series.map((s, si) => (
                <span
                  key={s.name}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    color: C.cream,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 999,
                      background: SERIES_COLORS[si % SERIES_COLORS.length],
                      display: "inline-block",
                    }}
                  />
                  {s.name}
                  <b
                    style={{
                      color: s.final >= 0 ? C.win : C.loss,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmt(s.final)}
                  </b>
                </span>
              ))}
            </div>
            <CompareChart nights={cmp.nights} series={cmp.series} />
          </div>
        ) : (
          <div style={{
            background: `linear-gradient(165deg, ${C.card} 0%, ${C.feltDeep} 100%)`,
            border: `1px dashed ${C.brass}55`,
            borderRadius: 14,
            padding: "12px 14px", fontSize: 13, color: C.dim, lineHeight: 1.6,
          }}>
            📈 אין מספיק ערבים בתקופה הזאת בשביל גרף השוואה — צריך לפחות שני ערבים.
          </div>
        )}

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
              <Card icon="💎" title="הטיפ הבודד הגדול ביותר" holder={recs.tips.biggestTip.name}
                value={`${recs.tips.biggestTip.amount} ג'`} tone={C.win}
                sub={dt(recs.tips.biggestTip)}
                runner={recs.tips.biggestTip2 &&
                  `${recs.tips.biggestTip2.name} · ${recs.tips.biggestTip2.amount} ג' · ${dt(recs.tips.biggestTip2)}`}
                third={recs.tips.biggestTip3 &&
                  `${recs.tips.biggestTip3.name} · ${recs.tips.biggestTip3.amount} ג' · ${dt(recs.tips.biggestTip3)}`} />
            )}
            {recs.tips.mostTipsNight && (
              <Card icon="🔁" title="הכי הרבה טיפים בערב אחד" holder={recs.tips.mostTipsNight.name}
                value={`${recs.tips.mostTipsNight.count} טיפים`}
                sub={dt(recs.tips.mostTipsNight)}
                runner={recs.tips.mostTipsNight2 &&
                  `${recs.tips.mostTipsNight2.name} · ${recs.tips.mostTipsNight2.count} טיפים · ${dt(recs.tips.mostTipsNight2)}`} />
            )}
            {recs.tips.mostTipChipsNight && (
              <Card icon="🪙" title="הכי הרבה ג'יטוני טיפ בערב אחד" holder={recs.tips.mostTipChipsNight.name}
                value={`${recs.tips.mostTipChipsNight.chips} ג'`}
                sub={dt(recs.tips.mostTipChipsNight)}
                runner={recs.tips.mostTipChipsNight2 &&
                  `${recs.tips.mostTipChipsNight2.name} · ${recs.tips.mostTipChipsNight2.chips} ג' · ${dt(recs.tips.mostTipChipsNight2)}`}
                third={recs.tips.mostTipChipsNight3 &&
                  `${recs.tips.mostTipChipsNight3.name} · ${recs.tips.mostTipChipsNight3.chips} ג' · ${dt(recs.tips.mostTipChipsNight3)}`} />
            )}
            {recs.tips.lastTipsNight && (
              <Card icon="🕘" title="טיפי הערב האחרון"
                holder={recs.tips.lastTipsNight.leader ? recs.tips.lastTipsNight.leader.name : "ללא מוביל"}
                value={`${recs.tips.lastTipsNight.chips} ג'`}
                sub={`${dt(recs.tips.lastTipsNight)} · ${recs.tips.lastTipsNight.count} טיפים`} />
            )}
            {recs.tips.monthKing && (
              <Card icon="🏅" title={`מלך הטיפים · ${recs.tips.monthLabel}`}
                holder={recs.tips.monthKing.name}
                value={`${recs.tips.monthKing.chips} ג'`} tone={C.win}
                runner={recs.tips.monthKing2 &&
                  `${recs.tips.monthKing2.name} · ${recs.tips.monthKing2.chips} ג'`}
                third={recs.tips.monthKing3 &&
                  `${recs.tips.monthKing3.name} · ${recs.tips.monthKing3.chips} ג'`} />
            )}
            {recs.tips.allKing && (
              <Card icon="🐐" title="מלך הטיפים · כל הזמנים" holder={recs.tips.allKing.name}
                value={`${recs.tips.allKing.chips} ג'`} tone={C.win}
                runner={recs.tips.allKing2 &&
                  `${recs.tips.allKing2.name} · ${recs.tips.allKing2.chips} ג'`}
                third={recs.tips.allKing3 &&
                  `${recs.tips.allKing3.name} · ${recs.tips.allKing3.chips} ג'`} />
            )}
          </>
        )}

        {recs.crownKing && (
          <Card icon="🥇" title="מלך המלכים — הכי הרבה חודשים במקום הראשון" holder={recs.crownKing.name}
            value={`${recs.crownKing.count} כתרים`}
            runner={recs.crownKing2 && `${recs.crownKing2.name} · ${recs.crownKing2.count} כתרים`}
            third={recs.crownKing3 && `${recs.crownKing3.name} · ${recs.crownKing3.count} כתרים`} />
        )}
        {recs.bestNight && (
          <Card icon="🔥" title="ערב השיא בהיסטוריה" holder={recs.bestNight.name}
            value={fmt(recs.bestNight.amount)} tone={C.win} sub={dt(recs.bestNight)}
            runner={recs.bestNight2 && `${recs.bestNight2.name} · ${fmt(recs.bestNight2.amount)} · ${dt(recs.bestNight2)}`}
            third={recs.bestNight3 && `${recs.bestNight3.name} · ${fmt(recs.bestNight3.amount)} · ${dt(recs.bestNight3)}`} />
        )}
        {recs.worstNight && recs.worstNight.amount < 0 && (
          <Card icon="🥶" title="הערב הקשה בהיסטוריה" holder={recs.worstNight.name}
            value={fmt(recs.worstNight.amount)} tone={C.loss} sub={dt(recs.worstNight)}
            runner={recs.worstNight2 && recs.worstNight2.amount < 0 &&
              `${recs.worstNight2.name} · ${fmt(recs.worstNight2.amount)} · ${dt(recs.worstNight2)}`}
            third={recs.worstNight3 && recs.worstNight3.amount < 0 &&
              `${recs.worstNight3.name} · ${fmt(recs.worstNight3.amount)} · ${dt(recs.worstNight3)}`} />
        )}
        {recs.bestMonth && (
          <Card icon="📅" title="החודש הטוב אי פעם" holder={recs.bestMonth.name}
            value={fmt(recs.bestMonth.amount)} tone={C.win}
            sub={`${MONTHS[recs.bestMonth.mo - 1]} ${recs.bestMonth.y}`} />
        )}
        {recs.bestYear && (
          <Card icon="🗓️" title="השנה הטובה אי פעם" holder={recs.bestYear.name}
            value={fmt(recs.bestYear.amount)} tone={C.win} sub={`${recs.bestYear.y}`} />
        )}
        {recs.liveStreak && (
          <Card icon="⚡" title="רצף ניצחונות פעיל" holder={recs.liveStreak.name}
            value={`${recs.liveStreak.tail} ערבים`} />
        )}
        {recs.bestStreak && (
          <Card icon="🎖️" title="רצף הניצחונות הארוך אי פעם" holder={recs.bestStreak.name}
            value={`${recs.bestStreak.maxStreak} ערבים`}
            runner={recs.bestStreak2 && `${recs.bestStreak2.name} · ${recs.bestStreak2.maxStreak} ערבים`}
            third={recs.bestStreak3 && `${recs.bestStreak3.name} · ${recs.bestStreak3.maxStreak} ערבים`} />
        )}
        {recs.lossStreak && (
          <Card icon="🌧️" title="הרצף הקשה אי פעם" holder={recs.lossStreak.name}
            value={`${recs.lossStreak.lossMax} ערבים`} tone={C.loss}
            runner={recs.lossStreak2 && `${recs.lossStreak2.name} · ${recs.lossStreak2.lossMax} ערבים`}
            third={recs.lossStreak3 && `${recs.lossStreak3.name} · ${recs.lossStreak3.lossMax} ערבים`} />
        )}
        {recs.comeback && (
          <Card icon="🎢" title="הקאמבק הגדול" holder={recs.comeback.name}
            value={fmt(recs.comeback.jump)} tone={C.win}
            sub={`מ־${fmt(recs.comeback.from)} ל־${fmt(recs.comeback.to)} בערב אחד`} />
        )}
        {recs.winRate && (
          <Card icon="🎲" title="אחוז הניצחונות הגבוה ביותר" holder={recs.winRate.name}
            value={`${recs.winRate.rate}%`} tone={C.win}
            sub={`מתוך ${recs.winRate.nights} ערבים (מינימום 5)`}
            runner={recs.winRate2 && `${recs.winRate2.name} · ${recs.winRate2.rate}%`}
            third={recs.winRate3 && `${recs.winRate3.name} · ${recs.winRate3.rate}%`} />
        )}
        {recs.bestAvg && (
          <Card icon="📈" title="הממוצע הטוב ביותר לערב" holder={recs.bestAvg.name}
            value={fmt(recs.bestAvg.avg)} tone={C.win}
            sub={`על פני ${recs.bestAvg.nights} ערבים (מינימום 5)`}
            runner={recs.bestAvg2 && `${recs.bestAvg2.name} · ${fmt(recs.bestAvg2.avg)}`}
            third={recs.bestAvg3 && `${recs.bestAvg3.name} · ${fmt(recs.bestAvg3.avg)}`} />
        )}
        {recs.mostWins && recs.mostWins.wins > 0 && (
          <Card icon="✅" title="הכי הרבה ערבים חיוביים" holder={recs.mostWins.name}
            value={`${recs.mostWins.wins} ערבים`} tone={C.win}
            sub={`מתוך ${recs.mostWins.nights}`}
            runner={recs.mostWins2 && recs.mostWins2.wins > 0 &&
              `${recs.mostWins2.name} · ${recs.mostWins2.wins} ערבים`}
            third={recs.mostWins3 && recs.mostWins3.wins > 0 &&
              `${recs.mostWins3.name} · ${recs.mostWins3.wins} ערבים`} />
        )}
        {recs.roller && recs.roller.sd > 0 && (
          <Card icon="🌪️" title="רכבת ההרים — הכי תנודתי" holder={recs.roller.name}
            value={`±${recs.roller.sd}₪`}
            sub="כמה רחוק הוא מהממוצע של עצמו בערב טיפוסי" />
        )}
        {recs.stormyNight && recs.stormyNight.moved > 0 && (
          <Card icon="💸" title="הערב הסוער — הכי הרבה כסף החליף ידיים" holder={dt(recs.stormyNight)}
            value={fmt(recs.stormyNight.moved)} />
        )}
        {recs.duration?.longest && (
          <Card icon="⏳" title="המשחק הכי ארוך" holder={dt(recs.duration.longest)}
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
          <Card icon="🏁" title="המשחק הכי קצר" holder={dt(recs.duration.shortest)}
            value={recs.duration.shortest.label}
            runner={recs.duration.shortest2 &&
              `${dt(recs.duration.shortest2)} · ${recs.duration.shortest2.label}`}
            third={recs.duration.shortest3 &&
              `${dt(recs.duration.shortest3)} · ${recs.duration.shortest3.label}`} />
        )}

        {recs.extra && (
          <>
            <div style={sectionTitle({ margin: "12px 2px 0" })}>
              📊 קצב, קנייה ואירוח
            </div>
            {recs.extra.hourly && (
              <Card icon="⏳" title="ממוצע לשעה"
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
              <Card icon="🌙" title="מגיע הכי מאוחר"
                holder={recs.extra.latest.name}
                value={formatNightClock(recs.extra.latest.avgFirstMins)}
                sub={`שעת כניסה ראשונה ממוצעת · ${recs.extra.latest.arrivalNights} ערבים`}
                runner={recs.extra.latest2 &&
                  `${recs.extra.latest2.name} · ${formatNightClock(recs.extra.latest2.avgFirstMins)}`}
                third={recs.extra.latest3 &&
                  `${recs.extra.latest3.name} · ${formatNightClock(recs.extra.latest3.avgFirstMins)}`} />
            )}
            {recs.extra.earliest && recs.extra.earliest.name !== recs.extra.latest?.name && (
              <Card icon="🌅" title="מגיע הכי מוקדם"
                holder={recs.extra.earliest.name}
                value={formatNightClock(recs.extra.earliest.avgFirstMins)}
                sub={`שעת כניסה ראשונה ממוצעת · ${recs.extra.earliest.arrivalNights} ערבים`} />
            )}
            {recs.extra.roi && (
              <Card icon="📊" title="רווח ביחס לקנייה"
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
              <Card icon="🏦" title="שיא קופה"
                holder={dt(recs.extra.pot)}
                value={`${fmt(recs.extra.pot.buyin).replace(/^[+−]/, "")}₪`}
                sub={`סך הקניות בערב · ${recs.extra.pot.players} שחקנים`}
                runner={recs.extra.pot2 &&
                  `${dt(recs.extra.pot2)} · ${fmt(recs.extra.pot2.buyin).replace(/^[+−]/, "")}₪`}
                third={recs.extra.pot3 &&
                  `${dt(recs.extra.pot3)} · ${fmt(recs.extra.pot3.buyin).replace(/^[+−]/, "")}₪`} />
            )}
            {recs.extra.hostTop && (
              <Card icon="🏠" title="נטו כשמארחים אצלך"
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
              <Card icon="🛒" title="קונה הרבה ומפסיד"
                holder={recs.extra.highBuyLoser.name}
                value={`${fmt(recs.extra.highBuyLoser.avgBuyin).replace(/^[+−]/, "")}₪ קנייה ממוצעת`}
                tone={C.loss}
                sub={`נטו כולל ${fmt(recs.extra.highBuyLoser.net)} · ${recs.extra.highBuyLoser.buyinNights} ערבים`} />
            )}
            {recs.extra.lowBuyWinner && (
              <Card icon="🍀" title="קונה מעט ומרוויח"
                holder={recs.extra.lowBuyWinner.name}
                value={`${fmt(recs.extra.lowBuyWinner.avgBuyin).replace(/^[+−]/, "")}₪ קנייה ממוצעת`}
                tone={C.win}
                sub={`נטו כולל ${fmt(recs.extra.lowBuyWinner.net)} · ${recs.extra.lowBuyWinner.buyinNights} ערבים`} />
            )}
            {recs.extra.longestDay && (
              <Card icon="📆" title="היום בשבוע הכי ארוך לקבוצה"
                holder={`יום ${recs.extra.longestDay.day}`}
                value={durWords(recs.extra.longestDay.avgMs)}
                sub={`ממוצע משך · ${recs.extra.longestDay.n} ערבים · לפי יום התחלה`} />
            )}
            {recs.extra.richestDay && (
              <Card icon="💰" title="היום בשבוע הכי פעיל לקבוצה"
                holder={`יום ${recs.extra.richestDay.day}`}
                value={fmt(recs.extra.richestDay.avgMoved)}
                sub={`ממוצע כסף שהחליף ידיים · ${recs.extra.richestDay.n} ערבים`} />
            )}
            {recs.extra.hero && (
              <Card icon="🌟" title="הכי הרבה פעמים גיבור הערב"
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
        {recs.attendTop && (
          <Card icon="🪑" title="לא מפספס — הכי הרבה ערבים ברצף" holder={recs.attendTop.name}
            value={`${recs.attendTop.attendMax} ערבים`}
            runner={recs.attendTop2 && `${recs.attendTop2.name} · ${recs.attendTop2.attendMax} ערבים`}
            third={recs.attendTop3 && `${recs.attendTop3.name} · ${recs.attendTop3.attendMax} ערבים`} />
        )}
        {recs.most && (
          <Card icon="🎯" title="המתמיד — הכי הרבה ערבים" holder={recs.most.name}
            value={`${recs.most.nights}`}
            runner={recs.most2 && `${recs.most2.name} · ${recs.most2.nights}`}
            third={recs.most3 && `${recs.most3.name} · ${recs.most3.nights}`} />
        )}

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
              <Card icon="🪙" title={`שיא הכי הרבה ג'יטונים בסיום · ${recs.chips.monthLabel}`}
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
              <Card icon="🪙" title={`שיא הכי הרבה ג'יטונים בסיום · ${recs.chips.yearLabel}`}
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
              <Card icon="🪙" title="שיא הכי הרבה ג'יטונים בסיום · כל הזמנים"
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
              <Card icon="🤝" title={`מילוי זוגי של החודש · ${recs.coupleFills.monthLabel}`}
                holder={recs.coupleFills.monthTop.label}
                value={`${recs.coupleFills.monthTop.chips} ג'`}
                sub={`${recs.coupleFills.monthTop.count} מילויים · ${recs.coupleFills.monthTop.couple || ""}`}
                runner={recs.coupleFills.monthTop2 &&
                  `${recs.coupleFills.monthTop2.label} · ${recs.coupleFills.monthTop2.chips} ג' (${recs.coupleFills.monthTop2.count}×)`}
                third={recs.coupleFills.monthTop3 &&
                  `${recs.coupleFills.monthTop3.label} · ${recs.coupleFills.monthTop3.chips} ג' (${recs.coupleFills.monthTop3.count}×)`} />
            )}
            {recs.coupleFills.allTop && (
              <Card icon="🔗" title="מילוי זוגי · כל הזמנים"
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
      </div>
    </div>
  );
}


