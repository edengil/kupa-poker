"use client";

import React, { useMemo, useState } from "react";
import { C } from "./colors";
import { fmt, MONTHS } from "./format";
import { AL, r2, toWhatsApp } from "./helpers";
import { allTimeTotals, monthTotals, yearTotals } from "./totals";
import { Empty, GroupLabel, IconBtn, SegBar, Select } from "./ui";
import { Award, Crown, Share2 } from "./icons";
import { ShareSheet } from "./ShareSheet";

function Ledger({ totals, official, readOnly = false }) {
  const winners = totals.filter((t) => t.amount > 0),
    losers = totals.filter((t) => t.amount < 0),
    zeros = totals.filter((t) => t.amount === 0);
  const sum = r2(totals.reduce((s, t) => s + t.amount, 0));
  const max = Math.max(1, ...totals.map((t) => Math.abs(t.amount)));

  const Row = ({ t, top }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 4px",
      }}
    >
      <span
        style={{
          flex: "0 0 96px",
          fontSize: 14,
          fontWeight: top ? 700 : 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {top && <Crown size={14} color={C.brass} />}
        {t.name}
      </span>
      <div
        style={{
          flex: 1,
          height: 7,
          borderRadius: 5,
          background: C.feltDeep,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(Math.abs(t.amount) / max) * 100}%`,
            background: t.amount >= 0 ? C.win : C.loss,
            borderRadius: 5,
          }}
        />
      </div>
      <b
        style={{
          color: t.amount >= 0 ? C.win : C.loss,
          fontVariantNumeric: "tabular-nums",
          fontSize: 15,
        }}
      >
        {fmt(t.amount)}
      </b>
    </div>
  );

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${official ? C.brassSoft : C.line}`,
        borderRadius: 14,
        padding: "8px 14px",
      }}
    >
      {winners.length > 0 && <GroupLabel>מרוויחים</GroupLabel>}
      {winners.map((t, i) => (
        <Row key={t.name} t={t} top={i === 0} />
      ))}
      {losers.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 4 }}>
          <GroupLabel>מפסידים</GroupLabel>
        </div>
      )}
      {losers.map((t) => (
        <Row key={t.name} t={t} />
      ))}
      {zeros.map((t) => (
        <Row key={t.name} t={t} />
      ))}
      {/* בדיקת הסגירה (והפער, אם יש) — עניין פנימי של המנהל. צופים מהלינק
          רואים רק את הסה"כ הרשמי כשקיים כזה. */}
      {(official || !readOnly) && (
        <div
          style={{
            borderTop: `1px solid ${C.line}`,
            marginTop: 8,
            paddingTop: 8,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12.5,
            color: official ? C.dim : sum === 0 ? C.dim : C.brass,
          }}
        >
          <span>{official ? 'סה"כ רשמי' : "בדיקת סגירה"}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {official ? fmt(sum) : sum === 0 ? "✓ 0" : `${fmt(sum)} — פער מצטבר`}
          </span>
        </div>
      )}
    </div>
  );
}

/* טאב טבלה — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function TableTab({ db, years, readOnly = false }) {
  // צופה מהלינק מתחיל בחודש הנוכחי; המנהל מתחיל בתמונה השנתית
  const [scope, setScope] = useState(readOnly ? "month" : "year");
  const [y, setY] = useState(years[0] || new Date().getFullYear());
  const [mo, setMo] = useState(() => {
    const s = [...db.sessions].sort((a, b) => b.iso.localeCompare(a.iso))[0];
    return s ? s.mo : new Date().getMonth() + 1;
  });
  const [share, setShare] = useState(false);
  const { totals, official, recCount } = useMemo(() => {
    if (scope === "all")
      return {
        totals: allTimeTotals(db),
        official: false,
        recCount: db.sessions.length,
      };
    if (scope === "year") {
      const r = yearTotals(db, y);
      return {
        ...r,
        recCount: db.sessions.filter((s) => s.y === y).length,
      };
    }
    return {
      totals: monthTotals(db, y, mo),
      official: false,
      recCount: db.sessions.filter((s) => s.y === y && s.mo === mo).length,
    };
  }, [db, scope, y, mo]);
  const yearHasOfficial = scope === "month" && db.yearly.some((x) => x.y === y && x.official);
  const title =
    scope === "all" ? "כל הזמן" : scope === "year" ? `${y}` : `${MONTHS[mo - 1]} ${y}`;

  return (
    <div style={{ marginTop: 4 }}>
      <SegBar
        value={scope}
        onChange={setScope}
        options={[
          ["month", "חודשי"],
          ["year", "שנתי"],
          ["all", "כל הזמן"],
        ]}
      />
      {scope !== "all" && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {scope === "month" && (
            <Select
              value={mo}
              onChange={setMo}
              options={MONTHS.map((m, i) => [i + 1, m])}
              label="חודש"
              grow
            />
          )}
          <Select
            value={y}
            onChange={setY}
            options={years.map((yy) => [yy, yy])}
            label="שנה"
            grow={scope === "year"}
          />
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "16px 2px 10px",
        }}
      >
        <h2
          style={{
            fontSize: 17,
            fontWeight: 700,
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {official && <Award size={16} color={C.brass} />}
          סיכום — {title}
        </h2>
        {totals.length > 0 && (
          <IconBtn onClick={() => setShare(true)}>
            <Share2 size={15} />
          </IconBtn>
        )}
      </div>
      {totals.length === 0 ? (
        <Empty text="אין נתונים לתקופה הזו." />
      ) : (
        <>
          <Ledger totals={totals} official={official} readOnly={readOnly} />
          <p
            style={{
              color: official ? C.brass : C.dim,
              fontSize: 12.5,
              marginTop: 8,
              lineHeight: 1.6,
            }}
          >
            {official ? "מאזן שנתי רשמי — גובר על סכום הערבים." : `מ־${recCount} ערבים.`}
            {yearHasOfficial && (
              <>
                <br />
                שים לב: לשנה זו יש מאזן שנתי רשמי; החודשיים לא בהכרח מסתכמים אליו.
              </>
            )}
          </p>
        </>
      )}
      {share && (
        <ShareSheet
          title={`סיכום פוקר — ${title}`}
          text={toWhatsApp(totals, null, title, AL(db), true)}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}
