"use client";

import React, { useMemo } from "react";
import { C } from "./colors";
import { fmt, MONTHS } from "./format";
import { AL, canon, r2 } from "./helpers";
import { yearTotals, monthTotals, allTimeTotals } from "./totals";
import { brokenRecords } from "./brokenRecords";
import { computeChipRecords } from "./chipRecords";
import { computeTipRecords } from "./tipRecords";
import { computeCoupleFillRecords } from "./coupleFills";
import { Empty } from "./ui";
import { festiveCardSoft, sectionTitle } from "./festive";

/* טאב שיאים — חולץ מ-PokerApp.jsx. */
export function RecordsTab({ db }) {
  const A = AL(db);
  const recs = useMemo(() => {
    const sessions = [...db.sessions].sort((a, b) => a.iso.localeCompare(b.iso));
    if (!sessions.length) return null;

    // סכום לילה לכל שחקן, לכל ערב
    const perNight = sessions.map(s => {
      const t = {};
      for (const e of s.entries) {
        const nm = canon(e.name, A);
        t[nm] = r2((t[nm] || 0) + e.amount);
      }
      return { iso: s.iso, d: s.d, mo: s.mo, y: s.y, totals: t };
    });

    let stormyNight = null;
    const nightList = []; // כל תוצאה של כל שחקן בכל ערב — למציאת שיא + סגן
    const history = {}; // name -> [amount, amount...] כרונולוגי
    const monthAgg = {}; // "name|y-mo" -> סכום החודש לשחקן
    const attend = {}; // name -> {cur, max} — נוכחות בערבים רצופים

    for (const n of perNight) {
      let moved = 0;
      const present = new Set(Object.keys(n.totals));
      for (const [nm, amount] of Object.entries(n.totals)) {
        (history[nm] = history[nm] || []).push(amount);
        nightList.push({ name: nm, amount, d: n.d, mo: n.mo, y: n.y });
        if (amount > 0) moved = r2(moved + amount);
        const mk = `${nm}|${n.y}-${n.mo}`;
        monthAgg[mk] = r2((monthAgg[mk] || 0) + amount);
        const at = attend[nm] = attend[nm] || { cur: 0, max: 0 };
        at.cur += 1;
        if (at.cur > at.max) at.max = at.cur;
      }
      for (const nm of Object.keys(attend)) if (!present.has(nm)) attend[nm].cur = 0;
      // "הערב הסוער" — כמה כסף החליף ידיים (סכום הזכיות של אותו ערב)
      if (!stormyNight || moved > stormyNight.moved) stormyNight = { moved, d: n.d, mo: n.mo, y: n.y };
    }

    // ערבי השיא — הטוב והקשה, עם סגן וארד
    nightList.sort((a, b) => b.amount - a.amount);
    const bestNight = nightList[0] || null;
    const bestNight2 = nightList[1] || null;
    const bestNight3 = nightList[2] || null;
    const worstNight = nightList[nightList.length - 1] || null;
    const worstNight2 = nightList[nightList.length - 2] || null;
    const worstNight3 = nightList[nightList.length - 3] || null;

    /* סטטיסטיקה פר שחקן — הכל מ-history הכרונולוגי: רצפים, אחוז ניצחונות,
       ממוצע, תנודתיות (סטיית תקן) והקאמבק. מחושב פעם אחת ואז ממוינים
       לכל שיא בנפרד, כך שקל לשלוף גם את הסגן. */
    const MIN_NIGHTS = 5;
    const stats = Object.entries(history).map(([nm, arr]) => {
      let cur = 0, max = 0, lcur = 0, lmax = 0;
      for (const v of arr) {
        cur = v > 0 ? cur + 1 : 0;
        if (cur > max) max = cur;
        lcur = v < 0 ? lcur + 1 : 0;
        if (lcur > lmax) lmax = lcur;
      }
      let tail = 0;
      for (let i = arr.length - 1; i >= 0 && arr[i] > 0; i--) tail++;
      let comeback = null;
      for (let i = 1; i < arr.length; i++) {
        if (arr[i - 1] < 0 && arr[i] > 0) {
          const jump = r2(arr[i] - arr[i - 1]);
          if (!comeback || jump > comeback.jump) comeback = { jump, from: arr[i - 1], to: arr[i] };
        }
      }
      const wins = arr.filter(v => v > 0).length;
      const sum = r2(arr.reduce((s, v) => s + v, 0));
      const avg = r2(sum / arr.length);
      const sd = Math.round(Math.sqrt(arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length));
      return {
        name: nm, nights: arr.length, wins, sum, avg, sd,
        rate: Math.round(wins / arr.length * 100),
        maxStreak: max, tail, lossMax: lmax, comeback,
        attendMax: attend[nm]?.max || 0,
      };
    });

    // שלושה הראשונים לפי מדד — [שיאן, סגן, ארד]
    const top3 = (key, filter = () => true) => {
      const s = stats.filter(filter).sort((a, b) => key(b) - key(a));
      return [s[0] || null, s[1] || null, s[2] || null];
    };

    const [bestStreak, bestStreak2, bestStreak3] = top3(s => s.maxStreak, s => s.maxStreak >= 2);
    const [liveStreak] = top3(s => s.tail, s => s.tail >= 2);
    const [lossStreak, lossStreak2, lossStreak3] = top3(s => s.lossMax, s => s.lossMax >= 3);
    const [winRate, winRate2, winRate3] = top3(s => s.rate, s => s.nights >= MIN_NIGHTS);
    const [bestAvg, bestAvg2, bestAvg3] = top3(s => s.avg, s => s.nights >= MIN_NIGHTS && s.avg > 0);
    const [mostWins, mostWins2, mostWins3] = top3(s => s.wins);
    const [most, most2, most3] = top3(s => s.nights);
    const [attendTop, attendTop2, attendTop3] = top3(s => s.attendMax, s => s.attendMax >= 3);
    const [roller] = top3(s => s.sd, s => s.nights >= MIN_NIGHTS);
    const comeback = stats.reduce(
      (m, s) => s.comeback && (!m || s.comeback.jump > m.jump) ? { name: s.name, ...s.comeback } : m,
      null
    );

    // החודש הטוב אי פעם — שחקן + חודש עם הנטו הגבוה ביותר
    let bestMonth = null;
    for (const [key, amount] of Object.entries(monthAgg)) {
      if (!bestMonth || amount > bestMonth.amount) {
        const [nm, ym] = key.split("|");
        const [yy, mm] = ym.split("-");
        bestMonth = { name: nm, amount, y: +yy, mo: +mm };
      }
    }

    // מלך המלכים — מי סיים הכי הרבה חודשים במקום הראשון
    const bestOfMonth = {};
    for (const [key, amount] of Object.entries(monthAgg)) {
      const [nm, ym] = key.split("|");
      if (!bestOfMonth[ym] || amount > bestOfMonth[ym].amount) bestOfMonth[ym] = { name: nm, amount };
    }
    const crownCount = {};
    for (const b of Object.values(bestOfMonth)) crownCount[b.name] = (crownCount[b.name] || 0) + 1;
    const crowns = Object.entries(crownCount).sort((a, b) => b[1] - a[1]);

    // השנה הטובה אי פעם — לפי המאזן הרשמי כשקיים
    const yearsSet = new Set([...sessions.map(s => s.y), ...db.yearly.map(x => x.y)]);
    let bestYear = null;
    for (const y of yearsSet) {
      for (const t of yearTotals(db, y).totals) {
        if (!bestYear || t.amount > bestYear.amount) bestYear = { name: t.name, amount: t.amount, y };
      }
    }

    // מלכי התקופה: החודש האחרון שיש בו ערבים, השנה, וכל הזמנים
    const last = sessions[sessions.length - 1];
    const monthT = monthTotals(db, last.y, last.mo);
    const yearT = yearTotals(db, last.y).totals;
    const allT = allTimeTotals(db);

    /* הערב האחרון — תמיד מעניין מה קרה הרגע: מי לקח, מי נתן, כמה עבר
       ידיים, והאם נשברו שיאים (אותה בדיקה שמפעילה את ההכרזה בוואטסאפ). */
    const lastN = perNight[perNight.length - 1];
    const lastRows = Object.entries(lastN.totals).sort((a, b) => b[1] - a[1]);
    let lastBroken = [];
    try {
      lastBroken = brokenRecords({ ...db, sessions: sessions.slice(0, -1) }, last);
    } catch {}
    const topRow = lastRows[0] && lastRows[0][1] > 0 ? { name: lastRows[0][0], amount: lastRows[0][1] } : null;
    const prevOfTop = topRow
      ? perNight.slice(0, -1).map(n => n.totals[topRow.name]).filter(v => v != null)
      : [];
    const lastNight = {
      label: `${lastN.d}.${lastN.mo}.${String(lastN.y).slice(2)}`,
      count: lastRows.length,
      top: topRow,
      bottom: lastRows.length && lastRows[lastRows.length - 1][1] < 0
        ? { name: lastRows[lastRows.length - 1][0], amount: lastRows[lastRows.length - 1][1] }
        : null,
      moved: r2(lastRows.reduce((s, [, v]) => s + (v > 0 ? v : 0), 0)),
      personalBest: !!(topRow && prevOfTop.length >= 3 && topRow.amount > Math.max(...prevOfTop)),
      broken: lastBroken,
    };

    return {
      lastNight,
      bestNight, bestNight2, bestNight3, worstNight, worstNight2, worstNight3,
      bestStreak, bestStreak2, bestStreak3, liveStreak, lossStreak, lossStreak2, lossStreak3,
      winRate, winRate2, winRate3, bestAvg, bestAvg2, bestAvg3, mostWins, mostWins2, mostWins3,
      comeback, stormyNight, bestMonth, bestYear, roller,
      attendTop, attendTop2, attendTop3,
      crownKing: crowns[0] ? { name: crowns[0][0], count: crowns[0][1] } : null,
      crownKing2: crowns[1] ? { name: crowns[1][0], count: crowns[1][1] } : null,
      crownKing3: crowns[2] ? { name: crowns[2][0], count: crowns[2][1] } : null,
      monthKing: monthT[0] || null, monthKing2: monthT[1] || null, monthKing3: monthT[2] || null,
      monthLabel: `${MONTHS[last.mo - 1]} ${last.y}`,
      yearKing: yearT[0] || null, yearKing2: yearT[1] || null, yearKing3: yearT[2] || null, yearLabel: `${last.y}`,
      allKing: allT[0] || null, allKing2: allT[1] || null, allKing3: allT[2] || null,
      most, most2, most3,
      totalNights: sessions.length,
      chips: computeChipRecords(db),
      tips: computeTipRecords(db),
      coupleFills: computeCoupleFillRecords(db),
    };
  }, [db]);

  if (!recs) return <Empty text="עוד אין ערבים — אין שיאים." />;

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
