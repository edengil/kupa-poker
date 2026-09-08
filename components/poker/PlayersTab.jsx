"use client";

import React, { useMemo, useState } from "react";
import { C } from "./colors";
import { fmt, MONTHS } from "./format";
import { AL, canon, r2 } from "./helpers";
import { periodTotals, yearNum } from "./totals";
import { Empty } from "./ui";
import { ChevronLeft, Crown } from "./icons";

/* טאב שחקנים — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function PlayersTab({ db, onPlayer }) {
  const A = useMemo(() => AL(db), [db]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("balance");
  const nowD = new Date();
  const [scope, setScope] = useState("all"); // all | year | month
  const [y, setY] = useState(nowD.getFullYear());
  const [mo, setMo] = useState(nowD.getMonth() + 1);

  const years = useMemo(() => {
    const set = new Set();
    for (const x of db.sessions) {
      const n = yearNum(x.y);
      if (n != null) set.add(n);
    }
    for (const x of db.yearly) {
      const n = yearNum(x.y);
      if (n != null) set.add(n);
    }
    return [...set].sort((a, b) => b - a);
  }, [db]);

  const totals = useMemo(
    () => periodTotals(db, scope, y, mo).totals,
    [db, scope, y, mo]
  );

  // ספירת הערבים חייבת להיות באותו חתך כמו הסכומים, אחרת הממוצע לא מייצג
  const counts = useMemo(() => {
    const inScope = db.sessions.filter((x) =>
      scope === "all"
        ? true
        : scope === "year"
          ? yearNum(x.y) === yearNum(y)
          : yearNum(x.y) === yearNum(y) && Number(x.mo) === Number(mo)
    );
    const c = {};
    for (const x of inScope) {
      const seen = new Set();
      for (const e of x.entries) {
        const nm = canon(e.name, A);
        if (!seen.has(nm)) {
          c[nm] = (c[nm] || 0) + 1;
          seen.add(nm);
        }
      }
    }
    return c;
  }, [db, scope, y, mo, A]);

  const visibleTotals = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("he");
    const rows = totals.filter((t) => t.name.toLocaleLowerCase("he").includes(needle));
    if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name, "he"));
    if (sort === "attendance") rows.sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0));
    return rows;
  }, [totals, counts, query, sort]);

  const sub =
    scope === "all"
      ? "2025 לפי המאזן השנתי הרשמי · שאר השנים לפי הערבים"
      : scope === "year"
        ? `כל הערבים של ${y}`
        : `${MONTHS[mo - 1]} ${y}`;

  const pill = (active) => ({
    cursor: "pointer",
    borderRadius: 999,
    padding: "6px 14px",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    background: active ? C.brass : C.card,
    color: active ? C.feltDeep : C.dim,
    border: `1px solid ${active ? C.brass : C.line}`,
  });

  const sel = {
    background: C.card,
    color: C.cream,
    border: `1px solid ${C.line}`,
    borderRadius: 999,
    padding: "6px 10px",
    fontFamily: "inherit",
    fontSize: 13,
  };

  return (
    <div style={{ marginTop: 4 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "6px 2px 4px" }}>שחקנים</h2>
      <div
        style={{
          display: "flex",
          gap: 7,
          flexWrap: "wrap",
          alignItems: "center",
          margin: "10px 2px 6px",
        }}
      >
        {["all", "year", "month"].map((k) => (
          <button key={k} type="button" onClick={() => setScope(k)} style={pill(scope === k)}>
            {k === "all" ? "הכל" : k === "year" ? "שנה" : "חודש"}
          </button>
        ))}
        {scope !== "all" && (
          <select value={y} onChange={(e) => setY(+e.target.value)} style={sel}>
            {years.map((yy) => (
              <option key={yy} value={yy}>
                {yy}
              </option>
            ))}
          </select>
        )}
        {scope === "month" && (
          <select value={mo} onChange={(e) => setMo(+e.target.value)} style={sel}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        )}
      </div>
      <p style={{ color: C.dim, fontSize: 12, margin: "0 2px 12px" }}>{sub}</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input type="search" aria-label="חיפוש שחקן" placeholder="חיפוש שחקן…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...sel, flex: 1, minWidth: 140, borderRadius: 10 }} />
        <select aria-label="מיון שחקנים" value={sort} onChange={(e) => setSort(e.target.value)} style={sel}>
          <option value="balance">לפי מאזן</option>
          <option value="attendance">לפי נוכחות</option>
          <option value="name">לפי שם</option>
        </select>
      </div>
      <p role="status" style={{ fontSize: 12, color: C.dim }}>{visibleTotals.length} שחקנים</p>
      {!visibleTotals.length ? (
        <Empty text={query ? "לא נמצאו שחקנים. נסה שם אחר." : "אין ערבים בתקופה הזאת."} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleTotals.map((t) => {
            const i = totals.indexOf(t);
            const c = counts[t.name] || 0;
            const avg = c ? r2(t.amount / c) : null;
            return (
              <button
                key={t.name}
                onClick={() => onPlayer(t.name)}
                style={{
                  textAlign: "right",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: C.card,
                  border: `1px solid ${i === 0 ? C.brass : C.line}`,
                  borderRadius: 12,
                  padding: "11px 14px",
                }}
              >
                <span
                  style={{
                    flex: "0 0 20px",
                    color: C.dim,
                    fontSize: 13,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: C.cream,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  {i === 0 && <Crown size={15} color={C.brass} />}
                  {t.name}
                </span>
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 1,
                    fontSize: 11,
                    color: C.dim,
                    lineHeight: 1.35,
                  }}
                >
                  <span>{c} ערבים</span>
                  {avg !== null && (
                    <span
                      style={{
                        color: avg >= 0 ? C.win : C.loss,
                        fontVariantNumeric: "tabular-nums",
                        opacity: 0.85,
                      }}
                    >
                      {fmt(avg)} לערב
                    </span>
                  )}
                </span>
                <b
                  style={{
                    fontSize: 16,
                    color: t.amount >= 0 ? C.win : C.loss,
                    fontVariantNumeric: "tabular-nums",
                    minWidth: 62,
                    textAlign: "left",
                  }}
                >
                  {fmt(t.amount)}
                </b>
                <ChevronLeft size={16} color={C.dim} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
