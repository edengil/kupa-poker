"use client";

import React, { useMemo, useState } from "react";
import { C } from "./colors";
import { fmt } from "./format";
import { ChevronDown, AlertTriangle } from "./icons";
import { buildGapsReport, DEFAULT_LARGE_GAP } from "./gapsBoard.js";

function fmtIsoHe(iso) {
  if (!iso || typeof iso !== "string") return iso || "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${Number(d)}.${Number(m)}.${y}`;
}

/**
 * לוח פערים למנהל בלבד — עברית, מעשי, לא מפחיד.
 * מוצג רק במסכי כתיבה (OwnerApp / InputTab).
 */
export function GapsBoard({ db, minAbsGap = DEFAULT_LARGE_GAP }) {
  const [open, setOpen] = useState(false);
  const report = useMemo(
    () => buildGapsReport(db, { minAbsGap, nightLimit: 15 }),
    [db, minAbsGap]
  );

  const badge =
    (report.playerGaps.length ? 1 : 0) +
    (report.openNightsTotal ? 1 : 0) +
    (report.aliases.length ? 1 : 0);

  return (
    <div
      style={{
        marginTop: 22,
        background: C.card,
        border: `1px solid ${C.line}`,
        borderRadius: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "none",
          border: "none",
          color: C.cream,
          padding: 14,
          cursor: "pointer",
          fontSize: 14,
          fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={16} color={badge ? C.brass : C.dim} />
          דברים שכדאי לבדוק
          {badge > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.feltDeep,
                background: C.brass,
                borderRadius: 999,
                padding: "1px 7px",
              }}
            >
              {badge}
            </span>
          )}
        </span>
        <ChevronDown size={17} style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          <p style={{ fontSize: 12.5, color: C.dim, marginTop: 0, lineHeight: 1.55 }}>
            רשימה שקטה לעדכון נתונים — לא חסימה. פערים מסיכום שנתי, לילות בלי סיכום
            מהצ&apos;אט, וכינויים שכדאי ליישר.
          </p>

          <Section title="פער ערבים מול סיכום שנתי">
            {report.playerGaps.length === 0 ? (
              <Quiet>אין פערים מעל {minAbsGap}₪ — מעולה.</Quiet>
            ) : (
              <ul style={listStyle}>
                {report.playerGaps.map((p) => (
                  <li key={p.name} style={itemStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <b>{p.name}</b>
                      <span style={{ color: C.brass, fontVariantNumeric: "tabular-nums" }}>
                        פער {fmt(p.gap)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>
                      ערבים {fmt(p.sessionsNet)} · בטבלה {fmt(p.tableNet)}
                      {p.adjustments?.length
                        ? ` · שנים: ${p.adjustments.map((a) => a.y).join(", ")}`
                        : ""}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
                      כדאי לעדכן סיכום שנתי או להשלים ערבים חסרים.
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="לילות עם התחלה בלי סיכום">
            {report.openNightsTotal === 0 ? (
              <Quiet>אין לילות כאלה בנתוני הצ&apos;אט.</Quiet>
            ) : (
              <>
                <Quiet>
                  {report.openNightsTotal} לילות מהצ&apos;אט (התחלה בלי הודעת סיכום)
                  {report.openNights.length < report.openNightsTotal
                    ? ` · מוצגים ${report.openNights.length} האחרונים`
                    : ""}
                  .
                </Quiet>
                <ul style={listStyle}>
                  {report.openNights.map((n) => (
                    <li key={n.iso} style={itemStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <b>{fmtIsoHe(n.iso)}</b>
                        <span style={{ fontSize: 11.5, color: C.dim }}>
                          {n.hasSession ? "יש ערב באפליקציה" : "רק בצ&apos;אט"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
                        אם יש סיכום בכתב — אפשר להזין בטאב ההזנה.
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section title="כינויים לבדיקה">
            {report.aliases.length === 0 ? (
              <Quiet>אין כינויי משתמש חשודים.</Quiet>
            ) : (
              <ul style={listStyle}>
                {report.aliases.map((a, i) => (
                  <li key={`${a.kind}-${a.from}-${i}`} style={itemStyle}>
                    <div style={{ fontSize: 13 }}>
                      <b>
                        {String(a.from || "—")} ← {String(a.to || "—")}
                      </b>
                    </div>
                    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>{a.note}</div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          color: C.cream,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Quiet({ children }) {
  return (
    <p style={{ fontSize: 12.5, color: C.dim, margin: "0 0 4px", lineHeight: 1.5 }}>{children}</p>
  );
}

const listStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const itemStyle = {
  background: C.feltDeep,
  borderRadius: 10,
  padding: "9px 11px",
  border: `1px solid ${C.line}`,
};
