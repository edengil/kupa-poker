"use client";

import React, { useEffect, useMemo, useState } from "react";
import { buildSettlement } from "../../lib/report";
import { settle, isCashOnly, transferVerb } from "../../lib/settlement";
import { C } from "./colors";
import { fmt, MONTHS } from "./format";
import { AL, balance, canon, toWhatsApp } from "./helpers";
import { parseDate, parseEntries } from "./parse";
import { BalanceMeter } from "./chrome";
import { SegBar, Select, Tag } from "./ui";
import { CalendarDays, CheckCircle2 } from "./icons";
import { ShareSheet } from "./ShareSheet";
import { AliasCard } from "./AliasCard";
import { BackupCard } from "./BackupCard";

/* טאב הזנה — חולץ מ-PokerApp.jsx כ-JSX נקי. */
export function InputTab({ db, commit, years }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState("session");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [toast, setToast] = useState(null);
  const [splitShare, setSplitShare] = useState(null);

  useEffect(() => {
    window.__loadRaw = (r) => setText(r);
    return () => {
      delete window.__loadRaw;
    };
  }, []);

  const entries = useMemo(() => parseEntries(text), [text]);
  const bal = balance(entries);
  const date = kind === "session" ? parseDate(text, year) : null;
  const canSave = entries.length > 0 && (kind !== "session" || !!date);

  /* חלוקה ידנית מהסיכום המודבק — רשת ביטחון כשהלייב השתבש: מקלידים את
     המספרים הנכונים והחלוקה מחושבת מהם, בלי תלות במה שהבוט רשם. */
  function openSplit() {
    const norm = entries.map((e) => ({ name: canon(e.name, AL(db)), amount: e.amount }));
    const pseudo = norm.map((e) => ({
      name: e.name,
      buyin: e.amount < 0 ? -e.amount : 0,
      cashout: String(Math.max(0, e.amount)),
    }));
    const split = buildSettlement(settle(pseudo, 1), {
      isCashOnly,
      transferVerb,
    });
    setSplitShare({
      text: toWhatsApp(norm, date, null, null, true),
      split,
    });
  }

  function save() {
    if (!canSave) return;
    const rec = {
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
      raw: text.trim(),
      entries,
    };
    const next = { ...db };
    if (kind === "session") {
      Object.assign(rec, { d: date.d, mo: date.mo, y: date.y, iso: date.iso });
      next.sessions = [...db.sessions, rec].sort((a, b) => a.iso.localeCompare(b.iso));
    } else if (kind === "month") {
      Object.assign(rec, { mo: month, y: year });
      next.monthly = [...db.monthly.filter((x) => !(x.mo === month && x.y === year)), rec];
    } else {
      Object.assign(rec, { y: year, official: true });
      next.yearly = [...db.yearly.filter((x) => x.y !== year), rec];
    }
    commit(next);
    setText("");
    setToast(
      kind === "session"
        ? `נשמר ערב ${date.d}.${date.mo}`
        : kind === "month"
          ? `נשמר ${MONTHS[month - 1]} ${year}`
          : `נשמר מאזן שנתי ${year}`
    );
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div style={{ marginTop: 4 }}>
      <SegBar
        value={kind}
        onChange={setKind}
        options={[
          ["session", "ערב"],
          ["month", "חודש"],
          ["year", "שנתי"],
        ]}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {kind === "month" && (
          <Select
            value={month}
            onChange={setMonth}
            options={MONTHS.map((m, i) => [i + 1, m])}
            label="חודש"
          />
        )}
        <Select
          value={year}
          onChange={setYear}
          options={years.map((y) => [y, y])}
          label={kind === "session" ? "שנה (אם אין בטקסט)" : "שנה"}
          grow
        />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={9}
        placeholder={
          "סיכום פוקר 1.8\nעדן מגיע 125\nאופיר מגיע 180\n\nאורן חייבת 230\nדן חייב 300"
        }
        style={{
          width: "100%",
          marginTop: 10,
          resize: "vertical",
          boxSizing: "border-box",
          background: C.card,
          color: C.cream,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          padding: 14,
          fontSize: 15,
          lineHeight: 1.6,
          fontFamily: "inherit",
        }}
      />
      {kind === "year" && (
        <p style={{ fontSize: 12.5, color: C.brass, marginTop: 8 }}>
          מאזן שנתי גובר על סכום הערבים באותה שנה.
        </p>
      )}
      {entries.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {kind === "session" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
                color: date ? C.cream : C.brass,
                fontSize: 14,
              }}
            >
              <CalendarDays size={16} />
              {date ? (
                <span>
                  ערב{" "}
                  <b>
                    {date.d}.{date.mo}.{date.y}
                  </b>
                </span>
              ) : (
                <span>לא זוהה תאריך — הוסף שורה &quot;סיכום פוקר 1.8&quot;</span>
              )}
            </div>
          )}
          {kind !== "year" && <BalanceMeter bal={bal} />}
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {entries.map((e, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "9px 12px",
                  borderRadius: 9,
                  background: C.card,
                  border: `1px solid ${C.line}`,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  {canon(e.name, AL(db))}
                  {e.combined && <Tag>זוג?</Tag>}
                </span>
                <b
                  style={{
                    color: e.amount >= 0 ? C.win : C.loss,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmt(e.amount)}
                </b>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={save}
        disabled={!canSave}
        style={{
          width: "100%",
          marginTop: 14,
          padding: 14,
          borderRadius: 12,
          border: "none",
          fontSize: 16,
          fontWeight: 700,
          cursor: canSave ? "pointer" : "not-allowed",
          background: canSave ? C.brass : C.card,
          color: canSave ? C.feltDeep : C.dim,
        }}
      >
        שמור {kind === "session" ? "ערב" : kind === "month" ? "חודש" : "מאזן שנתי"}
      </button>
      {kind === "session" && entries.length > 1 && (
        <button
          onClick={openSplit}
          style={{
            width: "100%",
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            border: `1px solid ${C.brass}`,
            background: "transparent",
            color: C.brass,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          💸 חלוקה — מי מעביר למי
        </button>
      )}
      {splitShare && (
        <ShareSheet
          title="חלוקה"
          text={splitShare.text}
          settlement={splitShare.split}
          initialView="split"
          onClose={() => setSplitShare(null)}
        />
      )}
      {toast && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: C.win,
            fontSize: 14,
          }}
        >
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      <AliasCard db={db} commit={commit} />
      <BackupCard db={db} commit={commit} />
    </div>
  );
}
