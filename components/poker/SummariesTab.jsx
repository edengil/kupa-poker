"use client";

import React, { useMemo, useState } from "react";
import { C } from "../../lib/poker/colors";
import { summaryCardData } from "../../lib/poker/summaryCard";
import { buildSummaryCardSvg } from "../../lib/poker/summaryCardSvg";
import { summaryPeriods, periodToScope } from "../../lib/poker/summaryPeriods";
import { SummaryCardButton } from "./SummaryCardButton";
import { Empty } from "./ui";
import { sectionTitle } from "../../lib/poker/festive";

/* טאב סיכומים — כרטיסיות מעוצבות לתקופות שהסתיימו בלבד.
   סינון: חודשים / רבעונים / חציונים / שנים. */

const FILTERS = [
  ["month", "חודשים"],
  ["quarter", "רבעונים"],
  ["half", "חציונים"],
  ["year", "שנים"],
];

function PeriodCard({ db, period }) {
  const data = useMemo(() => summaryCardData(db, periodToScope(period)), [db, period]);
  const svg = useMemo(() => (data ? buildSummaryCardSvg(data) : null), [data]);
  if (!data || !svg) return null;
  // ה-SVG בנוי 1080x1080 — הופך אותו לרספונסיבי
  const responsive = svg.replace('width="1080" height="1080"', 'width="100%" height="auto" style="display:block"');
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        padding: 12,
        marginBottom: 14,
      }}
    >
      <div
        dangerouslySetInnerHTML={{ __html: responsive }}
        style={{ width: "100%", borderRadius: 12, overflow: "hidden" }}
      />
      <div style={{ marginTop: 10 }}>
        <SummaryCardButton db={db} scope={periodToScope(period)} />
      </div>
    </div>
  );
}

export function SummariesTab({ db }) {
  const [filter, setFilter] = useState("month");
  const periods = useMemo(() => summaryPeriods(db, filter), [db, filter]);

  return (
    <div style={{ padding: "4px 2px 20px" }}>
      <div style={sectionTitle({ margin: "12px 2px 0" })}>🃏 סיכומים</div>
      <p style={{ margin: "0 2px 10px", color: C.dim, fontSize: 12.5, lineHeight: 1.6 }}>
        כרטיסיות מעוצבות לתקופות שהסתיימו — אפשר לשתף כל אחת כתמונה.
      </p>
      <div style={{ display: "flex", gap: 6, margin: "0 2px 14px", flexWrap: "wrap" }}>
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              border: `1px solid ${filter === id ? C.brass : C.line}`,
              background: filter === id ? C.brass : "transparent",
              color: filter === id ? C.feltDeep : C.cream,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!periods.length ? (
        <Empty>אין עדיין תקופות שהסתיימו בסינון הזה 🗓️</Empty>
      ) : (
        periods.map((p) => <PeriodCard key={p.key} db={db} period={p} />)
      )}
    </div>
  );
}
