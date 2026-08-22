"use client";

import React, { useMemo, useState } from "react";
import { C } from "./colors";
import { fmt, MONTHS } from "./format";
import { computeRecords } from "./computeRecords";
import { Empty } from "./ui";
import { festiveCardSoft, sectionTitle } from "./festive";
import { PersonalHighlightsCard } from "./PersonalHighlightsCard";

/* טאב שיאים — חולץ מ-PokerApp.jsx. */
export function RecordsTab({ db, viewerName = null, showMine = false }) {
  const [mineOnly, setMineOnly] = useState(false);
  const recs = useMemo(() => computeRecords(db), [db]);

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
            עדיין אין ערבים עם יציאת ג&apos;יטונים שמורה.
            מהערב הבא שתשמור מהלייב (או מהבוט עם סגירה) — יופיעו כאן שיאי יציאה לחודש, לשנה ולכל הזמנים.
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
          💸 שיאי טיפים
        </div>
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
              <Card icon="💎" title="הטיפ הגדול ביותר" holder={recs.tips.biggestTip.name}
                value={`${recs.tips.biggestTip.amount} ג'`} tone={C.win}
                sub={dt(recs.tips.biggestTip)} />
            )}
            {recs.tips.mostTipsNight && (
              <Card icon="🔁" title="הכי הרבה טיפים בערב אחד" holder={recs.tips.mostTipsNight.name}
                value={`${recs.tips.mostTipsNight.count} טיפים`}
                sub={dt(recs.tips.mostTipsNight)} />
            )}
            {recs.tips.mostTipChipsNight && (
              <Card icon="🪙" title="הכי הרבה ג'יטוני טיפ בערב" holder={recs.tips.mostTipChipsNight.name}
                value={`${recs.tips.mostTipChipsNight.chips} ג'`}
                sub={dt(recs.tips.mostTipChipsNight)} />
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

function ScopeChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? C.brass : C.line}`,
        background: active ? C.brass : "transparent",
        color: active ? C.feltDeep : C.dim,
        borderRadius: 999,
        padding: "5px 12px",
        fontSize: 12.5,
        fontWeight: active ? 700 : 500,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}
